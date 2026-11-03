// Vue de face d'une étagère : chaque bouteille est dessinée dans sa zone (dessus, gauche, droite,
// dessous) ou dans la bande « position non précisée ». Couleur = type de vin ; toucher = fiche.
import { POSITION_COLS, POSITION_HINTS, POSITION_ROWS, positionLabel, type PositionCol, type PositionHint, type PositionRow, type Stock, type Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { URGENCY_LABELS, urgencyOf, type Urgency } from '../../domain/urgency';
import { wineHref } from '../nav-origin';
import { bottleGlyph, s } from './svg';
import './cave-map.css';

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

// Trois rangées (dessus, milieu, dessous) de trois colonnes (gauche, centre, droite).
const COL_W = 96;
const ROW_H = 58;
const GAP = 4;
const ZONES = Object.fromEntries(
  POSITION_HINTS.map((hint) => {
    const [row, col] = hint.split('-') as [PositionRow, PositionCol];
    const r = POSITION_ROWS.indexOf(row);
    const c = POSITION_COLS.indexOf(col);
    return [hint, { x: 14 + c * (COL_W + GAP), y: 14 + r * (ROW_H + GAP), w: COL_W, h: ROW_H, label: positionLabel(hint) } satisfies Zone];
  }),
) as Record<PositionHint, Zone>;
const GRID_BOTTOM = 14 + 3 * ROW_H + 2 * GAP;

const SCALE = 0.78;
const BW = 12 * SCALE;
const BH = 28 * SCALE;
const PITCH_X = BW + 3.5;
const PITCH_Y = BH + 3;
const CAB_H = GRID_BOTTOM + 8 + 4 + 14 + 6;
const LOOSE_H = 52;

export interface ShelfBottle {
  wineId: string;
  title: string;
  color: Wine['color'];
  zone: PositionHint | null;
  /** Échéance de la fenêtre de garde : couleur de la bouteille dessinée. */
  urgency: Urgency;
}

/** Une entrée par bouteille, dans l'ordre des lignes de stock. */
export function shelfBottles(stocks: Stock[], wines: Wine[], year: number = new Date().getFullYear()): ShelfBottle[] {
  const out: ShelfBottle[] = [];
  for (const st of stocks) {
    const wine = wines.find((w) => w.id === st.wine_id);
    for (let k = 0; k < st.quantity; k++) {
      out.push({
        wineId: st.wine_id,
        title: wine ? wineTitle(wine).primary : 'Fiche introuvable',
        color: wine?.color ?? null,
        zone: st.position_hint,
        urgency: wine ? urgencyOf(wine, year) : 'unknown',
      });
    }
  }
  return out;
}

function bottleEl(b: ShelfBottle, x: number, y: number): SVGElement {
  const g = s('g', {
    class: 'sv__bottle',
    role: 'link',
    tabindex: 0,
    'aria-label': `${b.title}, ${URGENCY_LABELS[b.urgency].toLowerCase()}${b.zone ? `, ${positionLabel(b.zone).toLowerCase()}` : ''}`,
  });
  g.append(s('title', {}, `${b.title} · ${URGENCY_LABELS[b.urgency]}`));
  // zone tactile un peu plus large que le dessin
  g.append(s('rect', { class: 'sv__bottle-hit', x: x - 1.5, y: y - 1, width: BW + 3, height: BH + 2 }));
  g.append(bottleGlyph(x, y, `bottle u-fill u-fill--${b.urgency}`, SCALE));
  const go = (): void => {
    window.location.hash = wineHref(b.wineId); // mémorise l'étagère : le retour y ramène
  };
  g.addEventListener('click', go);
  g.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      go();
    }
  });
  return g;
}

/** Place les bouteilles dans un rectangle ; renvoie le nombre de bouteilles qui n'ont pas tenu. */
function fill(parent: SVGElement, items: ShelfBottle[], x0: number, y0: number, w: number, hgt: number): number {
  const perRow = Math.max(1, Math.floor((w + 3.5) / PITCH_X));
  const rows = Math.max(1, Math.floor((hgt + 3) / PITCH_Y));
  const capacity = perRow * rows;
  // si ça déborde, on réserve la dernière place au « +n »
  const shown = items.length > capacity ? capacity - 1 : items.length;
  for (let i = 0; i < shown; i++) {
    parent.append(bottleEl(items[i]!, x0 + (i % perRow) * PITCH_X, y0 + Math.floor(i / perRow) * PITCH_Y));
  }
  const hidden = items.length - shown;
  if (hidden > 0) {
    const i = shown;
    parent.append(
      s(
        'text',
        { class: 'sv__more', x: x0 + (i % perRow) * PITCH_X, y: y0 + Math.floor(i / perRow) * PITCH_Y + BH / 2 + 4 },
        `+${hidden}`,
      ),
    );
  }
  return hidden;
}

export function renderShelfView(opts: { shelfName: string; bottles: ShelfBottle[] }): HTMLElement {
  const loose = opts.bottles.filter((b) => b.zone === null);
  const height = CAB_H + (loose.length > 0 ? LOOSE_H : 0);
  const svg = s('svg', {
    viewBox: `0 0 320 ${height}`,
    class: 'sv',
    role: 'group',
    'aria-label': `Bouteilles sur ${opts.shelfName}`,
  });

  // meuble : montants, fond, planche
  const cabBottom = GRID_BOTTOM + 8;
  svg.append(
    s('rect', { class: 'sv__frame', x: 4, y: 4, width: 312, height: cabBottom + 4, rx: 8 }),
    s('rect', { class: 'sv__cavity', x: 10, y: 10, width: 300, height: cabBottom - 6, rx: 4 }),
    s('rect', { class: 'sv__plank', x: 2, y: cabBottom + 4, width: 316, height: 10, rx: 2 }),
    s('rect', { class: 'sv__plank-lip', x: 2, y: cabBottom + 4, width: 316, height: 2 }),
  );

  for (const [hint, z] of Object.entries(ZONES) as [PositionHint, Zone][]) {
    const items = opts.bottles.filter((b) => b.zone === hint);
    const g = s('g', { 'data-zone': hint });
    g.append(s('rect', { class: 'sv__zone', x: z.x, y: z.y, width: z.w, height: z.h, rx: 6 }));
    g.append(s('text', { class: 'sv__label', x: z.x + 6, y: z.y + 11 }, z.label));
    fill(g, items, z.x + 6, z.y + 16, z.w - 12, z.h - 20);
    svg.append(g);
  }

  if (loose.length > 0) {
    const y = CAB_H;
    const g = s('g', { 'data-zone': 'none' });
    g.append(
      s('rect', { class: 'sv__loose', x: 4, y: y + 2, width: 312, height: LOOSE_H - 6, rx: 8 }),
      s('text', { class: 'sv__label sv__label--loose', x: 12, y: y + 17 }, 'Position non précisée'),
    );
    fill(g, loose, 12, y + 22, 296, BH);
    svg.append(g);
  }

  return h('div', { class: 'sv-wrap' }, svg);
}
