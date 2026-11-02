// Accueil : « À boire » en premier, puis « Quoi boire ce soir ? » et les statistiques globales (spec 002).
import type { AppContext } from '../../app';
import {
  DRINK_SORT_HINTS,
  DRINK_SORT_LABELS,
  MATURITY_HINTS,
  MATURITY_LABELS,
  colorCounts,
  maturityGroups,
  windowText,
  type DrinkSort,
  type Maturity,
  type MaturityEntry,
  type MaturityGroup,
} from '../../domain/maturity';
import { pairingVocabulary, searchByDish } from '../../domain/pairing';
import { rebuyList } from '../../domain/rebuy';
import { isVegetarian } from '../../domain/pairing-list';
import { buildRows, type WineRow } from '../../domain/query';
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
import { wineTitle } from '../../domain/wine';
import { wineHref } from '../nav-origin';
import { loadPref, savePref } from '../prefs';
import { pageHeader } from '../components/page-header';
import { quickOutflow } from '../components/quick-outflow';
import { colorLabel, renderWineCard } from '../components/wine-card';
import { h } from '../dom';
import './home.css';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
const bottles = (n: number): string => plural(n, 'bouteille', 'bouteilles');
const PAGE = 10;

type Drink = (wine: Wine) => void;

/** Ligne d'information sous une carte, avec le bouton « Je la bois ». */
function noteRow(note: string, urgent: boolean, wine: Wine, onDrink: Drink): HTMLElement {
  return h(
    'div',
    { class: 'tbd__foot' },
    h('p', { class: `tbd__note${urgent ? ' tbd__note--urgent' : ''}` }, note),
    h('button', { class: 'btn btn--small', type: 'button', onClick: () => onDrink(wine), 'aria-label': `Je la bois : ${wineTitle(wine).primary}` }, 'Je la bois'),
  );
}

// --- À boire ---

