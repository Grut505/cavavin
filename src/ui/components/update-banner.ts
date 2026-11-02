// Bandeau « Nouvelle version disponible » : visible tant qu'une mise à jour attend, un tap l'applique.
import { applyUpdate, onUpdateChange, updateState } from '../../app-update';
import { h } from '../dom';

export function updateBanner(apply: () => Promise<void> = applyUpdate): HTMLElement {
  const root = h('div', { class: 'update-banner', role: 'status', 'aria-live': 'polite', hidden: true });
  let busy = false;
  const paint = (): void => {
    const show = updateState().needRefresh;
    root.toggleAttribute('hidden', !show);
    if (!show) {
      root.replaceChildren();
      return;
    }
    root.replaceChildren(
      h('span', {}, 'Nouvelle version disponible.'),
      h(
        'button',
        {
          class: 'btn btn--small btn--primary',
          type: 'button',
          disabled: busy,
          onClick: () => {
            busy = true;
            paint();
            void apply().finally(() => {
              busy = false;
              paint();
            });
          },
        },
        busy ? 'Mise à jour…' : 'Mettre à jour',
      ),
    );
  };
  onUpdateChange(paint);
  paint();
  return root;
}
