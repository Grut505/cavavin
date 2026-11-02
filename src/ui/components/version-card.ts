// Carte « Version » des Réglages : version affichée, contrôle manuel des mises à jour, secours.
import { applyUpdate, checkForUpdate, forceRefresh, onUpdateChange, updateState } from '../../app-update';
import { versionLabel } from '../../version';
import { confirmDialog } from './dialog';
import { h } from '../dom';

export function versionCard(deps: { label?: string } = {}): HTMLElement {
  const label = deps.label ?? versionLabel();
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'stack' });
  let note = '';

  const paint = (): void => {
    const { needRefresh, checkedAt } = updateState();
    status.textContent =
      note ||
      (needRefresh
        ? 'Une nouvelle version est prête.'
        : checkedAt
          ? `À jour (vérifié à ${new Date(checkedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}).`
          : 'Vérification automatique à chaque ouverture.');
    actions.replaceChildren(
      needRefresh
        ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => void applyUpdate() }, 'Mettre à jour maintenant')
        : h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onClick: () => {
                note = 'Recherche en cours…';
                paint();
                void checkForUpdate().then((r) => {
                  note = r === 'unsupported' ? 'Mises à jour automatiques indisponibles ici (navigateur sans Service Worker ou mode développement).' : '';
                  paint();
                });
              },
            },
            'Rechercher une mise à jour',
          ),
      h(
        'button',
        {
          class: 'btn btn--small',
          type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Forcer le rafraîchissement ?',
              message: 'Les fichiers de l’application sont vidés puis retéléchargés. Vos données et votre connexion ne sont pas touchées. Nécessite le réseau.',
              confirmLabel: 'Forcer',
            });
            if (ok) await forceRefresh();
          },
        },
        'Version bloquée ? Forcer le rafraîchissement',
      ),
    );
  };
  onUpdateChange(paint);
  paint();
  return h('section', { class: 'card stack', 'aria-label': 'Version' }, h('h2', {}, 'Version'), h('p', {}, h('strong', {}, label)), status, actions);
}
