// Détail d'un emplacement : bouteilles qui s'y trouvent (touch dans le schéma de la cave).
import type { AppContext } from '../../app';
import { stocksAt } from '../../domain/locations';
import { positionLabel } from '../../domain/types';
import { bottlesLabel } from '../cave-map/cave-map';
import { renderShelfView, shelfBottles } from '../cave-map/shelf-view';
import { legendButton } from '../components/urgency-legend';
import { renderWineCard } from '../components/wine-card';
import { pageHeader } from '../components/page-header';
import { wineHref } from '../nav-origin';
import { h } from '../dom';

export async function shelfDetailView(ctx: AppContext, params: { id?: string }): Promise<HTMLElement> {
  const loc = params.id ? await ctx.repo.get('location', params.id) : undefined;
  if (!loc) {
    return h(
      'main',
      { class: 'view' },
      pageHeader({ title: 'Emplacement introuvable', back: '#/cave', backLabel: 'Retour à la cave' }),
      h('p', { class: 'muted' }, 'Cet emplacement n’existe plus.'),
    );
  }

  const [furniture, stocks, wines] = await Promise.all([
    loc.furniture_id ? ctx.repo.get('furniture', loc.furniture_id) : Promise.resolve(undefined),
    ctx.repo.list('stock'),
    ctx.repo.list('wine'),
  ]);
  const here = stocksAt(stocks, loc.id);
  const total = here.reduce((n, s) => n + s.quantity, 0);
  const subtitle =
    loc.kind === 'shelf' ? (furniture?.name ?? 'Meuble') : loc.kind === 'place' ? 'Lieu' : 'À rattacher à la cave';

  // Mêmes cartes que dans la Liste (appellation, région, couleur, domaine…), avec la quantité de CET emplacement.
  const thumbs = await ctx.repo.thumbnailUrls();
  const rows = here.map((st) => {
    const wine = wines.find((w) => w.id === st.wine_id);
    if (!wine) return h('div', { class: 'card muted' }, 'Fiche introuvable');
    return renderWineCard(
      { wine, quantity: st.quantity, locations: [] },
      { href: wineHref(wine.id, `/etagere/${loc.id}`), thumb: thumbs.get(wine.id), extra: st.position_hint ? `Position : ${positionLabel(st.position_hint)}` : undefined },
    );
  });

  return h(
    'main',
    { class: 'view' },
    pageHeader({
      title: loc.name,
      subtitle: `${subtitle} · ${total === 0 ? 'vide' : bottlesLabel(total)}`,
      back: '#/cave',
      backLabel: 'Retour à la cave',
      actions: [loc.kind === 'shelf' && rows.length > 0 ? legendButton() : null],
    }),
    loc.kind === 'shelf' && rows.length > 0 ? h('a', { class: 'btn btn--small', href: `#/pointage/${loc.id}` }, 'Pointer cette étagère') : null,
    rows.length === 0
      ? h('div', { class: 'card empty muted' }, 'Aucune bouteille ici pour l’instant.')
      : [
          loc.kind === 'shelf' ? renderShelfView({ shelfName: loc.name, bottles: shelfBottles(here, wines) }) : null,
          h('div', { class: 'stack' }, rows),
        ],
  );
}
