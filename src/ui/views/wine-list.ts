// Liste des fiches : tri, filtres, compteur de résultats, états vide / chargement.
import type { AppContext } from '../../app';
import { bottleCounts } from '../../domain/locations';
import {
  SORT_LABELS,
  activeFilterCount,
  buildRows,
  emptyFilters,
  queryRows,
  totalBottles,
  type Filters,
  type SortDir,
  type SortKey,
  type SortSpec,
  type WineRow,
} from '../../domain/query';
import { WINE_COLORS, type Furniture, type Location } from '../../domain/types';
import { openFilterSheet } from '../components/filter-sheet';
import { pageHeader } from '../components/page-header';
import { searchRows } from '../../domain/search';
import { renderWineCard } from '../components/wine-card';
import { h } from '../dom';
import { icon } from '../icons';
import { loadPref, savePref } from '../prefs';

const DEFAULT_SORT: SortSpec = { key: 'domain', dir: 'asc' };

function normalizeSort(raw: unknown): SortSpec | null {
  const r = raw as Partial<SortSpec> | null;
  if (r && typeof r === 'object' && r.key && r.key in SORT_LABELS && (r.dir === 'asc' || r.dir === 'desc')) {
    return { key: r.key, dir: r.dir };
  }
  return null;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

function normalizeFilters(raw: unknown): Filters | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    colors: strings(r.colors).filter((c): c is Filters['colors'][number] => (WINE_COLORS as readonly string[]).includes(c)),
    countries: strings(r.countries),
    regions: strings(r.regions),
    vintageMin: intOrNull(r.vintageMin),
    vintageMax: intOrNull(r.vintageMax),
    qtyMin: intOrNull(r.qtyMin),
    qtyMax: intOrNull(r.qtyMax),
    locationIds: strings(r.locationIds),
    giftFrom: typeof r.giftFrom === 'string' ? r.giftFrom : null,
    includeHistory: r.includeHistory === true,
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

export function wineListView(ctx: AppContext): HTMLElement {
  let sort = loadPref<SortSpec>('list.sort', DEFAULT_SORT, normalizeSort);
  let filters = loadPref<Filters>('list.filters', emptyFilters(), normalizeFilters);
  let rows: WineRow[] = [];
  let locations: Location[] = [];
  let furniture: Furniture[] = [];
  let counts = new Map<string, number>();
  let thumbs = new Map<string, string>();
  let people = new Map<string, string>();
  let personList: { id: string; name: string }[] = [];
  let query = '';

  const root = h('main', { class: 'view' });
  const skeleton = (): HTMLElement =>
    h(
      'div',
      { class: 'stack', role: 'status', 'aria-label': 'Chargement' },
      ...[0, 1, 2, 3].map(() => h('div', { class: 'skeleton skeleton--card' })),
    );
  root.append(pageHeader({ title: 'Liste' }), skeleton());

  const sortSelect = h(
    'select',
    { class: 'field__input', 'aria-label': 'Trier par' },
    (Object.keys(SORT_LABELS) as SortKey[]).map((k) => h('option', { value: k }, SORT_LABELS[k])),
  );
  const dirBtn = h('button', { class: 'icon-btn', type: 'button' });
  const filterBtn = h('button', { class: 'btn btn--small', type: 'button' });
  const summary = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const resetBtn = h('button', { class: 'btn btn--small', type: 'button' }, 'Réinitialiser les filtres');
  const list = h('div', { class: 'stack' });

  const searchInput = h('input', {
    class: 'field__input search',
    type: 'search',
    placeholder: 'Rechercher : domaine, appellation, millésime, emplacement…',
    'aria-label': 'Rechercher',
    autocomplete: 'off',
    enterkeyhint: 'search',
    id: 'wine-search',
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    draw();
  });

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h('div', { class: 'toolbar__sort' }, sortSelect),
    dirBtn,
    filterBtn,
  );

  const saveAndDraw = (): void => {
    savePref('list.sort', sort);
    savePref('list.filters', filters);
    draw();
  };

  sortSelect.addEventListener('change', () => {
    sort = { ...sort, key: sortSelect.value as SortKey };
    saveAndDraw();
  });
  dirBtn.addEventListener('click', () => {
    sort = { ...sort, dir: (sort.dir === 'asc' ? 'desc' : 'asc') as SortDir };
    saveAndDraw();
  });
  resetBtn.addEventListener('click', () => {
    filters = emptyFilters();
    saveAndDraw();
  });
  filterBtn.addEventListener('click', async () => {
    const next = await openFilterSheet({ rows, locations, furniture, filters, sort, counts, persons: personList });
    if (next) {
      filters = next;
      saveAndDraw();
    }
  });

  function draw(): void {
    const filtered = queryRows(rows, filters, sort);
    // Avec une recherche, les résultats sont classés par pertinence (le tri choisi départage les égalités).
    const result = searchRows(filtered, query);
    const searching = query.trim() !== '';
    const nFilters = activeFilterCount(filters);

    sortSelect.value = sort.key;
    dirBtn.replaceChildren(icon(sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'));
    dirBtn.setAttribute('aria-label', sort.dir === 'asc' ? 'Ordre croissant (toucher pour inverser)' : 'Ordre décroissant (toucher pour inverser)');
    filterBtn.replaceChildren(
      icon('filter'),
      'Filtres',
      ...(nFilters > 0 ? [h('span', { class: 'badge', 'aria-label': `${nFilters} filtres actifs` }, String(nFilters))] : []),
    );

    const header = pageHeader({
      title: 'Liste',
      subtitle: rows.length === 0 ? null : `${plural(result.length, 'fiche', 'fiches')} · ${plural(totalBottles(result), 'bouteille', 'bouteilles')}`,
    });
    root.firstElementChild?.replaceWith(header);

    summary.textContent =
      nFilters > 0 && searching
        ? `${plural(result.length, 'résultat', 'résultats')} pour « ${query.trim()} » avec ${plural(nFilters, 'filtre', 'filtres')}`
        : nFilters > 0
          ? `${plural(result.length, 'résultat', 'résultats')} avec ${plural(nFilters, 'filtre', 'filtres')}`
          : searching
            ? `${plural(result.length, 'résultat', 'résultats')} pour « ${query.trim()} »`
            : '';
    resetBtn.toggleAttribute('hidden', nFilters === 0);

    if (rows.length === 0) {
      list.replaceChildren(
        h(
          'div',
          { class: 'card empty' },
          h('h2', {}, 'Aucune bouteille'),
          h('p', { class: 'muted' }, 'Ajoutez votre première bouteille pour commencer à remplir la cave.'),
          h('a', { class: 'btn btn--primary', href: '#/ajouter' }, 'Ajouter une bouteille'),
        ),
      );
      return;
    }
    if (result.length === 0) {
      list.replaceChildren(
        h(
          'div',
          { class: 'card empty' },
          h('h2', {}, 'Aucun résultat'),
          h('p', { class: 'muted' }, searching ? `Aucune fiche ne correspond à « ${query.trim()} ».` : 'Aucune fiche ne correspond à ces filtres.'),
          searching
            ? h(
                'button',
                {
                  class: 'btn btn--primary',
                  type: 'button',
                  onClick: () => {
                    query = '';
                    searchInput.value = '';
                    draw();
                  },
                },
                'Effacer la recherche',
              )
            : null,
          nFilters > 0
            ? h('button', { class: `btn${searching ? '' : ' btn--primary'}`, type: 'button', onClick: () => resetBtn.click() }, 'Réinitialiser les filtres')
            : null,
        ),
      );
      return;
    }
    list.replaceChildren(...result.map((r) => renderWineCard(r, {
          thumb: thumbs.get(r.wine.id),
          href: `#/vin/${r.wine.id}`,
          giftFrom: r.wine.gift_from ? people.get(r.wine.gift_from) : null,
        })));
  }

  async function load(): Promise<void> {
    const [wines, stocks, locs, furn, th, persons] = await Promise.all([
      ctx.repo.list('wine'),
      ctx.repo.list('stock'),
      ctx.repo.list('location'),
      ctx.repo.list('furniture'),
      ctx.repo.thumbnailUrls(),
      ctx.repo.list('person', true),
    ]);
    locations = locs;
    furniture = furn;
    thumbs = th;
    people = new Map(persons.map((p) => [p.id, p.name]));
    personList = persons.map((p) => ({ id: p.id, name: p.name }));
    counts = bottleCounts(stocks);
    rows = buildRows({ wines, stocks, locations, furniture });
    if (!root.querySelector('.toolbar')) {
      root.replaceChildren(root.firstElementChild!, searchInput, toolbar, summary, resetBtn, list);
    }
    draw();
  }

  const unsubscribe = ctx.repo.subscribe(() => {
    if (!root.isConnected) return unsubscribe();
    void load();
  });
  void load();
  return root;
}
