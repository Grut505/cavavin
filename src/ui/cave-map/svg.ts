// Petit utilitaire de construction SVG partagé par les schémas de la cave.
const NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

let uid = 0;
/** Identifiant unique pour les dégradés (plusieurs SVG cohabitent dans la page). */
export const nextId = (prefix: string): string => `${prefix}-${++uid}`;

/** Bouteille stylisée (col + corps) ; `scale` 1 = 12×28. Les deux `rect` portent `cls`. */
export function bottleGlyph(x: number, top: number, cls: string, scale = 1): SVGElement {
  const g = s('g', { class: 'bottle-g' });
  g.append(
    s('rect', { class: cls, x: x + 3.5 * scale, y: top, width: 5 * scale, height: 9 * scale, rx: 1 }),
    s('rect', { class: cls, x, y: top + 8 * scale, width: 12 * scale, height: 20 * scale, rx: 3 * scale }),
  );
  return g;
}
