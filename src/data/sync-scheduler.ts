// Ordonnanceur de synchronisation (FR-014, FR-015) : lance la synchro au bon moment, sans jamais
// bloquer l'utilisateur, avec une cadence minimale et un recul progressif en cas d'erreur.
import type { SyncReport } from './sync-engine';

export type SyncState =
  | 'synced' // tout est à jour
  | 'pending' // des modifications attendent d'être envoyées
  | 'syncing' // synchronisation en cours
  | 'offline' // pas de réseau (ou Google injoignable)
  | 'auth' // session Google absente ou expirée : reconnexion nécessaire
  | 'denied' // le compte n'a pas accès à la feuille
  | 'error'; // autre erreur (feuille non initialisée, schéma plus récent…)

export interface SyncStatus {
  state: SyncState;
  /** Modifications locales pas encore envoyées. */
  pending: number;
  /** Dernière synchronisation réussie (ISO), si elle a déjà eu lieu. */
  lastSyncAt: string | null;
  /** Avis non acquittés (conflits résolus, quantités plafonnées). */
  notices: number;
  /** Message d'erreur lisible pour l'état `error`. */
  message: string | null;
}

export interface SchedulerRepo {
  sync(): Promise<SyncReport>;
  pendingCount(): Promise<number>;
  lastSyncAt(): Promise<string | undefined>;
  notices(): Promise<unknown[]>;
  onWrite(fn: () => void): () => void;
}

export interface SchedulerDeps {
  repo: SchedulerRepo;
  hasToken: () => boolean;
  isOnline?: () => boolean;
  /** S'abonne aux changements de session Google ; retourne la fonction de désabonnement. */
  onAuthChange?: (fn: () => void) => () => void;
  now?: () => number;
  /** Délai après une écriture locale avant d'envoyer (regroupe les écritures proches). */
  debounceMs?: number;
  /** Délai minimal entre deux cycles de synchronisation. */
  minIntervalMs?: number;
  /** Plafond du recul progressif en cas d'erreur. */
  maxBackoffMs?: number;
  /** Cible des événements `online` / `offline` (window). */
  events?: EventTarget;
  /** Cible de `visibilitychange` (document). */
  doc?: EventTarget & { visibilityState?: string };
}

type Reason = 'start' | 'write' | 'online' | 'visible' | 'auth' | 'retry';

