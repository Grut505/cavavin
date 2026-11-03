// Détail d'un emplacement : bouteilles qui s'y trouvent (touch dans le schéma de la cave).
import type { AppContext } from '../../app';
import { stocksAt } from '../../domain/locations';
import { positionLabel } from '../../domain/types';
import { bottlesLabel } from '../cave-map/cave-map';
import { renderShelfView, shelfBottles, type ShelfZone } from '../cave-map/shelf-view';
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
  const entries = here.map((st) => {
    const wine = wines.find((w) => w.id === st.wine_id);
    const card = wine
      ? renderWineCard(
          { wine, quantity: st.quantity, locations: [] },
          { href: wineHref(wine.id, `/etagere/${loc.id}`), thumb: thumbs.get(wine.id), extra: st.position_hint ? `Position : ${positionLabel(st.position_hint)}` : undefined, noLocation: true },
        )
      : h('div', { class: 'card muted' }, 'Fiche introuvable');
    return { st, card };
  });

  // Filtre par case : un toucher sur une case de l'étagère ne garde que les cartes de cette case (re-toucher = tout).
  let zone: ShelfZone | null = null;
  const schema = h('div', {});
  const filterBar = h('div', { class: 'zone-filter' });
  const list = h('div', { class: 'stack' });
  const bottles = shelfBottles(here, wines);
  const draw = (): void => {
    const shown = zone === null ? entries : entries.filter((e) => (zone === 'none' ? e.st.position_hint === null : e.st.position_hint === zone));
    if (loc.kind === 'shelf') {
      schema.replaceChildren(
        renderShelfView({
          shelfName: loc.name,
          bottles,
          selectedZone: zone,
          onZoneSelect: (z) => {
            zone = zone === z ? null : z;
            draw();
          },
        }),
      );
    }
    if (zone === null) filterBar.replaceChildren();
    else {
      const label = zone === 'none' ? 'Position non précisée' : positionLabel(zone);
      const n = shown.reduce((sum, e) => sum + e.st.quantity, 0);
      filterBar.replaceChildren(
        h('span', { class: 'chip__label' }, `Case : ${label} · ${bottlesLabel(n)}`),
        h('button', { class: 'btn btn--small', type: 'button', 'aria-label': 'Retirer le filtre de case', onClick: () => { zone = null; draw(); } }, 'Tout afficher ✕'),
      );
    }
    list.replaceChildren(...(shown.length === 0 ? [h('div', { class: 'card empty muted' }, 'Aucune bouteille dans cette case.')] : shown.map((e) => e.card)));
  };
  draw();
  const rows = entries;

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
      : [loc.kind === 'shelf' ? schema : null, filterBar, list],
  );
}
