// Écran de verrouillage : recouvre l'application à l'ouverture et après un séjour en arrière-plan.
import { LOCK_IDLE_MS, isLockEnabled, unlock, type PasskeyApi } from '../../auth/app-lock';
import { versionLabel } from '../../version';
import { h } from '../dom';

export interface LockDeps {
  api?: PasskeyApi | null;
  now?: () => number;
  idleMs?: number;
  doc?: Document;
  /** « Déverrouillage impossible ? » : efface les données de l'appareil et ramène à la connexion. */
  onForgot: () => Promise<void>;
}

export interface LockHandle {
  /** Verrouille tout de suite (si le verrou est activé). */
  lock(): void;
  isLocked(): boolean;
  dispose(): void;
}

export function installLock(deps: LockDeps): LockHandle {
  const doc = deps.doc ?? document;
  const now = deps.now ?? (() => Date.now());
  const idle = deps.idleMs ?? LOCK_IDLE_MS;
  let overlay: HTMLElement | null = null;
  let hiddenAt: number | null = null;

  const close = (): void => {
    overlay?.remove();
    overlay = null;
  };

  const show = (): void => {
    if (overlay || !isLockEnabled()) return;
    const message = h('p', { class: 'muted', role: 'alert', 'aria-live': 'assertive' });
    const button = h('button', { class: 'btn btn--primary', type: 'button' }, 'Déverrouiller');
    button.addEventListener('click', () => {
      message.textContent = '';
      button.setAttribute('disabled', '');
      void unlock(deps.api).then((ok) => {
        if (ok) close();
        else {
          button.removeAttribute('disabled');
          message.textContent = 'Déverrouillage refusé. Réessayez.';
        }
      });
    });
    const forgot = h('button', { class: 'btn btn--small', type: 'button' }, 'Déverrouillage impossible ?');
    forgot.addEventListener('click', () => {
      deps.onForgot().then(close, () => undefined); // annulé : le verrou reste affiché
    });
    overlay = h(
      'div',
      { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Application verrouillée' },
      h('h1', {}, 'Cavavin'),
      h('p', { class: 'muted' }, 'Application verrouillée'),
      button,
      message,
      forgot,
      h('p', { class: 'muted', style: 'font-size:0.75rem' }, versionLabel()),
    );
    doc.body.append(overlay);
    button.focus();
  };

  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') hiddenAt = now();
    else if (hiddenAt !== null && now() - hiddenAt >= idle) show();
    if (doc.visibilityState !== 'hidden') hiddenAt = null;
  };
  doc.addEventListener('visibilitychange', onVisibility);
  show(); // à l'ouverture

  return {
    lock: show,
    isLocked: () => overlay !== null,
    dispose: () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      close();
    },
  };
}
