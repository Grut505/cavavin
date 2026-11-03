// Écran Stats : « À boire » (catégories d'urgence repliables), « À racheter » et les statistiques globales (spec 002).
import type { AppContext } from '../../app';
import {
  DRINK_SORT_HINTS,
  DRINK_SORT_LABELS,
  MATURITY_LABELS,
  colorCounts,
  maturityGroups,
  windowText,
  type DrinkSort,
  type Maturity,
  type MaturityEntry,
} from '../../domain/maturity';
import { rebuyList } from '../../domain/rebuy';
import { shoppingList } from '../../domain/shopping';
import { buildRows, emptyFilters, type Filters, type WineRow } from '../../domain/query';
import { maturityFilter, sliceFilter } from '../../domain/stats-filter';
import {
  cellarValue,
  consumption,
  distribution,
  formatEuro,
  monthLabel,
  overview,
  topSlices,
  type Axis,
  type Slice,
} from '../../domain/stats';
import { OUTFLOW_REASON_LABELS } from '../../domain/stock';
import { OUTFLOW_REASONS, WINE_COLORS, type Outflow, type Wine, type WineColor } from '../../domain/types';
import { URGENCY_LABELS, URGENCY_ORDER, type Urgency } from '../../domain/urgency';
import { wineHeading } from '../../domain/wine';
import { wineHref } from '../nav-origin';
import { loadPref, savePref } from '../prefs';
import { hashQuery } from '../query';
import { Router } from '../router';
import { pageHeader } from '../components/page-header';
import { quickOutflow } from '../components/quick-outflow';
import { legendButton } from '../components/urgency-legend';
import { colorLabel, renderWineCard } from '../components/wine-card';
import { h } from '../dom';
import { icon } from '../icons';
import './home.css';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
const bottles = (n: number): string => plural(n, 'bouteille', 'bouteilles');
const PAGE = 10;

type Drink = (wine: Wine) => void;

// --- À boire ---

/** Ligne compacte « ● Domaine · cuvée · millésime ×2 » : un tap la déplie (garde, emplacement, actions). */
function compactRow(e: MaturityEntry, year: number, onDrink: Drink): HTMLElement {
  const w = e.row.wine;
  const t = wineHeading(w);
  const window = windowText(w);
  const where = e.row.locations.map((l) => l.label).join(' + ') || 'Sans emplacement';
  const late = e.info.category === 'late' && w.drink_until !== null ? `dépassée depuis ${year - w.drink_until} an${year - w.drink_until > 1 ? 's' : ''}` : '';
  return h(
    'li',
    { class: 'tbd__row-li' },
    h(
      'details',
      { class: 'tbd__row' },
      h(
        'summary',
        { class: 'tbd__row-sum' },
        w.color ? h('span', { class: `dot dot--${w.color}`, 'aria-hidden': 'true' }) : null,
        h('span', { class: 'tbd__row-title' }, h('strong', {}, t.primary), h('span', { class: 'muted' }, t.region ? ` ${t.region}` : '')),
        h('span', { class: 'badge', 'aria-label': bottles(e.row.quantity) }, `×${e.row.quantity}`),
      ),
      h(
        'div',
        { class: 'tbd__row-body' },
        h('p', { class: 'muted' }, [window ? `Garde ${window}` : '', late, where].filter(Boolean).join(' · ')),
        h(
          'div',
          { class: 'tbd__row-actions' },
          h('a', { class: 'btn btn--small', href: wineHref(w.id, '/stats') }, 'Fiche'),
          h('button', { class: 'btn btn--small btn--primary', type: 'button', onClick: () => onDrink(w), 'aria-label': `Je la bois : ${t.primary}` }, 'Je la bois'),
        ),
      ),
    ),
  );
}

/** Réglages de la liste « À boire », mémorisés sur l'appareil. */
interface DrinkPrefs {
  color: WineColor | null;
  sort: DrinkSort;
}

const normalizeDrinkPrefs = (raw: unknown): DrinkPrefs | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sort = (Object.keys(DRINK_SORT_LABELS) as DrinkSort[]).find((k) => k === r.sort) ?? 'urgency';
  const color = (WINE_COLORS as readonly string[]).includes(String(r.color)) ? (r.color as WineColor) : null;
  return { color, sort };
};

