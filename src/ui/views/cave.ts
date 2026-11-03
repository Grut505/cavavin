// Écran « Cave » : schéma visuel des meubles, étagères et lieux.
import type { AppContext } from '../../app';
import { bottleCounts } from '../../domain/locations';
import { renderCaveMap, bottlesLabel } from '../cave-map/cave-map';
import { buildRows } from '../../domain/query';
import { openDishDialog } from '../components/dish-dialog';
import { todrinkSummary } from '../components/todrink-summary';
import { urgencyByLocation } from '../../domain/urgency';
import { legendButton } from '../components/urgency-legend';
import { pageHeader } from '../components/page-header';
import { h } from '../dom';
import { icon } from '../icons';
import { Router } from '../router';

export async function caveView(ctx: AppContext): Promise<HTMLElement> {
  const [furniture, locations, stocks, wines] = await Promise.all([
    ctx.repo.list('furniture'),
    ctx.repo.list('location'),
    ctx.repo.list('stock'),
    ctx.repo.list('wine'),
  ]);
  const rows = buildRows({ wines, stocks, locations, furniture });
  const counts = bottleCounts(stocks);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const hasCave = furniture.length > 0 || locations.length > 0;

  const head = pageHeader({
    title: 'Cave',
    subtitle: hasCave ? (total === 0 ? 'Aucune bouteille rangée' : bottlesLabel(total)) : null,
    actions: [legendButton(), h('a', { class: 'icon-btn', href: '#/cave/config', 'aria-label': 'Configurer la cave' }, icon('tune'))],
  });

  if (!hasCave) {
    return h(
      'main',
      { class: 'view' },
      head,
      h(
        'div',
        { class: 'card empty' },
        h('h2', {}, 'Votre cave est vide'),
        h('p', { class: 'muted' }, 'Décrivez vos meubles et leurs étagères pour pouvoir y ranger vos bouteilles.'),
        h('a', { class: 'btn btn--primary', href: '#/cave/config' }, 'Configurer ma cave'),
      ),
    );
  }

  // Deux raccourcis en haut : « À boire » (écran Stats) et « Quoi boire » (fenêtre de saisie d'un plat → Liste filtrée).
  const shortcuts = h(
    'div',
    { class: 'cave-actions' },
    todrinkSummary(stocks, wines, new Date().getFullYear()),
    h('button', { class: 'btn btn--small btn--primary cave-actions__dish', type: 'button', onClick: () => openDishDialog(rows) }, 'Quoi boire ?'),
  );

  return h(
    'main',
    { class: 'view' },
    head,
    shortcuts,
    renderCaveMap({ furniture, locations, counts, urgencies: urgencyByLocation(stocks, wines, new Date().getFullYear()) }, { onSelect: (loc) => Router.go(`/etagere/${loc.id}`) }),
  );
}
