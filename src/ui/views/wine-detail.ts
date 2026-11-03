// Fiche détaillée d'une bouteille : informations, emplacements en évidence, actions, historique.
import type { AppContext } from '../../app';
import { OUTFLOW_REASON_LABELS, outflowsOf } from '../../domain/stock';
import { pairingsOf } from '../../domain/pairing-list';
import { formatDateFr, wineTitle } from '../../domain/wine';
import type { Wine } from '../../domain/types';
import { bottlesLabel } from '../cave-map/cave-map';
import { renderShelfView, shelfBottles } from '../cave-map/shelf-view';
import { legendButton } from '../components/urgency-legend';
import { stocksAt } from '../../domain/locations';
import { openAddStockDialog } from '../components/add-stock-dialog';
import { locationLabel } from '../components/location-picker';
import { openMergeDialog } from '../components/merge-dialog';
import { openMoveDialog } from '../components/move-dialog';
import { openOutflowDialog, type StockChoice } from '../components/outflow-dialog';
import { pageHeader } from '../components/page-header';
import { colorLabel } from '../components/wine-card';
import { styleMeter } from '../components/style-meter';
import { urgencyTag } from '../components/urgency-tag';
import { urgencyOf } from '../../domain/urgency';
import { h } from '../dom';
import { icon } from '../icons';
import { positionLabel } from '../../domain/types';
import { originQuery, wineBack } from '../nav-origin';

