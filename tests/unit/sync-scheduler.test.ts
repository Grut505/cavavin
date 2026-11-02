import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncScheduler, type SchedulerRepo } from '../../src/data/sync-scheduler';
import type { SyncReport } from '../../src/data/sync-engine';

const REPORT: SyncReport = { pushed: 1, notices: 0, healed: 0 };

class FakeRepo implements SchedulerRepo {
  pending = 0;
  last: string | undefined;
  noticeCount = 0;
  writers = new Set<() => void>();
  calls: number[] = [];
  /** Comportement de chaque appel à `sync()` (le dernier est répété). */
  script: (() => Promise<SyncReport>)[] = [];
  sync = vi.fn(async () => {
    this.calls.push(Date.now());
    const step = this.script.length > 1 ? this.script.shift()! : this.script[0];
    if (!step) return REPORT;
    return step();
  });
  /** Quand il est défini, `pendingCount()` attend : permet de figer une tentative en cours. */
  gate: Promise<void> | null = null;
  async pendingCount() {
    if (this.gate) await this.gate;
    return this.pending;
  }
  async lastSyncAt() {
    return this.last;
  }
  async notices() {
    return Array.from({ length: this.noticeCount });
  }
  onWrite(fn: () => void) {
    this.writers.add(fn);
    return () => this.writers.delete(fn);
  }
  write() {
    this.pending++;
    this.writers.forEach((w) => w());
  }
}

const ok = (): Promise<SyncReport> => Promise.resolve(REPORT);
const fail = (kind: string, message = kind) => (): Promise<SyncReport> => Promise.reject(Object.assign(new Error(message), { kind }));

interface Env {
  repo: FakeRepo;
  sched: SyncScheduler;
  events: EventTarget;
  doc: EventTarget & { visibilityState: string };
  state: { online: boolean; token: boolean; authListener?: () => void };
}

function setup(opts: { online?: boolean; token?: boolean; maxBackoffMs?: number } = {}): Env {
  const repo = new FakeRepo();
  repo.script = [ok];
  const events = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const state = { online: opts.online ?? true, token: opts.token ?? true } as Env['state'];
  const sched = new SyncScheduler({
    repo,
    hasToken: () => state.token,
    isOnline: () => state.online,
    onAuthChange: (fn) => {
      state.authListener = fn;
      return () => (state.authListener = undefined);
    },
    events,
    doc,
    maxBackoffMs: opts.maxBackoffMs,
  });
  return { repo, sched, events, doc, state };
}

