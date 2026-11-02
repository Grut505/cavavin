// Choix graphique de la position d'une bouteille sur une étagère (facultatif, indicatif).
import { POSITION_HINTS, type PositionHint } from '../../domain/types';
import { h } from '../dom';
import './cave-map.css';

const NS = 'http://www.w3.org/2000/svg';

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

// Étagère vue de face : bande du dessus, deux moitiés gauche/droite, bande du dessous.
const ZONES: Record<PositionHint, Zone> = {
  dessus: { x: 8, y: 8, w: 304, h: 38, label: 'Dessus' },
  gauche: { x: 8, y: 52, w: 148, h: 60, label: 'Gauche' },
  droite: { x: 164, y: 52, w: 148, h: 60, label: 'Droite' },
  dessous: { x: 8, y: 118, w: 304, h: 38, label: 'Dessous' },
};

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
    viewBox: '0 0 320 164',
    role: 'radiogroup',
    'aria-label': `Position sur ${opts.shelfName}`,
    class: 'pos',
  });

  const draw = (): void => {
    svg.replaceChildren(
      s('rect', { class: 'pos__frame', x: 4, y: 4, width: 312, height: 156, rx: 10 }),
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
          s('text', { class: 'pos__label', x: z.x + z.w / 2, y: z.y + z.h / 2 + 4, 'text-anchor': 'middle' }, z.label),
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