function entryRow(e: MaturityEntry, thumbs: Map<string, string>, year: number, onDrink: Drink): HTMLElement {
  const w = e.row.wine;
  const window = windowText(w);
  const note = [window ? `Garde : ${window}` : '', e.info.finishing ? 'à finir' : '', e.info.category === 'late' && w.drink_until !== null ? `dépassée depuis ${year - w.drink_until} an${year - w.drink_until > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    { class: 'tbd__item' },
    renderWineCard(e.row, { href: wineHref(w.id, '/accueil'), thumb: thumbs.get(w.id) }),
    noteRow(note, e.info.finishing || e.info.category === 'late', w, onDrink),
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

function toDrinkSection(rows: WineRow[], thumbs: Map<string, string>, year: number, onDrink: Drink): HTMLElement {
  const all = maturityGroups(rows, year);
  const totalWines = all.reduce((n, g) => n + g.entries.length, 0);
  const section = h('section', { class: 'home__section', 'aria-labelledby': 'h-tbd' }, h('h2', { id: 'h-tbd' }, 'À boire'));
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

  const renderGroup = (g: MaturityGroup): HTMLElement => {
    const list = h('ul', { class: 'tbd__list' });
    const footer = h('div', { class: 'tbd__more' });
    // Sous-titres « À finir » / « À point » seulement quand le tri par urgence mélange les deux.
    const finishingCount = g.entries.filter((e) => e.info.finishing).length;
    const split = prefs.sort === 'urgency' && g.category === 'now' && finishingCount > 0 && finishingCount < g.entries.length;
    let shown = 0;

    const paint = (): void => {
      const items: HTMLElement[] = [];
      g.entries.slice(0, shown).forEach((e, i) => {
        if (split && i === 0) items.push(h('li', { class: 'tbd__sub tbd__sub--urgent', role: 'presentation' }, `À finir (${finishingCount})`));
        if (split && i === finishingCount) items.push(h('li', { class: 'tbd__sub', role: 'presentation' }, `À point (${g.entries.length - finishingCount})`));
        items.push(entryRow(e, thumbs, year, onDrink));
      });
      list.replaceChildren(...items);
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
    shown = Math.min(PAGE, g.entries.length);
    paint();

    return h(
      'details',
      { class: `tbd tbd--${g.category}`, ...(g.category === 'late' || g.category === 'now' ? { open: true } : {}) },
      h(
        'summary',
        { class: 'tbd__summary' },
        h('span', { class: 'tbd__title' }, MATURITY_LABELS[g.category]),
        h('span', { class: 'badge', 'aria-label': bottles(g.bottles) }, String(g.bottles)),
        h('span', { class: 'tbd__hint muted' }, `${plural(g.entries.length, 'fiche', 'fiches')} · ${MATURITY_HINTS[g.category]}`),
      ),
      list,
      footer,
    );
  };

  const draw = (): void => {
    const groups = maturityGroups(rows, year, { color: prefs.color ?? undefined, sort: prefs.sort }).filter((g) => g.entries.length > 0);
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
    const chip = (label: string, color: WineColor | null): HTMLElement =>
      h('button', { class: `btn btn--small${prefs.color === color ? ' btn--primary' : ''}`, type: 'button', 'aria-pressed': String(prefs.color === color), onClick: () => setPrefs({ ...prefs, color }) }, label);
    const sortSelect = h(
      'select',
      { class: 'field__input', id: 'drink-sort', onChange: (e: Event) => setPrefs({ ...prefs, sort: (e.target as HTMLSelectElement).value as DrinkSort }) },
      (Object.keys(DRINK_SORT_LABELS) as DrinkSort[]).map((k) => h('option', { value: k, ...(k === prefs.sort ? { selected: true } : {}) }, DRINK_SORT_LABELS[k])),
    );
    sortSelect.value = prefs.sort;
    controls.replaceChildren(
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer par couleur' }, chip(`Toutes (${bottlesTotal})`, null), ...colors.map((c) => chip(`${colorLabel(c.color)} (${c.bottles})`, c.color))),
      h('label', { class: 'field', for: 'drink-sort' }, h('span', { class: 'field__label' }, 'Trier par'), sortSelect),
      h('p', { class: 'muted', style: 'font-size:0.8rem' }, DRINK_SORT_HINTS[prefs.sort]),
    );
  };
  const bottlesTotal = all.reduce((n, g) => n + g.bottles, 0);
  draw();
  section.append(...(showControls ? [controls] : []), body);
  return section;
}

// --- Quoi boire ce soir ? ---

/** Recherche des bouteilles en stock dont les mets conseillés correspondent au plat saisi (tolérante aux fautes). */
function dishSection(rows: WineRow[], thumbs: Map<string, string>, year: number, onDrink: Drink): HTMLElement {
  const input = h('input', {
    class: 'field__input',
    type: 'search',
    id: 'dish',
    placeholder: 'Ex. risotto aux champignons, curry de légumes…',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const results = h('ul', { class: 'tbd__list dish__results' });
  const chips = h('div', { class: 'chips' });

  const vocab = pairingVocabulary(rows, 8);
  for (const v of vocab) {
    chips.append(
      h('button', { class: 'btn btn--small', type: 'button', onClick: () => { input.value = v.label; search(); } }, v.label),
    );
  }

  function search(): void {
    const q = input.value;
    const res = searchByDish(rows, q, year);
    results.replaceChildren();
    if (res.tokens.length === 0) {
      status.textContent =
        vocab.length === 0
          ? 'Aucun mets n’est encore renseigné : ils sont ajoutés par Claude à la lecture d’étiquette, ou à la main sur la fiche.'
          : 'Tapez un plat ou un ingrédient, ou choisissez un mets de votre cave.';
      return;
    }
    if (res.matches.length === 0) {
      status.textContent = `${isVegetarian(q) ? '' : 'Les mets de la cave sont végétariens (ni viande, ni poisson) : essayez un plat végétarien ou un raccourci. '}Aucune bouteille ne correspond à « ${q.trim()} ».${res.withoutPairings > 0 ? ` ${plural(res.withoutPairings, 'fiche n’a', 'fiches n’ont')} aucun mets renseigné.` : ''}`;
      return;
    }
    status.textContent = `${plural(res.matches.length, 'fiche correspond', 'fiches correspondent')}, les plus à point d’abord.${res.withoutPairings > 0 ? ` ${plural(res.withoutPairings, 'fiche n’a', 'fiches n’ont')} aucun mets renseigné.` : ''}`;
    const paint = (shown: number): void => {
      results.replaceChildren(
        ...res.matches.slice(0, shown).map((m) => {
          const w = m.row.wine;
          const note = [MATURITY_LABELS[m.info.category] + (m.info.finishing ? ' (à finir)' : ''), m.window ? `garde ${m.window}` : '', `Accord : ${m.matched.join(', ')}`].filter(Boolean).join(' · ');
          return h(
            'li',
            { class: 'tbd__item' },
            renderWineCard(m.row, { href: wineHref(w.id, '/accueil'), thumb: thumbs.get(w.id) }),
            noteRow(note, m.info.finishing || m.info.category === 'late', w, onDrink),
          );
        }),
        ...(res.matches.length > shown
          ? [h('li', { class: 'tbd__more' }, h('button', { class: 'btn btn--small', type: 'button', onClick: () => paint(shown + PAGE) }, `Afficher ${Math.min(PAGE, res.matches.length - shown)} de plus (${plural(res.matches.length - shown, 'restante', 'restantes')})`))]
          : []),
      );
    };
    paint(PAGE);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 150);
  });

  const form = h(
    'form',
    {
      class: 'card stack',
      onSubmit: (e: Event) => {
        e.preventDefault();
        search();
      },
    },
    h('label', { class: 'field', for: 'dish' }, h('span', { class: 'field__label' }, 'Plat ou ingrédient (cuisine végétarienne)'), input),
    vocab.length > 0 ? chips : null,
    status,
    searchByDish(rows, '', year).withoutPairings > 0
      ? h('a', { class: 'btn btn--small', href: '#/mets' }, 'Compléter les mets des fiches sans mets')
      : null,
  );
  search();
  return h(
    'section',
    { class: 'home__section', 'aria-labelledby': 'h-occ' },
    h('h2', { id: 'h-occ' }, 'Quoi boire ce soir ?'),
    form,
    results,
  );
}

// --- À racheter ---

function rebuySection(rows: WineRow[], thumbs: Map<string, string>): HTMLElement | null {
  const entries = rebuyList(rows);
  if (entries.length === 0) return null;
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
    list.append(h('li', { class: 'tbd__item' }, renderWineCard(row, { href: wineHref(w.id, '/accueil'), thumb: thumbs.get(w.id) }), h('p', { class: 'tbd__note' }, note)));
  }
  return h(
    'section',
    { class: 'home__section', 'aria-labelledby': 'h-rebuy' },
    h('h2', { id: 'h-rebuy' }, 'À racheter'),
    h('p', { class: 'muted' }, 'Vos bouteilles notées 4 ou 5, épuisées ou à leur dernier exemplaire.'),
    list,
    entries.length > PAGE ? h('p', { class: 'muted' }, `+ ${plural(entries.length - PAGE, 'autre fiche', 'autres fiches')} dans la Liste (filtre « Historique »).`) : null,
  );
}

// --- Statistiques ---

function bars(slices: Slice[], total: number, label: (s: Slice) => string = (s) => s.label): HTMLElement {
  const max = Math.max(1, ...slices.map((s) => s.bottles));
  return h(
    'ul',
    { class: 'bars' },
    slices.map((s) =>
      h(
        'li',
        { class: 'bars__row' },
        h('span', { class: 'bars__label' }, label(s)),
        h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: 'bars__fill', style: `width:${Math.max(3, Math.round((s.bottles / max) * 100))}%` })),
        h('span', { class: 'bars__value', 'aria-label': `${bottles(s.bottles)}, ${Math.round((s.bottles / Math.max(1, total)) * 100)} %` }, String(s.bottles)),
      ),
    ),
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
  if (ov.bottles === 0 && outflows.length === 0) {
    section.append(h('div', { class: 'card empty muted' }, 'Les statistiques apparaîtront dès que la cave contiendra des bouteilles.'));
    return section;
  }
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
  if (matSlices.length > 0) section.append(h('div', { class: 'card' }, h('h3', {}, 'Maturité'), bars(matSlices, ov.bottles)));

  // Répartitions
  for (const { axis, title, top } of AXES) {
    const slices = topSlices(distribution(rows, axis), top);
    if (slices.length === 0) continue;
    section.append(h('div', { class: 'card' }, h('h3', {}, title), bars(slices, ov.bottles, axis === 'color' ? (s) => colorLabel(s.label) || s.label : undefined)));
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
  return h(
    'main',
    { class: 'view home' },
    pageHeader({ title: 'Accueil', subtitle: total === 0 ? null : bottles(total) }),
    toDrinkSection(rows, thumbs, year, onDrink),
    dishSection(rows, thumbs, year, onDrink),
    rebuySection(rows, thumbs),
    statsSection(rows, outflows, year, now),
  );
}