const tick = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('démarrage et écritures', () => {
  it('synchronise à l’ouverture, puis indique « à jour »', async () => {
    const { repo, sched } = setup();
    repo.last = '2026-11-02T10:00:00Z';
    sched.start();
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    expect(sched.status()).toMatchObject({ state: 'synced', pending: 0, lastSyncAt: '2026-11-02T10:00:00Z' });
  });

  it('regroupe les écritures proches en une seule synchronisation, après 2 secondes', async () => {
    const { repo, sched } = setup();
    sched.start();
    await tick(20_000);
    repo.sync.mockClear();
    repo.write();
    await tick(500);
    repo.write();
    await tick(500);
    repo.write();
    await tick(900);
    expect(repo.sync).not.toHaveBeenCalled();
    expect(sched.status().state).toBe('pending');
    expect(sched.status().pending).toBe(3);
    repo.pending = 0;
    await tick(200);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    await tick(60_000);
    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('espace deux synchronisations d’au moins 15 secondes', async () => {
    const { repo, sched } = setup();
    sched.start();
    await tick(0);
    const first = repo.calls[0]!;
    repo.write();
    repo.pending = 0;
    await tick(10_000);
    expect(repo.calls).toHaveLength(1);
    await tick(5_100);
    expect(repo.calls).toHaveLength(2);
    expect(repo.calls[1]! - first).toBeGreaterThanOrEqual(15_000);
  });

  it('enchaîne quand des écritures arrivent pendant une synchronisation', async () => {
    const { repo, sched } = setup();
    let release!: () => void;
    repo.script = [() => new Promise<SyncReport>((r) => (release = () => r(REPORT))), ok];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('syncing');
    repo.write();
    release();
    repo.pending = 0;
    await tick(100);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    await tick(15_000);
    expect(repo.sync).toHaveBeenCalledTimes(2);
  });

  it('reste « en attente » tant qu’il reste des modifications à envoyer', async () => {
    const { repo, sched } = setup();
    repo.pending = 2;
    sched.start();
    await tick(0);
    expect(sched.status()).toMatchObject({ state: 'pending', pending: 2 });
    await tick(16_000);
    expect(repo.sync.mock.calls.length).toBeGreaterThanOrEqual(2); // il réessaie
  });
});

describe('réseau et session', () => {
  it('hors-ligne : aucune tentative, état « hors-ligne » ; au retour du réseau, synchro immédiate', async () => {
    const { repo, sched, events, state } = setup({ online: false });
    repo.pending = 3;
    sched.start();
    await tick(60_000);
    expect(repo.sync).not.toHaveBeenCalled();
    expect(sched.status()).toMatchObject({ state: 'offline', pending: 3 });
    state.online = true;
    repo.pending = 0;
    events.dispatchEvent(new Event('online'));
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    expect(sched.status().state).toBe('synced');
  });

  it('une demande arrivée pendant qu’une tentative « hors-ligne » se termine n’est pas perdue', async () => {
    const { repo, sched, events, state } = setup({ online: false });
    let release!: () => void;
    repo.gate = new Promise<void>((r) => (release = r));
    sched.start();
    await tick(0); // la tentative d'ouverture démarre, constate « hors-ligne » et attend (état figé)
    expect(repo.sync).not.toHaveBeenCalled();
    state.online = true;
    events.dispatchEvent(new Event('online')); // arrive pendant que la tentative est encore en cours
    repo.gate = null;
    release();
    await tick(0);
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    expect(sched.status().state).toBe('synced');
  });

  it('idem pour une session retrouvée pendant une tentative « non connecté »', async () => {
    const { repo, sched, state } = setup({ token: false });
    let release!: () => void;
    repo.gate = new Promise<void>((r) => (release = r));
    sched.start();
    await tick(0);
    state.token = true;
    state.authListener?.();
    repo.gate = null;
    release();
    await tick(0);
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    expect(sched.status().state).toBe('synced');
  });

  it('une demande arrivée pendant une synchronisation en erreur ne court-circuite pas le recul', async () => {
    const { repo, sched } = setup();
    let fail!: () => void;
    repo.script = [() => new Promise<SyncReport>((_, rej) => (fail = () => rej(Object.assign(new Error('x'), { kind: 'server' })))), ok];
    sched.start();
    await tick(0);
    repo.write(); // une écriture arrive pendant l'envoi
    fail();
    await tick(100);
    expect(repo.sync).toHaveBeenCalledTimes(1); // pas de relance immédiate
    await tick(15_000);
    expect(repo.sync).toHaveBeenCalledTimes(2); // relance au terme du recul de 15 s
  });

  it('le retour du réseau ignore la cadence minimale', async () => {
    const { repo, sched, events } = setup();
    sched.start();
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    events.dispatchEvent(new Event('online'));
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(2);
  });

  it('passer hors-ligne met à jour l’état sans tentative', async () => {
    const { repo, sched, events, state } = setup();
    sched.start();
    await tick(0);
    state.online = false;
    events.dispatchEvent(new Event('offline'));
    await tick(0);
    expect(sched.status().state).toBe('offline');
    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('sans session Google : état « non connecté », puis synchro dès la connexion', async () => {
    const { repo, sched, state } = setup({ token: false });
    sched.start();
    await tick(30_000);
    expect(repo.sync).not.toHaveBeenCalled();
    expect(sched.status().state).toBe('auth');
    state.token = true;
    state.authListener?.();
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    expect(sched.status().state).toBe('synced');
  });

  it('une session expirée (401) arrête les tentatives sans rien perdre', async () => {
    const { repo, sched } = setup();
    repo.script = [fail('auth')];
    repo.pending = 2;
    sched.start();
    await tick(0);
    expect(sched.status()).toMatchObject({ state: 'auth', pending: 2 });
    await tick(10 * 60_000);
    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('une AuthError du client est traitée comme une session expirée', async () => {
    const { repo, sched } = setup();
    repo.script = [() => Promise.reject(Object.assign(new Error('expirée'), { name: 'AuthError' }))];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('auth');
  });

  it('un accès refusé (403) arrête aussi les tentatives', async () => {
    const { repo, sched } = setup();
    repo.script = [fail('forbidden')];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('denied');
    await tick(10 * 60_000);
    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('reprend quand l’utilisateur se reconnecte après une session expirée', async () => {
    const { repo, sched, state } = setup();
    repo.script = [fail('auth'), ok];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('auth');
    state.authListener?.();
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(2);
    expect(sched.status().state).toBe('synced');
  });

  it('au retour au premier plan, synchronise en respectant la cadence', async () => {
    const { repo, sched, doc } = setup();
    sched.start();
    await tick(0);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await tick(20_000);
    expect(repo.sync).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await tick(0);
    expect(repo.sync).toHaveBeenCalledTimes(2);
  });
});

describe('erreurs et recul progressif', () => {
  it('réessaie après 15 s, 30 s, 1 min… puis repart de zéro après un succès', async () => {
    const { repo, sched } = setup();
    repo.script = [fail('server'), fail('quota'), fail('server'), ok];
    sched.start();
    await tick(0);
    const t0 = repo.calls[0]!;
    await tick(14_900);
    expect(repo.calls).toHaveLength(1);
    await tick(200);
    expect(repo.calls).toHaveLength(2);
    expect(repo.calls[1]! - t0).toBeGreaterThanOrEqual(15_000);
    await tick(29_000);
    expect(repo.calls).toHaveLength(2);
    await tick(2_000);
    expect(repo.calls).toHaveLength(3);
    expect(repo.calls[2]! - repo.calls[1]!).toBeGreaterThanOrEqual(30_000);
    await tick(61_000);
    expect(repo.calls).toHaveLength(4);
    expect(repo.calls[3]! - repo.calls[2]!).toBeGreaterThanOrEqual(60_000);
    expect(sched.status().state).toBe('synced');
    // Une nouvelle erreur repart de 15 s.
    repo.script = [fail('server'), ok];
    repo.write();
    repo.pending = 0;
    await tick(16_000);
    const failedAt = repo.calls.at(-1)!;
    await tick(16_000);
    expect(repo.calls.at(-1)! - failedAt).toBeLessThan(20_000);
  });

  it('plafonne le recul', async () => {
    const { repo, sched } = setup({ maxBackoffMs: 60_000 });
    repo.script = [fail('server')];
    sched.start();
    await tick(10 * 60_000);
    const gaps = repo.calls.slice(1).map((t, i) => t - repo.calls[i]!);
    expect(gaps.length).toBeGreaterThan(5);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60_100);
    expect(gaps.at(-1)!).toBeGreaterThanOrEqual(59_000);
  });

  it('une erreur réseau est présentée comme « hors-ligne » ; les autres comme « erreur » avec leur message', async () => {
    const a = setup();
    a.repo.script = [fail('network')];
    a.sched.start();
    await tick(0);
    expect(a.sched.status().state).toBe('offline');

    const b = setup();
    b.repo.script = [fail('other', 'La feuille n’est pas initialisée')];
    b.sched.start();
    await tick(0);
    expect(b.sched.status()).toMatchObject({ state: 'error', message: 'La feuille n’est pas initialisée' });
  });

  it('le retour du réseau remet le compteur d’échecs à zéro', async () => {
    const { repo, sched, events } = setup();
    repo.script = [fail('network'), fail('network'), fail('network'), ok];
    sched.start();
    await tick(0);
    await tick(16_000); // 2e échec : prochain recul 30 s
    events.dispatchEvent(new Event('online'));
    await tick(0);
    expect(repo.calls).toHaveLength(3);
    await tick(16_000); // un recul de 15 s (repart de zéro) a suffi
    expect(repo.calls).toHaveLength(4);
    expect(sched.status().state).toBe('synced');
  });
});

describe('synchronisation manuelle', () => {
  it('passe outre la cadence et le recul, et rend le rapport', async () => {
    const { repo, sched } = setup();
    repo.script = [fail('server'), ok];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('error');
    const report = await sched.syncNow();
    expect(report).toEqual(REPORT);
    expect(repo.sync).toHaveBeenCalledTimes(2);
    expect(sched.status().state).toBe('synced');
  });

  it('regroupe les demandes simultanées en une seule synchronisation', async () => {
    const { repo, sched } = setup();
    let release!: () => void;
    repo.script = [() => new Promise<SyncReport>((r) => (release = () => r(REPORT)))];
    const a = sched.syncNow();
    const b = sched.syncNow();
    await tick(0);
    release();
    await Promise.all([a, b]);
    expect(repo.sync).toHaveBeenCalledTimes(1);
  });

  it('retente après un accès refusé ou une session expirée quand l’utilisateur le demande', async () => {
    const { repo, sched } = setup();
    repo.script = [fail('forbidden'), ok];
    sched.start();
    await tick(0);
    expect(sched.status().state).toBe('denied');
    await sched.syncNow();
    expect(sched.status().state).toBe('synced');
  });

  it('sans session ni réseau, ne tente rien', async () => {
    const off = setup({ online: false });
    expect(await off.sched.syncNow()).toBeNull();
    const noTok = setup({ token: false });
    expect(await noTok.sched.syncNow()).toBeNull();
    expect(noTok.sched.status().state).toBe('auth');
    expect(off.repo.sync).not.toHaveBeenCalled();
  });
});

describe('état et abonnements', () => {
  it('expose les compteurs et prévient les abonnés', async () => {
    const { repo, sched } = setup();
    repo.noticeCount = 2;
    repo.last = '2026-11-02T09:00:00Z';
    const seen: string[] = [];
    sched.subscribe(() => seen.push(sched.status().state));
    sched.start();
    await tick(0);
    expect(sched.status()).toMatchObject({ notices: 2, lastSyncAt: '2026-11-02T09:00:00Z' });
    expect(seen).toContain('syncing');
    expect(seen.at(-1)).toBe('synced');
  });

  it('stop() retire les écouteurs et annule les cycles prévus', async () => {
    const { repo, sched, events } = setup();
    sched.start();
    await tick(0);
    repo.sync.mockClear();
    repo.write();
    sched.stop();
    events.dispatchEvent(new Event('online'));
    repo.write();
    await tick(60_000);
    expect(repo.sync).not.toHaveBeenCalled();
    expect(repo.writers.size).toBe(0);
  });
});