const eur = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`;

function facts(wine: Wine, giftName: string | null, showUrgency: boolean): [string, string | HTMLElement][] {
  const window =
    wine.drink_from && wine.drink_until
      ? `${wine.drink_from} – ${wine.drink_until}`
      : wine.drink_from
        ? `à partir de ${wine.drink_from}`
        : wine.drink_until
          ? `avant ${wine.drink_until}`
          : '';
  const rows: [string, string | HTMLElement][] = [
    ['Couleur', colorLabel(wine.color)],
    ['Appellation', wine.appellation ?? ''],
    ['Région', [wine.region, wine.country].filter(Boolean).join(', ')],
    ['Format', wine.format],
    ['À boire', window && showUrgency ? h('span', { class: 'drink-fact' }, urgencyTag(urgencyOf(wine, new Date().getFullYear())), h('span', { class: 'muted' }, window)) : window],
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
    const wine = params.id ? await ctx.repo.get('wine', params.id, true) : undefined; // une fiche supprimée reste consultable (historique)
    const removed = wine?.deleted === true;
    if (!wine) {
      root.replaceChildren(
        pageHeader({ title: 'Fiche introuvable', back: '#/liste', backLabel: 'Retour à la liste' }),
        h('p', { class: 'muted' }, 'Cette fiche n’existe plus.'),
      );
      return;
    }
    const allWines = await ctx.repo.list('wine');
    const [stocks, locations, furniture, outflows, persons, thumbs] = await Promise.all([
      ctx.repo.list('stock'),
      ctx.repo.list('location'),
      ctx.repo.list('furniture'),
      ctx.repo.list('outflow'),
      ctx.repo.list('person', true),
      ctx.repo.photoUrls(),
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
    const photos = thumbs.get(wine.id);
    const giftName = wine.gift_from ? (persons.find((p) => p.id === wine.gift_from)?.name ?? null) : null;

    const refreshAfter = async (action: Promise<boolean>): Promise<void> => {
      if (await action) await draw();
    };

    const stockRow = (c: StockChoice, named: boolean): HTMLElement =>
      h(
        'li',
        { class: 'stock-row', 'data-stock-id': c.stock.id },
        h(
          'div',
          { class: 'stock-row__head' },
          // Dans un bloc d'emplacement, le nom est déjà en titre : on ne répète que la quantité et la position.
          named ? h('strong', { class: 'stock-row__name' }, c.label) : null,
          h('span', { class: 'badge', 'aria-label': bottlesLabel(c.stock.quantity) }, `×${c.stock.quantity}`),
          !named && c.stock.position_hint ? h('span', { class: 'stock-row__pos' }, `Position : ${positionLabel(c.stock.position_hint)}`) : null,
        ),
        named && c.stock.position_hint ? h('div', { class: 'muted stock-row__pos' }, `Position : ${positionLabel(c.stock.position_hint)}`) : null,
        h(
          'div',
          { class: 'stock-row__actions' },
          h('button', { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openOutflowDialog(ctx, { wine, choices, stockId: c.stock.id })) }, icon('out'), 'Sortir'),
          h('button', { class: 'btn btn--small', type: 'button', onClick: () => void refreshAfter(openMoveDialog(ctx, { wine, choices, furniture, stockId: c.stock.id })) }, icon('move'), 'Déplacer'),
        ),
      );

    // « Où la trouver ? » : pour chaque emplacement, la vue de l'étagère (bouteilles dessinées, colorées selon
    // l'échéance, position sur l'étagère) avec les bouteilles de cette fiche mises en évidence.
    const year = new Date().getFullYear();
    // Un bloc par emplacement qui contient la bouteille, mis en avant (liseré, pastille « ici », bouteilles de cette
    // fiche cerclées) : nom, quantité, position, actions, puis la vue de l'étagère.
    const byLocation = new Map<string, StockChoice[]>();
    for (const c of choices) byLocation.set(c.stock.location_id, [...(byLocation.get(c.stock.location_id) ?? []), c]);
    const whereViews = [...byLocation.entries()].map(([id, list]) => {
      const loc = locById.get(id);
      const rows = h('ul', { class: 'stock-list' }, list.map((c) => stockRow(c, !loc || loc.deleted)));
      if (!loc || loc.deleted) return h('div', { class: 'where-orphan' }, rows);
      return h(
        'div',
        { class: 'where where--here', 'data-location-id': loc.id },
        h('a', { class: 'where__title', href: `#/etagere/${loc.id}` }, h('span', { class: 'where__here' }, 'Ici'), h('strong', { class: 'where__name' }, locationLabel(loc, furniture)), h('span', { class: 'where__go' }, 'Voir ›')),
        rows,
        loc.kind === 'shelf'
          ? renderShelfView({ shelfName: loc.name, bottles: shelfBottles(stocksAt(stocks, loc.id), allWines, year), highlightWineId: wine.id })
          : null,
      );
    });

    const history = outflowsOf(outflows, wine.id);

    const content: (HTMLElement | null)[] = [
      pageHeader({
        title: title.primary,
        subtitle: `${title.secondary} · ${removed ? 'supprimée' : total === 0 ? 'épuisée' : bottlesLabel(total)}`,
        back: wineBack().href,
        backLabel: wineBack().label,
        actions: removed ? [] : [h('a', { class: 'icon-btn', href: `#/vin/${wine.id}/modifier${originQuery()}`, 'aria-label': 'Modifier la fiche' }, icon('edit'))],
      }),
      removed
        ? h('p', { class: 'alert', role: 'status' }, 'Cette fiche a été supprimée (retirée ou fusionnée avec une autre). Elle n’est plus dans votre cave ; seul son historique de sorties reste consultable.')
        : null,
      wine.needs_review && !removed
        ? h('p', { class: 'alert' }, 'Fiche à compléter. ', h('a', { href: `#/vin/${wine.id}/modifier${originQuery()}` }, 'Modifier la fiche'))
        : null,
      h(
        'section',
        { class: 'card detail-hero' },
        photos?.front || photos?.back
          ? h(
              'div',
              { class: 'detail-hero__photos' },
              photos.front ? h('img', { class: 'detail-hero__thumb', src: photos.front, alt: photos.back ? 'Étiquette (avant)' : 'Étiquette', width: '84' }) : null,
              photos.back ? h('img', { class: 'detail-hero__thumb', src: photos.back, alt: 'Étiquette (arrière)', width: '84' }) : null,
            )
          : h('span', { class: 'detail-hero__thumb detail-hero__thumb--empty', 'aria-hidden': 'true' }, icon('bottle')),
        h('dl', { class: 'facts' }, ...facts(wine, giftName, !removed && total > 0).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      ),
      styleMeter(wine) ? h('section', { class: 'card stack', 'aria-label': 'Style' }, h('h2', {}, 'Style'), styleMeter(wine)) : null,
      removed
        ? null
        : h(
        'section',
        { class: 'card stack', 'aria-label': 'Emplacements' },
        h('div', { class: 'home__title' }, h('h2', {}, 'Où la trouver ?'), whereViews.some((v) => v.classList.contains('where')) ? legendButton() : null),
        whereViews.length === 0 ? h('p', { class: 'muted' }, 'Plus aucune bouteille en stock.') : null,
        ...whereViews,
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
      pairingsOf(wine).length > 0 && !removed
        ? h(
            'section',
            { class: 'card stack', 'aria-label': 'À table' },
            h('h2', {}, 'À table'),
            h('p', { class: 'muted' }, 'Mets conseillés (végétariens). Touchez-en un pour voir toutes les bouteilles qui vont avec.'),
            h('div', { class: 'chips' }, pairingsOf(wine).map((m) => h('a', { class: 'btn btn--small', href: `#/liste?plat=${encodeURIComponent(m)}` }, m))),
          )
        : null,
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

