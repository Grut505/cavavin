// Vue de face d'une étagère : chaque bouteille est dessinée dans sa zone (dessus, gauche, droite,
// dessous) ou dans la bande « position non précisée ». Couleur = type de vin ; toucher = fiche.
import type { PositionHint, Stock, Wine } from '../../domain/types';
import { wineTitle } from '../../domain/wine';
import { h } from '../dom';
import { wineHref } from '../nav-origin';
import { bottleGlyph, s } from './svg';
import './cave-map.css';

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** Bande (une seule rangée, étiquette à gauche) ou demi-étagère (étiquette en haut). */
  band: boolean;
}

const ZONES: Record<PositionHint, Zone> = {
  dessus: { x: 14, y: 14, w: 292, h: 40, label: 'Dessus', band: true },
  gauche: { x: 14, y: 58, w: 143, h: 64, label: 'Gauche', band: false },
  droite: { x: 163, y: 58, w: 143, h: 64, label: 'Droite', band: false },
  dessous: { x: 14, y: 126, w: 292, h: 40, label: 'Dessous', band: true },
};

const SCALE = 0.78;
const BW = 12 * SCALE;
const BH = 28 * SCALE;
const PITCH_X = BW + 3.5;
const PITCH_Y = BH + 3;
const CAB_H = 184;
const LOOSE_H = 52;

export interface ShelfBottle {
  wineId: string;
  title: string;
  color: Wine['color'];
  zone: PositionHint | null;
}

/** Une entrée par bouteille, dans l'ordre des lignes de stock. */
export function shelfBottles(stocks: Stock[], wines: Wine[]): ShelfBottle[] {
  const out: ShelfBottle[] = [];
  for (const st of stocks) {
    const wine = wines.find((w) => w.id === st.wine_id);
    for (let k = 0; k < st.quantity; k++) {
      out.push({
        wineId: st.wine_id,
        title: wine ? wineTitle(wine).primary : 'Fiche introuvable',
        color: wine?.color ?? null,
        zone: st.position_hint,
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
    'aria-label': `${b.title}${b.zone ? `, ${b.zone}` : ''}`,
  });
  g.append(s('title', {}, b.title));
  // zone tactile un peu plus large que le dessin
  g.append(s('rect', { class: 'sv__bottle-hit', x: x - 1.5, y: y - 1, width: BW + 3, height: BH + 2 }));
  g.append(bottleGlyph(x, y, `bottle bottle--${b.color ?? 'autre'}`, SCALE));
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
  svg.append(
    s('rect', { class: 'sv__frame', x: 4, y: 4, width: 312, height: 172, rx: 8 }),
    s('rect', { class: 'sv__cavity', x: 10, y: 10, width: 300, height: 158, rx: 4 }),
    s('rect', { class: 'sv__plank', x: 2, y: 168, width: 316, height: 10, rx: 2 }),
    s('rect', { class: 'sv__plank-lip', x: 2, y: 168, width: 316, height: 2 }),
  );

  for (const [hint, z] of Object.entries(ZONES) as [PositionHint, Zone][]) {
    const items = opts.bottles.filter((b) => b.zone === hint);
    const g = s('g', { 'data-zone': hint });
    g.append(s('rect', { class: 'sv__zone', x: z.x, y: z.y, width: z.w, height: z.h, rx: 6 }));
    if (z.band) {
      g.append(s('text', { class: 'sv__label', x: z.x + 8, y: z.y + z.h / 2 + 3 }, z.label));
      fill(g, items, z.x + 62, z.y + (z.h - BH) / 2, z.w - 70, BH);
    } else {
      g.append(s('text', { class: 'sv__label', x: z.x + 8, y: z.y + 12 }, z.label));
      fill(g, items, z.x + 8, z.y + 18, z.w - 16, z.h - 22);
    }
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
