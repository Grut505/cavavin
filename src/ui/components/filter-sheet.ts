// Feuille de filtres (FR-008) : critères combinables, compteur de résultats en direct.
import {
  activeFilterCount,
  emptyFilters,
  facetsOf,
  queryRows,
  type Filters,
  type SortSpec,
  type WineRow,
} from '../../domain/query';
import { sortByOrder } from '../../domain/locations';
import { MATURITY_LABELS, MATURITY_ORDER, classify } from '../../domain/maturity';
import type { Furniture, Location, WineColor } from '../../domain/types';
import { h } from '../dom';
import { colorLabel } from './wine-card';
import { openDialog } from './dialog';

export interface FilterSheetInput {
  rows: WineRow[];
  locations: Location[];
  furniture: Furniture[];
  filters: Filters;
  sort: SortSpec;
  /** Bouteilles par emplacement, pour guider le choix. */
  counts: Map<string, number>;
  /** Personnes (donateurs de cadeaux) proposées dans « Offert par ». */
  persons?: { id: string; name: string }[];
}

const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const parseInt0 = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** `null` si annulé. */
export function openFilterSheet(input: FilterSheetInput): Promise<Filters | null> {
  const facets = facetsOf(input.rows);
  const { result } = openDialog<Filters>(
    'Filtres',
    (close) => {
      let draft: Filters = { ...input.filters };
      const body = h('div', { class: 'stack' });
      const apply = h('button', { class: 'btn btn--primary', type: 'button' });
      const reset = h('button', { class: 'btn', type: 'button' }, 'Réinitialiser');

      const count = (): number => queryRows(input.rows, draft, input.sort).length;
      const refresh = (): void => {
        const n = count();
        apply.textContent = n === 0 ? 'Aucun résultat' : `Afficher ${n} résultat${n > 1 ? 's' : ''}`;
        reset.toggleAttribute('disabled', activeFilterCount(draft) === 0);
      };

      const chip = (label: string, checked: boolean, onChange: () => void, extra?: string): HTMLElement => {
        const box = h('input', { type: 'checkbox', class: 'chip__input', ...(checked ? { checked: true } : {}) });
        box.addEventListener('change', () => {
          onChange();
          refresh();
        });
        return h('label', { class: 'chip' }, box, h('span', { class: 'chip__label' }, label, extra ? h('small', {}, extra) : null));
      };

      const group = (title: string, ...children: (HTMLElement | null)[]): HTMLElement =>
        h('fieldset', { class: 'filter-group' }, h('legend', { class: 'section-title' }, title), ...children.filter((c): c is HTMLElement => c !== null));

      const numberField = (label: string, value: number | null, placeholder: string, set: (n: number | null) => void): HTMLElement => {
        const input = h('input', {
          class: 'field__input',
          type: 'number',
          inputmode: 'numeric',
          min: '0',
          placeholder,
          'aria-label': label,
          ...(value !== null ? { value: String(value) } : {}),
        });
        input.addEventListener('input', () => {
          set(parseInt0(input.value));
          refresh();
        });
        return h('label', { class: 'field grow' }, h('span', { class: 'field__label' }, label), input);
      };

      const giftGroup = (): HTMLElement | null => {
        const named = new Map((input.persons ?? []).map((p) => [p.id, p.name] as const));
        const ids = new Set<string>(draft.giftFrom ? [draft.giftFrom] : []);
        for (const r of input.rows) if (r.quantity > 0 && r.wine.gift && r.wine.gift_from) ids.add(r.wine.gift_from);
        if (ids.size === 0) return null;
        const options = [...ids]
          .map((id) => ({ id, name: named.get(id) ?? 'Personne retirée de la liste' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
        return group(
          'Offert par',
          h(
            'div',
            { class: 'chips' },
            options.map((o) => chip(o.name, draft.giftFrom === o.id, () => {
                draft.giftFrom = draft.giftFrom === o.id ? null : o.id;
                render();
              })),
          ),
        );
      };

      const render = (): void => {
        const colors = [...new Set<WineColor>([...facets.colors, ...draft.colors])];
        const countries = [...new Set([...facets.countries, ...draft.countries])];
        const regions = [...new Set([...facets.regions, ...draft.regions])];
        const appellations = [...new Set([...facets.appellations, ...draft.appellations])];
        const year = new Date().getFullYear();
        const maturityCounts = new Map<string, number>();
        for (const r of input.rows) if (r.quantity > 0) maturityCounts.set(classify(r.wine, year).category, (maturityCounts.get(classify(r.wine, year).category) ?? 0) + r.quantity);
        const nameOf = (v: string): string => (v === '' ? 'Non renseigné' : v);

        const live = input.locations.filter((l) => !l.deleted);
        const shelvesOf = (fid: string): Location[] =>
          sortByOrder(live.filter((l) => l.kind === 'shelf' && l.furniture_id === fid));
        const locChip = (l: Location): HTMLElement =>
          chip(l.name, draft.locationIds.includes(l.id), () => (draft.locationIds = toggle(draft.locationIds, l.id)), String(input.counts.get(l.id) ?? 0));
        const furnitureGroups = sortByOrder(input.furniture.filter((f) => !f.deleted))
          .map((f) => ({ f, shelves: shelvesOf(f.id) }))
          .filter((g) => g.shelves.length > 0);
        const places = sortByOrder(live.filter((l) => l.kind === 'place'));
        const toSort = live.filter((l) => l.kind === 'legacy' && (input.counts.get(l.id) ?? 0) > 0);

        const sections: (HTMLElement | null)[] = [
          colors.length > 0
            ? group('Couleur', h('div', { class: 'chips' }, colors.map((c) => chip(colorLabel(c), draft.colors.includes(c), () => (draft.colors = toggle(draft.colors, c))))))
            : null,
          group(
            'Maturité',
            h(
              'div',
              { class: 'chips' },
              MATURITY_ORDER.filter((m) => (maturityCounts.get(m) ?? 0) > 0 || draft.maturity.includes(m)).map((m) =>
                chip(MATURITY_LABELS[m], draft.maturity.includes(m), () => (draft.maturity = toggle(draft.maturity, m)), String(maturityCounts.get(m) ?? 0)),
              ),
            ),
          ),
          countries.length > 0
            ? group('Pays', h('div', { class: 'chips' }, countries.map((c) => chip(nameOf(c), draft.countries.includes(c), () => (draft.countries = toggle(draft.countries, c))))))
            : null,
          regions.length > 0
            ? group('Région', h('div', { class: 'chips' }, regions.map((r) => chip(nameOf(r), draft.regions.includes(r), () => (draft.regions = toggle(draft.regions, r))))))
            : null,
          appellations.length > 0
            ? group('Appellation', h('div', { class: 'chips' }, appellations.map((a) => chip(nameOf(a), draft.appellations.includes(a), () => (draft.appellations = toggle(draft.appellations, a))))))
            : null,
          group(
            'Millésime',
            h(
              'div',
              { class: 'row' },
              numberField('De', draft.vintageMin, facets.vintageMin ? String(facets.vintageMin) : 'année', (n) => (draft.vintageMin = n)),
              numberField('À', draft.vintageMax, facets.vintageMax ? String(facets.vintageMax) : 'année', (n) => (draft.vintageMax = n)),
            ),
            chip('Non millésimés (NV)', draft.vintageNone, () => (draft.vintageNone = !draft.vintageNone)),
            draft.vintages.length > 0
              ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Années choisies' }, draft.vintages.map((y) => chip(String(y), true, () => { draft.vintages = draft.vintages.filter((v) => v !== y); render(); })))
              : null,
            h('p', { class: 'muted', style: 'font-size:0.8rem' }, 'Une plage seule exclut les non millésimés ; cochez « Non millésimés » pour les ajouter à la plage, ou les voir seuls.'),
          ),
          group(
            'Quantité en stock',
            h(
              'div',
              { class: 'row' },
              numberField('Au moins', draft.qtyMin, '1', (n) => (draft.qtyMin = n)),
              numberField('Au plus', draft.qtyMax, '12', (n) => (draft.qtyMax = n)),
            ),
          ),
          ...furnitureGroups.map(({ f, shelves }) => group(f.name, h('div', { class: 'chips' }, shelves.map(locChip)))),
          places.length > 0 ? group('Autres lieux', h('div', { class: 'chips' }, places.map(locChip))) : null,
          toSort.length > 0 ? group('À ranger', h('div', { class: 'chips' }, toSort.map(locChip))) : null,
          giftGroup(),
          group(
            'Historique',
            chip('Inclure les fiches sans bouteille en stock', draft.includeHistory, () => (draft.includeHistory = !draft.includeHistory)),
          ),
        ];
        body.replaceChildren(...sections.filter((s): s is HTMLElement => s !== null));
        refresh();
      };

      reset.addEventListener('click', () => {
        draft = emptyFilters();
        render();
      });
      apply.addEventListener('click', () => close(draft));
      render();

      return [
        body,
        h(
          'div',
          { class: 'dialog__actions dialog__actions--sticky' },
          h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler'),
          reset,
          apply,
        ),
      ];
    },
    { sheet: true },
  );
  return result;
}
