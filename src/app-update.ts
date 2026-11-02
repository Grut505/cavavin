// Mises à jour de l'application installée (PWA) : détection, application automatique juste après l'ouverture,
// sinon proposition dans un bandeau ; contrôle manuel et secours « forcer » pour un cache bloqué.
export type RegisterSW = (opts: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

export interface UpdateState {
  /** Une nouvelle version est téléchargée et attend d'être activée. */
  needRefresh: boolean;
  /** Dernier contrôle (ms depuis 1970). */
  checkedAt: number | null;
}

/** Au-delà de ce délai après l'ouverture, on ne recharge plus sans demander (l'utilisateur est peut-être en train de saisir). */
export const AUTO_APPLY_WITHIN_MS = 15_000;
const CHECK_EVERY_MS = 30 * 60_000;

let state: UpdateState = { needRefresh: false, checkedAt: null };
let activate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((l) => l());
const set = (next: Partial<UpdateState>): void => {
  state = { ...state, ...next };
  emit();
};

export const updateState = (): UpdateState => state;

export function onUpdateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** À appeler une fois au démarrage, avec `registerSW` de `virtual:pwa-register`. */
export function startUpdates(
  register: RegisterSW,
  opts: { now?: () => number; doc?: Document; win?: Window } = {},
): void {
  const now = opts.now ?? Date.now;
  const doc = opts.doc ?? document;
  const win = opts.win ?? window;
  const openedAt = now();

  activate = register({
    immediate: true,
    onNeedRefresh: () => {
      set({ needRefresh: true });
      // Tout juste ouvert : rien n'est en cours, on applique tout de suite.
      if (now() - openedAt <= AUTO_APPLY_WITHIN_MS) void applyUpdate();
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      void checkForUpdate();
    },
  });

  const recheck = (): void => void checkForUpdate();
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') recheck();
  });
  win.addEventListener('online', recheck);
  setInterval(recheck, CHECK_EVERY_MS);
}

export type CheckResult = 'available' | 'uptodate' | 'unsupported';

/** Demande au navigateur de chercher une nouvelle version maintenant. */
export async function checkForUpdate(): Promise<CheckResult> {
  if (!registration) return state.needRefresh ? 'available' : 'unsupported';
  try {
    await registration.update();
  } catch {
    /* hors-ligne : on garde l'état actuel */
  }
  set({ checkedAt: Date.now() });
  return state.needRefresh || registration.waiting ? 'available' : 'uptodate';
}

/** Active la version téléchargée et recharge l'application. Les données locales ne sont pas touchées. */
export async function applyUpdate(): Promise<void> {
  if (activate) await activate(true);
}

/**
 * Secours : désinscrit le Service Worker, vide les caches de l'application, recharge. Les données (IndexedDB)
 * et la session ne sont pas touchées ; la version la plus récente est retéléchargée.
 */
export async function forceRefresh(reload: () => void = () => window.location.reload()): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await globalThis.caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => globalThis.caches.delete(k)));
  } finally {
    reload();
  }
}
