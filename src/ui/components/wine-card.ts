// Carte de fiche pour les listes : miniature, identité, couleur, emplacements, quantité.
import type { WineRow } from '../../domain/query';
import { urgencyOf } from '../../domain/urgency';
import { wineHeading } from '../../domain/wine';
import { urgencyTag } from './urgency-tag';
import { h } from '../dom';
import { icon } from '../icons';

const COLOR_LABELS: Record<string, string> = {
  rouge: 'Rouge',
  blanc: 'Blanc',
  rosé: 'Rosé',
  effervescent: 'Effervescent',
  liquoreux: 'Liquoreux',
  autre: 'Autre',
};

export const colorLabel = (c: string | null): string => (c ? (COLOR_LABELS[c] ?? c) : '');

export function locationSummary(row: WineRow): string {
  const [first, ...rest] = row.locations;
  if (!first) return row.quantity > 0 ? 'Sans emplacement' : '';
  return rest.length > 0 ? `${first.label} +${rest.length}` : first.label;
}

export function renderWineCard(
  row: WineRow,
  /** `extra` : ligne supplémentaire (ex. position sur l'étagère). */
  opts: { thumb?: string; href?: string; giftFrom?: string | null; extra?: string; /** Masque la ligne d'emplacement (déjà évidente : écran d'une étagère). */ noLocation?: boolean } = {},
): HTMLElement {
  const { wine } = row;
  // L'appellation d'abord (avec le millésime), puis la région ; domaine et cuvée en petit.
  const { primary, region, maker } = wineHeading(wine);
  const gift = wine.gift ? (opts.giftFrom ? `Offert par ${opts.giftFrom}` : 'Cadeau') : '';
  const style = wine.tannin ? `Tanin ${wine.tannin}/5` : wine.dryness ? wine.dryness.charAt(0).toUpperCase() + wine.dryness.slice(1) : '';
  const loc = opts.noLocation ? '' : locationSummary(row);

  // Code couleur « à boire » (bouteilles en stock seulement) : liseré à gauche et pastille.
  const urgency = row.quantity > 0 ? urgencyOf(wine, new Date().getFullYear()) : null;

  const thumb = opts.thumb
    ? h('img', { class: 'wine-card__thumb', src: opts.thumb, alt: '', width: '52', height: '68', loading: 'lazy' })
    : h('span', { class: 'wine-card__thumb wine-card__thumb--empty', 'aria-hidden': 'true' }, icon('bottle'));

  const body = h(
    'div',
    { class: 'wine-card__body' },
    h('strong', { class: 'wine-card__domain' }, primary),
    region ? h('div', { class: 'wine-card__title' }, region) : null,
    wine.color || style || gift
      ? h(
          'div',
          { class: 'wine-card__meta muted' },
          wine.color ? h('span', { class: `dot dot--${wine.color}`, 'aria-hidden': 'true' }) : null,
          [colorLabel(wine.color), style, gift].filter(Boolean).join(' · '),
        )
      : null,
    urgency ? h('div', { class: 'wine-card__urgency-line' }, urgencyTag(urgency)) : null,
    maker ? h('div', { class: 'wine-card__maker muted' }, maker) : null,
    loc ? h('div', { class: 'wine-card__loc muted' }, loc) : null,
    opts.extra ? h('div', { class: 'wine-card__loc muted' }, opts.extra) : null,
  );

  const qty =
    row.quantity > 0
      ? h('span', { class: 'badge', 'aria-label': `${row.quantity} bouteille${row.quantity > 1 ? 's' : ''}` }, `×${row.quantity}`)
      : h('span', { class: 'badge badge--muted' }, 'Épuisé');

  const stripe = urgency ? h('span', { class: `wine-card__stripe u-fill u-fill--${urgency}`, 'aria-hidden': 'true' }) : null;
  const attrs = { class: `wine-card${row.quantity === 0 ? ' wine-card--history' : ''}`, 'data-wine-id': wine.id, ...(urgency ? { 'data-urgency': urgency } : {}) };
  return opts.href
    ? h('a', { ...attrs, href: opts.href }, stripe, thumb, body, qty)
    : h('article', attrs, stripe, thumb, body, qty);
}