/** En dessous de ce nombre de fiches, ni filtre ni tri : la liste tient d'un coup d'œil. */
const CONTROLS_MIN = 8;

interface UrgencyGroup {
  urgency: Urgency;
  entries: MaturityEntry[];
  bottles: number;
}

/** Les cinq catégories d'urgence : « À finir » est séparée de « À point » (même tri que la liste). */
function urgencyGroups(rows: WineRow[], year: number, opts: { color?: WineColor; sort: DrinkSort }): UrgencyGroup[] {
  const out: UrgencyGroup[] = [];
  for (const g of maturityGroups(rows, year, opts)) {
    const parts: [Urgency, MaturityEntry[]][] =
      g.category === 'now'
        ? [
            ['finishing', g.entries.filter((e) => e.info.finishing)],
            ['now', g.entries.filter((e) => !e.info.finishing)],
          ]
        : [[g.category, g.entries]];
    for (const [urgency, entries] of parts) out.push({ urgency, entries, bottles: entries.reduce((n, e) => n + e.row.quantity, 0) });
  }
  return out.sort((a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency));
}

function toDrinkSection(rows: WineRow[], year: number, onDrink: Drink): HTMLElement {
  const totalWines = urgencyGroups(rows, year, { sort: 'urgency' }).reduce((n, g) => n + g.entries.length, 0);
  const section = h(
    'section',
    { class: 'home__section', 'aria-labelledby': 'h-tbd' },
    h('div', { class: 'home__title' }, h('h2', { id: 'h-tbd' }, 'À boire'), legendButton()),
  );
  if (totalWines === 0) {
    section.append(
      h(
        'div',
        { class: 'card empty' },
        h('p', { class: 'muted' }, 'Aucune bouteille en stock pour l’instant.'),
        h('a', { class: 'btn btn--primary', href: '#/ajouter' }, 'Ajouter une bouteille'),
      ),
    );
    return section;
  }

  const colors = colorCounts(rows, year);
  let prefs = loadPref<DrinkPrefs>('home.drink', { color: null, sort: 'urgency' }, normalizeDrinkPrefs);
  if (prefs.color !== null && !colors.some((c) => c.color === prefs.color)) prefs = { ...prefs, color: null };
  const showControls = totalWines >= CONTROLS_MIN;
  if (!showControls) prefs = { color: null, sort: 'urgency' };

  const controls = h('div', { class: 'card stack tbd__controls' });
  const body = h('div', { class: 'stack' });

  const renderGroup = (g: UrgencyGroup): HTMLElement => {
    const list = h('ul', { class: 'tbd__list' });
    const footer = h('div', { class: 'tbd__more' });
    let shown = Math.min(PAGE, g.entries.length);
    const paint = (): void => {
      list.replaceChildren(...g.entries.slice(0, shown).map((e) => compactRow(e, year, onDrink)));
      const left = g.entries.length - shown;
      footer.replaceChildren(
        ...(left > 0
          ? [
              h('button', { class: 'btn btn--small', type: 'button', onClick: () => { shown = Math.min(g.entries.length, shown + PAGE); paint(); } }, `Afficher ${Math.min(PAGE, left)} de plus (${plural(left, 'restante', 'restantes')})`),
              left > PAGE ? h('button', { class: 'btn btn--small', type: 'button', onClick: () => { shown = g.entries.length; paint(); } }, 'Tout afficher') : null,
            ].filter((b): b is HTMLButtonElement => b !== null)
          : []),
      );
    };
    paint();
    // Les plus pressées sont ouvertes ; les autres restent repliées (le nombre de bouteilles suffit).
    const open = g.urgency === 'late' || g.urgency === 'finishing';
    return h(
      'details',
      { class: `tbd tbd--${g.urgency}`, ...(open ? { open: true } : {}) },
      h(
        'summary',
        { class: 'tbd__summary' },
        h('span', { class: `tbd__swatch u-fill u-fill--${g.urgency}`, 'aria-hidden': 'true' }),
        h('span', { class: 'tbd__title' }, URGENCY_LABELS[g.urgency]),
        h('span', { class: 'badge', 'aria-label': bottles(g.bottles) }, String(g.bottles)),
      ),
      list,
      footer,
    );
  };

  const draw = (): void => {
    const groups = urgencyGroups(rows, year, { color: prefs.color ?? undefined, sort: prefs.sort }).filter((g) => g.entries.length > 0);
    body.replaceChildren(
      ...(groups.length === 0
        ? [h('div', { class: 'card empty muted' }, `Aucune fiche ${prefs.color ? `« ${colorLabel(prefs.color).toLowerCase()} » ` : ''}à afficher.`)]
        : groups.map(renderGroup)),
    );
    if (!showControls) return;

    const setPrefs = (next: DrinkPrefs): void => {
      prefs = next;
      savePref('home.drink', prefs);
      draw();
    };
    // Pastilles compactes : bouteille de la couleur du vin + nombre (le libellé reste pour les lecteurs d'écran).
    const chip = (label: string, color: WineColor | null, n: number): HTMLElement =>
      h(
        'button',
        { class: `btn btn--small chip-color${prefs.color === color ? ' btn--primary' : ''}`, type: 'button', 'aria-pressed': String(prefs.color === color), 'aria-label': `${label} (${n})`, title: label, onClick: () => setPrefs({ ...prefs, color }) },
        color ? h('span', { class: `chip-color__bottle dot--${color}`, 'aria-hidden': 'true' }, icon('bottle')) : label,
        h('span', { class: 'chip-color__n' }, String(n)),
      );
    const sortSelect = h(
      'select',
      { class: 'field__input', id: 'drink-sort', onChange: (e: Event) => setPrefs({ ...prefs, sort: (e.target as HTMLSelectElement).value as DrinkSort }) },
      (Object.keys(DRINK_SORT_LABELS) as DrinkSort[]).map((k) => h('option', { value: k, ...(k === prefs.sort ? { selected: true } : {}) }, DRINK_SORT_LABELS[k])),
    );
    sortSelect.value = prefs.sort;
    controls.replaceChildren(
      h('div', { class: 'chips chips--row', role: 'group', 'aria-label': 'Filtrer par couleur' }, chip('Toutes', null, bottlesTotal), ...colors.map((c) => chip(colorLabel(c.color), c.color, c.bottles))),
      h('label', { class: 'field', for: 'drink-sort' }, h('span', { class: 'field__label' }, 'Trier par'), sortSelect),
      h('p', { class: 'muted', style: 'font-size:0.8rem' }, DRINK_SORT_HINTS[prefs.sort]),
    );
  };
  const bottlesTotal = colors.reduce((n, c) => n + c.bottles, 0);
  draw();
  section.append(...(showControls ? [controls] : []), body);
  return section;
}

