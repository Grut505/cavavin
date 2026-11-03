// Fiche détaillée d'une bouteille : informations, emplacements en évidence, actions, historique.
import type { AppContext } from '../../app';
import { bottleCounts } from '../../domain/locations';
import { OUTFLOW_REASON_LABELS, outflowsOf } from '../../domain/stock';
import { pairingsOf } from '../../domain/pairing-list';
import { formatDateFr, wineTitle } from '../../domain/wine';
import type { Furniture, Location, Wine } from '../../domain/types';
import { renderCaveMap, bottlesLabel } from '../cave-map/cave-map';
import { openAddStockDialog } from '../components/add-stock-dialog';
import { locationLabel } from '../components/location-picker';
import { openMergeDialog } from '../components/merge-dialog';
import { openMoveDialog } from '../components/move-dialog';
import { openOutflowDialog, type StockChoice } from '../components/outflow-dialog';
import { pageHeader } from '../components/page-header';
import { colorLabel } from '../components/wine-card';
import { h } from '../dom';
import { icon } from '../icons';
import { positionLabel } from '../../domain/types';
import { originQuery, wineBack } from '../nav-origin';
import { Router } from '../router';

const eur = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`;

function facts(wine: Wine, giftName: string | null): [string, string][] {
  const window =
    wine.drink_from && wine.drink_until
      ? `${wine.drink_from} – ${wine.drink_until}`
      : wine.drink_from
        ? `à partir de ${wine.drink_from}`
        : wine.drink_until
          ? `avant ${wine.drink_until}`
          : '';
  const style = wine.tannin
    ? `Tanin ${wine.tannin} / 5`
    : wine.dryness
      ? `Sucre : ${wine.dryness}`
      : '';
  const rows: [string, string][] = [
    ['Couleur', colorLabel(wine.color)],
    ['Appellation', wine.appellation ?? ''],
    ['Région', [wine.region, wine.country].filter(Boolean).join(', ')],
    ['Format', wine.format],
    ['Style', style],
    ['À boire', window],
    ['Note', wine.rating ? `${wine.rating} / 5` : ''],
    ['Prix d’achat', wine.purchase_price !== null ? eur(wine.purchase_price) : ''],
    ['Date d’achat', formatDateFr(wine.purchase_date)],
    ['Fournisseur', wine.supplier ?? ''],
    ['Cadeau', wine.gift ? (giftName ? `Offert par ${giftName}` : 'Oui') : ''],
    ['Notes', wine.notes ?? ''],
  ];
  return rows.filter(([, v]) => v !== '');
}

export async function wineDetailView(ctx: AppContext, params: { id?: string }): Promise<HTMLElement> {
  const root = h('main', { class: 'view' });

  async function draw(): Promise<void> {
    const wine = params.id ? await ctx.repo.get('wine', params.id) : undefined;
    if (!wine) {
      root.replaceChildren(
        pageHeader({ title: 'Fiche introuvable', back: '#/liste', backLabel: 'Retour à la liste' }),
        h('p', { class: 'muted' }, 'Cette fiche n’existe plus.'),
      );
      return;
    }
    const [stocks, locations, furniture, outflows, persons, thumbs] = await Promise.all([
      ctx.repo.list('stock'),
      ctx.repo.list('location'),
      ctx.repo.list('furniture'),
      ctx.repo.list('outflow'),
      ctx.repo.list('person', true),
      ctx.repo.thumbnailUrls(),
    ]);
    const mine = stocks.filter((s) => s.wine_id === wine.id);
    const active = mine.filter((s) => !s.deleted && s.quantity > 0);
    const total = active.reduce((n, s) => n + s.quantity, 0);
    const locById = new Map(locations.map((l) => [l.id, l] as const));
    const label = (id: string): string => {
      const l = locById.get(id);
      return l ? locationLabel(l, furniture) : 'Emplacement supprimé';
    };
    const choices: StockChoice[] = active
      .map((st) => ({ stock: st, label: label(st.location_id) }))
      .sort((x, y) => x.label.localeCompare(y.label, 'fr'));

    const title = wineTitle(wine);
    const thumb = thumbs.get(wine.id);
    const giftName = wine.gift_from ? (persons.find((p) => p.id === wine.gift_from)?.name ?? null) : null;

    const refreshAfter = async (action: Promise<boolean>): Promise<void> => {
      if (await action) await draw();
    };

    const stockRows = choices.map((c) =>
      h(
        'li',
        { class: 'list__item', 'data-stock-id': c.stock.id },
        h(
          'div',
          { class: 'grow' },
          h('strong', {}, c.label),
          c.stock.position_hint ? h('div', { class: 'muted' }, `Position : ${positionLabel(c.stock.position_hint)}`) : null,
        ),
        h('span', { class: 'badge', 'aria-label': bottlesLabel(c.stock.quantity) }, `×${c.stock.quantity}`),
        h('button', { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openOutflowDialog(ctx, { wine, choices, stockId: c.stock.id })) }, 'Sortir'),
        h('button', { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openMoveDialog(ctx, { wine, choices, furniture, stockId: c.stock.id })) }, 'Déplacer'),
      ),
    );

    // Schéma de la cave limité aux meubles (et lieux) où se trouve la fiche, emplacements en évidence.
    const where = new Set(active.map((s) => s.location_id));
    const mapLocations: Location[] = locations.filter((l) => !l.deleted && where.has(l.id));
    const furnitureIds = new Set(mapLocations.filter((l) => l.kind === 'shelf').map((l) => l.furniture_id));
    const mapFurniture: Furniture[] = furniture.filter((f) => furnitureIds.has(f.id));
    const mapShelves = locations.filter((l) => !l.deleted && l.kind === 'shelf' && furnitureIds.has(l.furniture_id));
    const mapData = {
      furniture: mapFurniture,
      locations: [...mapShelves, ...mapLocations.filter((l) => l.kind !== 'shelf')],
      counts: bottleCounts(stocks),
    };

    const history = outflowsOf(outflows, wine.id);

    const content: (HTMLElement | null)[] = [
      pageHeader({
        title: title.primary,
        subtitle: `${title.secondary} · ${total === 0 ? 'épuisée' : bottlesLabel(total)}`,
        back: wineBack().href,
        backLabel: wineBack().label,
        actions: [h('a', { class: 'icon-btn', href: `#/vin/${wine.id}/modifier${originQuery()}`, 'aria-label': 'Modifier la fiche' }, icon('edit'))],
      }),
      wine.needs_review
        ? h('p', { class: 'alert' }, 'Fiche à compléter. ', h('a', { href: `#/vin/${wine.id}/modifier${originQuery()}` }, 'Modifier la fiche'))
        : null,
      h(
        'section',
        { class: 'card detail-hero' },
        thumb
          ? h('img', { class: 'detail-hero__thumb', src: thumb, alt: 'Étiquette', width: '84' })
          : h('span', { class: 'detail-hero__thumb detail-hero__thumb--empty', 'aria-hidden': 'true' }, icon('bottle')),
        h('dl', { class: 'facts' }, ...facts(wine, giftName).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      ),
      pairingsOf(wine).length > 0
        ? h(
            'section',
            { class: 'card stack', 'aria-label': 'À table' },
            h('h2', {}, 'À table'),
            h('p', { class: 'muted' }, 'Mets conseillés (végétariens). Touchez-en un pour voir toutes les bouteilles qui vont avec.'),
            h('div', { class: 'chips' }, pairingsOf(wine).map((m) => h('a', { class: 'btn btn--small', href: `#/accueil?plat=${encodeURIComponent(m)}` }, m))),
          )
        : null,
      h(
        'section',
        { class: 'card stack', 'aria-label': 'Emplacements' },
        h('h2', {}, 'Où la trouver ?'),
        stockRows.length > 0
          ? h('ul', { class: 'list' }, stockRows)
          : h('p', { class: 'muted' }, 'Plus aucune bouteille en stock.'),
        mapFurniture.length > 0 || mapData.locations.some((l) => l.kind !== 'shelf')
          ? renderCaveMap(mapData, { onSelect: (loc) => Router.go(`/etagere/${loc.id}`), highlightIds: [...where] })
          : null,
        h(
          'button',
          { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openAddStockDialog(ctx, { wine, furniture })) },
          icon('plus'),
          'Ajouter des bouteilles',
        ),
        h(
          'button',
          { class: 'btn btn--small', type: 'button', 'aria-pressed': String(wine.to_buy === true), onClick: () => void ctx.repo.setToBuy(wine.id, wine.to_buy !== true).then(() => draw()) },
          wine.to_buy === true ? 'Dans ma liste de courses ✓' : 'Ajouter à la liste de courses',
        ),
        h('button', { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openMergeDialog(ctx, { wine })) }, 'Fusionner avec une autre fiche'),
      ),
      h(
        'section',
        { class: 'card stack', 'aria-label': 'Historique des sorties' },
        h('h2', {}, 'Historique'),
        history.length === 0
          ? h('p', { class: 'muted' }, 'Aucune bouteille sortie pour l’instant.')
          : h(
              'ul',
              { class: 'list' },
              history.slice(0, 10).map((o) =>
                h(
                  'li',
                  { class: 'list__item' },
                  h(
                    'div',
                    { class: 'grow' },
                    h('strong', {}, OUTFLOW_REASON_LABELS[o.reason]),
                    h('div', { class: 'muted' }, [formatDateFr(o.date), label(o.location_id)].join(' · ')),
                    o.note ? h('div', { class: 'muted' }, o.note) : null,
                  ),
                ),
              ),
            ),
        history.length > 10 ? h('a', { href: '#/historique' }, 'Tout l’historique') : null,
      ),
    ];
    root.replaceChildren(...content.filter((n): n is HTMLElement => n !== null));
  }

  await draw();
  return root;
}

