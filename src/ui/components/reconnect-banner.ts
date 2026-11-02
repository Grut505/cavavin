// Bandeau « Reconnecter » : visible quand la session Google a expiré ; un tap relance la connexion,
// la synchronisation reprend d'elle-même (l'ordonnanceur écoute le changement de session).
import type { SyncScheduler } from '../../data/sync-scheduler';
import { h } from '../dom';

export interface ReconnectDeps {
  /** Lance la connexion (doit venir d'un geste utilisateur). */
  signIn: () => Promise<unknown>;
}

export function reconnectBanner(scheduler: Pick<SyncScheduler, 'status' | 'subscribe'>, deps: ReconnectDeps): HTMLElement {
  const root = h('div', { class: 'reconnect-banner', hidden: true });
  let seen = false;
  let busy = false;
  let error = '';

  const paint = (): void => {
    if (root.isConnected) seen = true;
    else if (seen) return unsubscribe();
    const s = scheduler.status();
    const show = s.state === 'auth';
    root.toggleAttribute('hidden', !show);
    if (!show) {
      root.replaceChildren();
      error = '';
      return;
    }
    root.replaceChildren(
      h(
        'span',
        { role: 'status' },
        s.pending > 0
          ? `Session Google expirée · ${s.pending} modification${s.pending > 1 ? 's' : ''} conservée${s.pending > 1 ? 's' : ''}.`
          : 'Session Google expirée.',
        error ? h('span', { class: 'muted' }, ` ${error}`) : null,
      ),
      h(
        'button',
        {
          class: 'btn btn--small btn--primary',
          type: 'button',
          disabled: busy,
          onClick: () => {
            busy = true;
            error = '';
            paint();
            deps
              .signIn()
              .catch((e: unknown) => {
                error = e instanceof Error ? e.message : 'Connexion impossible.';
              })
              .finally(() => {
                busy = false;
                paint();
              });
          },
        },
        busy ? 'Connexion…' : 'Reconnecter',
      ),
    );
  };

  const unsubscribe = scheduler.subscribe(paint);
  paint();
  return root;
}
