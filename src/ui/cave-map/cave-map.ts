// Schéma visuel de la cave : meubles → étagères tactiles, lieux en puces.
import type { Furniture, Location } from '../../domain/types';
import { sortByOrder } from '../../domain/locations';
import { h } from '../dom';
import { bottleGlyph, nextId, s } from './svg';
import './cave-map.css';

const W = 320;
const ROW = 56; // ≥ 44 px : cible tactile
const MAX_BOTTLES = 10;
const IN = 20; // épaisseur des montants latéraux
const TOP = 30; // corniche + traverse haute

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

function shelfRow(
  shelf: Location,
  count: number,
  index: number,
  opts: CaveMapOptions,
): SVGElement {
  const y = TOP + 4 + index * ROW;
  const g = s('g', {
    class: `shelf${shelf.id === opts.selectedId || opts.highlightIds?.includes(shelf.id) ? ' shelf--selected' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-label': `${shelf.name}, ${count === 0 ? 'vide' : bottlesLabel(count)}`,
    'data-location-id': shelf.id,
  });
  g.append(s('rect', { class: 'shelf__hit', x: IN + 2, y, width: W - 2 * IN - 4, height: ROW - 2, rx: 6 }));
  g.append(s('text', { class: 'shelf__name', x: IN + 10, y: y + 17 }, shelf.name));
  g.append(s('text', { class: 'shelf__count', x: W - IN - 10, y: y + 17, 'text-anchor': 'end' }, String(count)));
  const baseline = y + ROW - 8;
  const shown = Math.min(count, MAX_BOTTLES);
  for (let k = 0; k < shown; k++) g.append(bottleGlyph(IN + 10 + k * 17, baseline - 28, 'shelf__bottle'));
  if (count > MAX_BOTTLES) {
    g.append(s('text', { class: 'shelf__count', x: IN + 10 + shown * 17 + 4, y: baseline - 4 }, `+${count - MAX_BOTTLES}`));
  }
  if (count === 0) g.append(s('text', { class: 'shelf__empty', x: IN + 10, y: baseline - 4 }, 'vide'));
  g.append(
    s('rect', { class: 'shelf__board', x: IN - 2, y: baseline + 2, width: W - 2 * IN + 4, height: 6, rx: 1.5 }),
    s('rect', { class: 'shelf__board-lip', x: IN - 2, y: baseline + 2, width: W - 2 * IN + 4, height: 1.5 }),
  );

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
  const innerH = shelves.length * ROW + 8;
  const bodyBottom = TOP + innerH + 12; // traverse basse
  const height = bodyBottom + 16; // + socle et pieds
  const grad = nextId('wood');
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, role: 'group', 'aria-label': `Schéma de ${furniture.name}` });
  svg.append(
    s(
      'defs',
      {},
      s(
        'linearGradient',
        { id: grad, x1: 0, y1: 0, x2: 1, y2: 0 },
        s('stop', { class: 'wood-stop-a', offset: '0%' }),
        s('stop', { class: 'wood-stop-b', offset: '50%' }),
        s('stop', { class: 'wood-stop-a', offset: '100%' }),
      ),
    ),
    // pieds et socle
    s('rect', { class: 'rack__foot', x: 14, y: bodyBottom, width: 18, height: 16, rx: 3 }),
    s('rect', { class: 'rack__foot', x: W - 32, y: bodyBottom, width: 18, height: 16, rx: 3 }),
    s('rect', { class: 'rack__plinth', x: 6, y: bodyBottom - 4, width: W - 12, height: 12, rx: 3 }),
    // caisson
    s('rect', { class: 'rack__body', x: 6, y: 14, width: W - 12, height: bodyBottom - 14 - 2, rx: 6, fill: `url(#${grad})` }),
    // corniche
    s('rect', { class: 'rack__cornice', x: 0, y: 0, width: W, height: 14, rx: 4 }),
    s('rect', { class: 'rack__cornice-lip', x: 0, y: 12, width: W, height: 3 }),
    // intérieur
    s('rect', { class: 'rack__cavity', x: IN, y: TOP, width: W - 2 * IN, height: innerH, rx: 3 }),
    s('rect', { class: 'rack__cavity-shade', x: IN, y: TOP, width: W - 2 * IN, height: 8, rx: 3 }),
  );
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