// --- À racheter ---

function rebuySection(rows: WineRow[], thumbs: Map<string, string>, ctx: AppContext): HTMLElement | null {
  const entries = rebuyList(rows);
  const onList = shoppingList(rows).length;
  if (entries.length === 0 && onList === 0) return null;
  const refresh = (): void => void window.dispatchEvent(new HashChangeEvent('hashchange'));
  const list = h('ul', { class: 'tbd__list' });
  for (const { row, reason } of entries.slice(0, PAGE)) {
    const w = row.wine;
    const note = [
      reason === 'out' ? 'Plus en stock' : 'Dernière bouteille',
      w.rating ? `Note ${w.rating}/5` : '',
      w.supplier ? `chez ${w.supplier}` : '',
      w.purchase_price !== null ? `payée ${formatEuro(w.purchase_price)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const listed = w.to_buy === true;
    list.append(
      h(
        'li',
        { class: 'tbd__item' },
        renderWineCard(row, { href: wineHref(w.id, '/stats'), thumb: thumbs.get(w.id) }),
        h(
          'div',
          { class: 'tbd__foot' },
          h('p', { class: 'tbd__note' }, note),
          h(
            'button',
            { class: 'btn btn--small', type: 'button', 'aria-pressed': String(listed), onClick: () => void ctx.repo.setToBuy(w.id, !listed).then(refresh) },
            listed ? 'Dans ma liste ✓' : 'Ajouter à ma liste',
          ),
        ),
      ),
    );
  }
  return h(
    'section',
    { class: 'home__section', 'aria-labelledby': 'h-rebuy' },
    h('h2', { id: 'h-rebuy' }, 'À racheter'),
    h('p', { class: 'muted' }, 'Vos bouteilles notées 4 ou 5, épuisées ou à leur dernier exemplaire.'),
    list,
    entries.length > PAGE ? h('p', { class: 'muted' }, `+ ${plural(entries.length - PAGE, 'autre fiche', 'autres fiches')} dans la Liste (filtre « Historique »).`) : null,
    h('a', { class: 'btn btn--small', href: '#/courses' }, `Ma liste de courses (${onList})`),
  );
}

// --- Statistiques ---

/** Ouvre la Liste préfiltrée (les filtres précédents sont remplacés). */
function openList(filters: Partial<Filters>): void {
  savePref('list.filters', { ...emptyFilters(), ...filters });
  Router.go('/liste');
}

/**
 * Barres horizontales. Avec `pick`, chaque ligne qui correspond à un filtre devient un bouton qui ouvre la Liste
 * préfiltrée ; les autres (millésime non renseigné…) restent de simples lignes.
 */
function bars(slices: Slice[], total: number, label: (s: Slice) => string = (s) => s.label, pick?: (s: Slice) => Partial<Filters> | null): HTMLElement {
  const max = Math.max(1, ...slices.map((s) => s.bottles));
  return h(
    'ul',
    { class: 'bars' },
    slices.map((s) => {
      const filter = pick?.(s) ?? null;
      const inner = [
        h('span', { class: 'bars__label' }, label(s)),
        h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: 'bars__fill', style: `width:${Math.max(3, Math.round((s.bottles / max) * 100))}%` })),
        h('span', { class: 'bars__value', 'aria-label': `${bottles(s.bottles)}, ${Math.round((s.bottles / Math.max(1, total)) * 100)} %` }, String(s.bottles), filter ? h('span', { class: 'bars__chev', 'aria-hidden': 'true' }, '›') : null),
      ];
      return h(
        'li',
        { class: 'bars__item' },
        filter
          ? h('button', { class: 'bars__row bars__btn', type: 'button', 'data-stat': label(s), 'aria-label': `${label(s)} : ${bottles(s.bottles)}. Voir dans la Liste`, onClick: () => openList(filter) }, ...inner)
          : h('div', { class: 'bars__row' }, ...inner),
      );
    }),
  );
}

const AXES: { axis: Axis; title: string; top: number }[] = [
  { axis: 'color', title: 'Par couleur', top: 6 },
  { axis: 'country', title: 'Par pays', top: 6 },
  { axis: 'region', title: 'Par région', top: 8 },
  { axis: 'vintage', title: 'Par millésime', top: 8 },
  { axis: 'appellation', title: 'Par appellation', top: 8 },
];

function statsSection(rows: WineRow[], outflows: Outflow[], year: number, now: Date): HTMLElement {
  const ov = overview(rows);
  const section = h('section', { class: 'home__section', 'aria-labelledby': 'h-stats' }, h('h2', { id: 'h-stats' }, 'Statistiques'));
  const hint = h('p', { class: 'muted', style: 'font-size:0.85rem' }, 'Touchez une ligne pour voir les bouteilles correspondantes dans la Liste.');
  if (ov.bottles === 0 && outflows.length === 0) {
    section.append(h('div', { class: 'card empty muted' }, 'Les statistiques apparaîtront dès que la cave contiendra des bouteilles.'));
    return section;
  }
  section.append(hint);
  const value = cellarValue(rows);
  const tile = (label: string, v: string, sub?: string): HTMLElement =>
    h('div', { class: 'tile' }, h('dt', { class: 'muted' }, label), h('dd', {}, v, sub ? h('small', { class: 'muted' }, sub) : null));

  section.append(
    h(
      'dl',
      { class: 'tiles card' },
      tile('Bouteilles', String(ov.bottles)),
      tile('Fiches', String(ov.wines)),
      tile('Valeur d’achat', value.pricedBottles > 0 ? formatEuro(value.total) : '—', value.unpricedWines > 0 ? `${plural(value.unpricedWines, 'fiche sans prix', 'fiches sans prix')}, non comptée${value.unpricedWines > 1 ? 's' : ''}` : undefined),
      tile('Prix moyen', value.average !== null ? formatEuro(value.average) : '—', value.average !== null ? 'par bouteille' : undefined),
    ),
  );

  // Maturité
  const mat = maturityGroups(rows, year);
  const matSlices: Slice[] = mat.filter((g) => g.bottles > 0).map((g) => ({ label: MATURITY_LABELS[g.category as Maturity], bottles: g.bottles, wines: g.entries.length }));
  const matByLabel = new Map(mat.map((g) => [MATURITY_LABELS[g.category], g.category] as const));
  if (matSlices.length > 0) section.append(h('div', { class: 'card' }, h('h3', {}, 'Maturité'), bars(matSlices, ov.bottles, undefined, (s) => maturityFilter(matByLabel.get(s.label)!))));

  // Répartitions
  for (const { axis, title, top } of AXES) {
    const slices = topSlices(distribution(rows, axis), top);
    if (slices.length === 0) continue;
    section.append(h('div', { class: 'card' }, h('h3', {}, title), bars(slices, ov.bottles, axis === 'color' ? (s) => colorLabel(s.label) || s.label : undefined, (s) => sliceFilter(axis, s))));
  }

  // Consommation
  const c = consumption(outflows, now);
  const maxM = Math.max(1, ...c.months.map((m) => m.count));
  section.append(
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Consommation (12 derniers mois)'),
      c.total === 0
        ? h('p', { class: 'muted' }, 'Aucune sortie enregistrée sur cette période.')
        : [
            h(
              'ol',
              { class: 'cols', 'aria-label': 'Bouteilles sorties par mois' },
              c.months.map((m) =>
                h(
                  'li',
                  { class: 'cols__item', 'aria-label': `${monthLabel(m.month)} : ${bottles(m.count)}` },
                  h('span', { class: 'cols__value', 'aria-hidden': 'true' }, m.count > 0 ? String(m.count) : ''),
                  h('span', { class: 'cols__bar', 'aria-hidden': 'true', style: `height:${m.count === 0 ? 2 : Math.max(6, Math.round((m.count / maxM) * 64))}px` }),
                  h('span', { class: 'cols__label', 'aria-hidden': 'true' }, monthLabel(m.month).split(' ')[0]!),
                ),
              ),
            ),
            h('p', { class: 'muted' }, `${bottles(c.total)} sortie${c.total > 1 ? 's' : ''} : ${OUTFLOW_REASONS.filter((r) => c.byReason[r] > 0).map((r) => `${c.byReason[r]} ${OUTFLOW_REASON_LABELS[r].toLowerCase()}`).join(', ')}.`),
          ],
    ),
  );
  return section;
}

export async function homeView(ctx: AppContext): Promise<HTMLElement> {
  const [wines, stocks, locations, furniture, outflows, thumbs] = await Promise.all([
    ctx.repo.list('wine'),
    ctx.repo.list('stock'),
    ctx.repo.list('location'),
    ctx.repo.list('furniture'),
    ctx.repo.list('outflow'),
    ctx.repo.thumbnailUrls(),
  ]);
  const rows = buildRows({ wines, stocks, locations, furniture });
  const now = new Date();
  const year = now.getFullYear();
  const total = overview(rows).bottles;
  // « Je la bois » : sortie de stock, puis l'Accueil se recalcule (le routeur réécoute le hash).
  const onDrink: Drink = (wine) => {
    void quickOutflow(ctx, wine).then((done) => {
      if (done) window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  };
  // Arrivé par le bouton « À boire » de la Cave : on se place sur ce bloc.
  if (hashQuery().get('go') === 'a-boire') setTimeout(() => document.getElementById('h-tbd')?.scrollIntoView({ block: 'start' }), 60);
  return h(
    'main',
    { class: 'view home' },
    pageHeader({ title: 'Stats', subtitle: total === 0 ? null : bottles(total) }),
    toDrinkSection(rows, year, onDrink),
    rebuySection(rows, thumbs, ctx),
    statsSection(rows, outflows, year, now),
  );
}
