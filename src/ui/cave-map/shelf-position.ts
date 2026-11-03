// Choix graphique de la position d'une bouteille sur une étagère (facultatif, indicatif).
import { POSITION_COLS, POSITION_HINTS, POSITION_ROWS, positionLabel, type PositionCol, type PositionHint, type PositionRow } from '../../domain/types';
import { h } from '../dom';
import { s } from './svg';
import './cave-map.css';

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Libellé lu à voix haute : « Dessus · gauche ». */
  label: string;
}

// Étagère vue de face : trois rangées (dessus, milieu, dessous) de trois colonnes (gauche, centre, droite).
const COL_W = 96;
const ROW_H = 46;
const GAP = 6;
const ZONES = Object.fromEntries(
  POSITION_HINTS.map((hint) => {
    const [row, col] = hint.split('-') as [PositionRow, PositionCol];
    const r = POSITION_ROWS.indexOf(row);
    const c = POSITION_COLS.indexOf(col);
    return [hint, { x: 10 + c * (COL_W + GAP), y: 10 + r * (ROW_H + GAP), w: COL_W, h: ROW_H, label: positionLabel(hint) } satisfies Zone];
  }),
) as Record<PositionHint, Zone>;
const HEIGHT = 20 + 3 * ROW_H + 2 * GAP;

export interface ShelfPositionPicker {
  el: HTMLElement;
  value: () => PositionHint | null;
}

export function renderShelfPosition(opts: {
  shelfName: string;
  selected: PositionHint | null;
  /** Bouteilles déjà rangées par zone (pour situer le choix). */
  counts?: Partial<Record<PositionHint, number>>;
  onChange?: (hint: PositionHint | null) => void;
}): ShelfPositionPicker {
  let value = opts.selected;
  const svg = s('svg', {
    viewBox: `0 0 320 ${HEIGHT}`,
    role: 'radiogroup',
    'aria-label': `Position sur ${opts.shelfName}`,
    class: 'pos',
  });

  const draw = (): void => {
    svg.replaceChildren(
      s('rect', { class: 'pos__frame', x: 4, y: 4, width: 312, height: HEIGHT - 8, rx: 10 }),
      ...POSITION_HINTS.map((hint) => {
        const z = ZONES[hint];
        const n = opts.counts?.[hint] ?? 0;
        const selected = value === hint;
        const g = s('g', {
          class: `pos__zone${selected ? ' pos__zone--selected' : ''}`,
          role: 'radio',
          tabindex: 0,
          'aria-checked': String(selected),
          'aria-label': `${z.label}${n > 0 ? `, ${n} bouteille${n > 1 ? 's' : ''} déjà rangée${n > 1 ? 's' : ''}` : ''}`,
          'data-hint': hint,
        });
        g.append(
          s('rect', { class: 'pos__hit', x: z.x, y: z.y, width: z.w, height: z.h, rx: 8 }),
          s('text', { class: 'pos__label pos__label--row', x: z.x + z.w / 2, y: z.y + 18, 'text-anchor': 'middle' }, z.label.split(' · ')[0]!),
          s('text', { class: 'pos__label', x: z.x + z.w / 2, y: z.y + 35, 'text-anchor': 'middle' }, z.label.split(' · ')[1]!),
        );
        if (n > 0) {
          g.append(
            s('text', { class: 'pos__count', x: z.x + z.w - 10, y: z.y + 16, 'text-anchor': 'end' }, `${n}`),
          );
        }
        const toggle = (): void => {
          value = value === hint ? null : hint;
          opts.onChange?.(value);
          draw();
        };
        g.addEventListener('click', toggle);
        g.addEventListener('keydown', (e) => {
          const k = (e as KeyboardEvent).key;
          if (k === 'Enter' || k === ' ') {
            e.preventDefault();
            toggle();
          }
        });
        return g;
      }),
    );
  };
  draw();

  return { el: h('div', { class: 'pos-wrap' }, svg), value: () => value };
}
