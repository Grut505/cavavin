// Détail d'un emplacement : bouteilles qui s'y trouvent (touch dans le schéma de la cave).
import type { AppContext } from '../../app';
import { stocksAt } from '../../domain/locations';
import { positionLabel } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { bottlesLabel } from '../cave-map/cave-map';
import { renderShelfView, shelfBottles } from '../cave-map/shelf-view';
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

  const rows = here.map((st) => {
    const wine = wines.find((w) => w.id === st.wine_id);
    return h(
      'li',
      { class: 'list__item' },
      h(
        wine ? 'a' : 'div',
        { class: 'grow list__link', ...(wine ? { href: wineHref(wine.id, `/etagere/${loc.id}`) } : {}) },
        h('strong', {}, wine ? wineTitle(wine).primary : 'Fiche introuvable'),
        wine ? h('div', { class: 'muted' }, wineTitle(wine).secondary) : null,
        st.position_hint ? h('div', { class: 'muted' }, `Position : ${positionLabel(st.position_hint)}`) : null,
      ),
      h('span', { class: 'badge', 'aria-label': bottlesLabel(st.quantity) }, `×${st.quantity}`),
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
    }),
    loc.kind === 'shelf' && rows.length > 0 ? h('a', { class: 'btn btn--small', href: `#/pointage/${loc.id}` }, 'Pointer cette étagère') : null,
    rows.length === 0
      ? h('div', { class: 'card empty muted' }, 'Aucune bouteille ici pour l’instant.')
      : [
          loc.kind === 'shelf' ? renderShelfView({ shelfName: loc.name, bottles: shelfBottles(here, wines) }) : null,
          h('ul', { class: 'card list' }, rows),
        ],
  );
}
