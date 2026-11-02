// Schéma visuel de la cave : meubles → étagères tactiles, lieux en puces.
import type { Furniture, Location } from '../../domain/types';
import { sortByOrder } from '../../domain/locations';
import { h } from '../dom';
import './cave-map.css';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const ROW = 56; // ≥ 44 px : cible tactile
const MAX_BOTTLES = 10;

function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export interface CaveMapData {
  furniture: Furniture[];
  locations: Location[];
  counts: Map<string, number>;
}

export interface CaveMapOptions {
  onSelect: (loc: Location) => void;
  selectedId?: string;
  /** Emplacements à mettre en évidence (ex. où se trouve une fiche). */
  highlightIds?: string[];
}

export const bottlesLabel = (n: number): string => `${n} bouteille${n > 1 ? 's' : ''}`;

function bottle(x: number, baseline: number): SVGElement {
  const g = s('g', { class: 'shelf__bottle-g' });
  g.append(
    s('rect', { class: 'shelf__bottle', x: x + 3.5, y: baseline - 28, width: 5, height: 9, rx: 1 }),
    s('rect', { class: 'shelf__bottle', x, y: baseline - 20, width: 12, height: 20, rx: 3 }),
  );
  return g;
}

function shelfRow(
  shelf: Location,
  count: number,
  index: number,
  opts: CaveMapOptions,
): SVGElement {
  const y = 8 + index * ROW;
  const g = s('g', {
    class: `shelf${shelf.id === opts.selectedId || opts.highlightIds?.includes(shelf.id) ? ' shelf--selected' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-label': `${shelf.name}, ${count === 0 ? 'vide' : bottlesLabel(count)}`,
    'data-location-id': shelf.id,
  });
  g.append(s('rect', { class: 'shelf__hit', x: 8, y, width: W - 16, height: ROW - 2, rx: 8 }));
  g.append(s('text', { class: 'shelf__name', x: 18, y: y + 17 }, shelf.name));
  g.append(s('text', { class: 'shelf__count', x: W - 18, y: y + 17, 'text-anchor': 'end' }, String(count)));
  const baseline = y + ROW - 8;
  const shown = Math.min(count, MAX_BOTTLES);
  for (let k = 0; k < shown; k++) g.append(bottle(18 + k * 17, baseline));
  if (count > MAX_BOTTLES) {
    g.append(s('text', { class: 'shelf__count', x: 18 + shown * 17 + 4, y: baseline - 4 }, `+${count - MAX_BOTTLES}`));
  }
  if (count === 0) g.append(s('text', { class: 'shelf__empty', x: 18, y: baseline - 4 }, 'vide'));
  g.append(s('rect', { class: 'shelf__board', x: 14, y: baseline + 2, width: W - 28, height: 4, rx: 2 }));

  const select = (): void => opts.onSelect(shelf);
  g.addEventListener('click', select);
  g.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      select();
    }
  });
  return g;
}

function rack(
  furniture: Furniture,
  shelves: Location[],
  counts: Map<string, number>,
  opts: CaveMapOptions,
): HTMLElement {
  const section = h('section', { class: 'rack', 'aria-label': furniture.name }, h('h2', {}, furniture.name));
  if (shelves.length === 0) {
    section.append(h('p', { class: 'muted rack__none' }, 'Aucune étagère dans ce meuble.'));
    return section;
  }
  const height = shelves.length * ROW + 16;
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, role: 'group', 'aria-label': `Schéma de ${furniture.name}` });
  svg.append(s('rect', { class: 'rack__frame', x: 4, y: 4, width: W - 8, height: height - 8, rx: 10 }));
  shelves.forEach((sh, i) => svg.append(shelfRow(sh, counts.get(sh.id) ?? 0, i, opts)));
  section.append(svg);
  return section;
}

export function renderCaveMap(data: CaveMapData, opts: CaveMapOptions): HTMLElement {
  const root = h('div', { class: 'cave-map' });
  const locations = data.locations.filter((l) => !l.deleted);

  for (const f of sortByOrder(data.furniture.filter((x) => !x.deleted))) {
    const shelves = sortByOrder(locations.filter((l) => l.kind === 'shelf' && l.furniture_id === f.id));
    root.append(rack(f, shelves, data.counts, opts));
  }

  const places = sortByOrder(locations.filter((l) => l.kind === 'place'));
  const toSort = locations.filter((l) => l.kind === 'legacy' && (data.counts.get(l.id) ?? 0) > 0);
  const chips = (title: string, items: Location[]): HTMLElement | null =>
    items.length === 0
      ? null
      : h(
          'section',
          { class: 'rack', 'aria-label': title },
          h('h2', {}, title),
          h(
            'div',
            { class: 'places' },
            items.map((l) =>
              h(
                'button',
                {
                  class: `place${l.id === opts.selectedId || opts.highlightIds?.includes(l.id) ? ' place--selected' : ''}`,
                  type: 'button',
                  'data-location-id': l.id,
                  onClick: () => opts.onSelect(l),
                },
                l.name,
                h('span', { class: 'badge' }, String(data.counts.get(l.id) ?? 0)),
              ),
            ),
          ),
        );
  for (const c of [chips('Autres lieux', places), chips('À ranger', toSort)]) if (c) root.append(c);
  return root;
}
