// Style d'un vin en visuel : tanins (5 crans) et sucre (échelle sec → doux).
import { DRYNESS_LEVELS } from '../../domain/types';
import type { Wine } from '../../domain/types';
import { h } from '../dom';

const DRYNESS_LABELS: Record<string, string> = { sec: 'Sec', 'demi-sec': 'Demi-sec', moelleux: 'Moelleux', doux: 'Doux' };

function tannins(n: number): HTMLElement {
  const level = Math.max(0, Math.min(5, Math.round(n)));
  return h(
    'div',
    { class: 'style-meter', role: 'img', 'aria-label': `Tanins : ${level} sur 5` },
    h('div', { class: 'style-meter__head' }, h('strong', {}, 'Tanins'), h('span', { class: 'muted' }, ['Souples', 'Souples', 'Présents', 'Marqués', 'Puissants', 'Très puissants'][level] ?? '')),
    h('div', { class: 'style-meter__pips' }, [1, 2, 3, 4, 5].map((i) => h('span', { class: `style-meter__pip${i <= level ? ' style-meter__pip--on' : ''}` }))),
  );
}

function sweetness(d: string): HTMLElement {
  const at = (DRYNESS_LEVELS as readonly string[]).indexOf(d);
  return h(
    'div',
    { class: 'style-meter', role: 'img', 'aria-label': `Sucre : ${DRYNESS_LABELS[d] ?? d}` },
    h('div', { class: 'style-meter__head' }, h('strong', {}, 'Sucre'), h('span', { class: 'muted' }, DRYNESS_LABELS[d] ?? d)),
    h('div', { class: 'style-meter__steps' }, DRYNESS_LEVELS.map((l, i) => h('span', { class: `style-meter__step${i === at ? ' style-meter__step--on' : i < at ? ' style-meter__step--before' : ''}` }, DRYNESS_LABELS[l]))),
  );
}

/** `null` quand la fiche n'a ni tanins ni sucre renseignés. */
export function styleMeter(wine: Pick<Wine, 'tannin' | 'dryness'>): HTMLElement | null {
  const parts = [wine.tannin ? tannins(wine.tannin) : null, wine.dryness ? sweetness(wine.dryness) : null].filter((p): p is HTMLElement => p !== null);
  return parts.length === 0 ? null : h('div', { class: 'style-box' }, ...parts);
}