export class SyncScheduler {
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly minIntervalMs: number;
  private readonly maxBackoffMs: number;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private timerAt = Infinity;
  private current: Promise<SyncReport | null> | null = null;
  /** Vrai seulement pendant un envoi réel (pas pendant les sorties anticipées : hors-ligne, non connecté). */
  private active = false;
  private again = false;
  private lastAttemptEnd = -Infinity;
  private failures = 0;
  private blocked: 'auth' | 'denied' | null = null;
  private lastError: string | null = null;
  private stopFns: (() => void)[] = [];
  private snapshot: SyncStatus = { state: 'synced', pending: 0, lastSyncAt: null, notices: 0, message: null };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: SchedulerDeps) {
    this.isOnline = deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    this.now = deps.now ?? (() => Date.now());
    this.debounceMs = deps.debounceMs ?? 2000;
    this.minIntervalMs = deps.minIntervalMs ?? 15_000;
    this.maxBackoffMs = deps.maxBackoffMs ?? 5 * 60_000;
  }

  // --- cycle de vie ---

  /** Branche les écouteurs et lance la synchronisation d'ouverture. */
  start(): void {
    const { repo, events, doc, onAuthChange } = this.deps;
    this.stopFns.push(repo.onWrite(() => this.request('write')));
    if (events) {
      const online = (): void => {
        this.failures = 0; // le réseau est revenu : on repart de zéro
        this.request('online');
      };
      const offline = (): void => void this.refresh();
      events.addEventListener('online', online);
      events.addEventListener('offline', offline);
      this.stopFns.push(() => events.removeEventListener('online', online), () => events.removeEventListener('offline', offline));
    }
    if (doc) {
      const visible = (): void => {
        if (doc.visibilityState === undefined || doc.visibilityState === 'visible') this.request('visible');
      };
      doc.addEventListener('visibilitychange', visible);
      this.stopFns.push(() => doc.removeEventListener('visibilitychange', visible));
    }
    if (onAuthChange) {
      this.stopFns.push(
        onAuthChange(() => {
          if (this.deps.hasToken()) {
            this.blocked = null;
            this.failures = 0;
            this.request('auth');
          } else {
            void this.refresh();
          }
        }),
      );
    }
    void this.refresh();
    this.request('start');
  }

  stop(): void {
    this.stopFns.forEach((f) => f());
    this.stopFns = [];
    this.clearTimer();
  }

  // --- état ---

  status(): SyncStatus {
    return this.snapshot;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Recalcule l'état (compteurs, dernière synchro) et prévient les abonnés. */
  async refresh(): Promise<void> {
    const { repo } = this.deps;
    const [pending, last, notices] = await Promise.all([repo.pendingCount(), repo.lastSyncAt(), repo.notices()]);
    let state: SyncState;
    if (this.blocked === 'denied') state = 'denied';
    else if (this.active) state = 'syncing';
    else if (!this.isOnline()) state = 'offline';
    else if (this.blocked === 'auth' || !this.deps.hasToken()) state = 'auth';
    else if (this.lastError !== null) state = this.failures > 0 && this.lastError === 'network' ? 'offline' : 'error';
    else state = pending > 0 ? 'pending' : 'synced';
    this.snapshot = {
      state,
      pending,
      lastSyncAt: last ?? null,
      notices: notices.length,
      message: state === 'error' ? this.lastError : null,
    };
    this.listeners.forEach((l) => l());
  }

  // --- planification ---

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = Infinity;
  }

  /** Programme un cycle à l'instant `at`, en gardant le plus proche si un cycle est déjà prévu. */
  private scheduleAt(at: number): void {
    if (this.timer !== undefined && this.timerAt <= at) return;
    this.clearTimer();
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.timerAt = Infinity;
      void this.run();
    }, Math.max(0, at - this.now()));
  }

  private request(reason: Reason): void {
    if (this.current) {
      this.again = true; // un cycle est en cours : on enchaînera dès qu'il se termine
      return;
    }
    const now = this.now();
    // Cadence minimale entre deux cycles (hors reprise immédiate demandée par le réseau ou la session).
    const spaced = this.lastAttemptEnd + this.minIntervalMs;
    switch (reason) {
      case 'write':
        this.scheduleAt(Math.max(now + this.debounceMs, spaced));
        break;
      case 'start':
      case 'visible':
        this.scheduleAt(Math.max(now, spaced));
        break;
      case 'online':
      case 'auth':
      case 'retry':
        this.scheduleAt(now);
        break;
    }
    void this.refresh();
  }

  /** Synchronisation demandée par l'utilisateur : tout de suite, sans attendre la cadence ni le recul. */
  async syncNow(): Promise<SyncReport | null> {
    this.clearTimer();
    this.failures = 0;
    if (this.blocked === 'auth' && this.deps.hasToken()) this.blocked = null;
    if (this.blocked === 'denied') this.blocked = null; // l'utilisateur réessaie : on laisse Google répondre
    return this.run();
  }

  private run(): Promise<SyncReport | null> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = this.attempt().finally(() => {
      this.current = null;
      // Une demande (retour du réseau, session retrouvée…) arrivée pendant une tentative qui s'est
      // terminée sans rien envoyer (hors-ligne, non connecté) ne doit pas être perdue.
      if (this.again) {
        this.again = false;
        // Sauf si un cycle est déjà prévu (ex. le recul après une erreur, qu'on ne court-circuite pas).
        if (this.timer === undefined) this.scheduleAt(this.now());
      }
    });
    return this.current;
  }

  private async attempt(): Promise<SyncReport | null> {
    if (!this.isOnline()) {
      await this.refresh();
      return null;
    }
    if (!this.deps.hasToken() || this.blocked === 'auth') {
      this.blocked = 'auth';
      await this.refresh();
      return null;
    }
    if (this.blocked === 'denied') {
      await this.refresh();
      return null;
    }

    let report: SyncReport | null = null;
    this.again = false;
    this.active = true;
    this.snapshot = { ...this.snapshot, state: 'syncing', message: null };
    this.listeners.forEach((l) => l());
    try {
      report = await this.deps.repo.sync();
      this.failures = 0;
      this.lastError = null;
      this.blocked = null;
    } catch (e) {
      this.handleError(e);
    } finally {
      this.active = false;
    }
    this.lastAttemptEnd = this.now();
    await this.refresh();

    // Écritures survenues pendant la synchro : on enchaîne (en respectant la cadence).
    if (!this.blocked && this.lastError === null && (this.again || this.snapshot.pending > 0)) {
      this.again = false;
      this.scheduleAt(Math.max(this.now() + this.debounceMs, this.lastAttemptEnd + this.minIntervalMs));
    }
    return report;
  }

  private handleError(e: unknown): void {
    const err = e as { kind?: string; name?: string; message?: string };
    if (err.kind === 'auth' || err.name === 'AuthError') {
      this.blocked = 'auth';
      this.lastError = null;
      return;
    }
    if (err.kind === 'forbidden') {
      this.blocked = 'denied';
      this.lastError = null;
      return;
    }
    this.failures++;
    this.lastError = err.kind === 'network' ? 'network' : (err.message ?? 'Erreur de synchronisation');
    // Recul progressif : 15 s, 30 s, 1 min, 2 min… plafonné.
    const delay = Math.min(this.maxBackoffMs, this.minIntervalMs * 2 ** (this.failures - 1));
    this.scheduleAt(this.now() + delay);
  }
}
