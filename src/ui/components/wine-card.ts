// Carte de fiche pour les listes : miniature, identité, couleur, emplacements, quantité.
import type { WineRow } from '../../domain/query';
import { wineTitle } from '../../domain/wine';
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
  opts: { thumb?: string; href?: string; giftFrom?: string | null } = {},
): HTMLElement {
  const { wine } = row;
  const { primary, secondary } = wineTitle(wine);
  const meta = [wine.appellation, wine.region].filter(Boolean).join(' · ');
  const gift = wine.gift ? (opts.giftFrom ? `Offert par ${opts.giftFrom}` : 'Cadeau') : '';
  const style = wine.tannin ? `Tanin ${wine.tannin}/5` : wine.dryness ? wine.dryness.charAt(0).toUpperCase() + wine.dryness.slice(1) : '';
  const loc = locationSummary(row);

  const thumb = opts.thumb
    ? h('img', { class: 'wine-card__thumb', src: opts.thumb, alt: '', width: '52', height: '68', loading: 'lazy' })
    : h('span', { class: 'wine-card__thumb wine-card__thumb--empty', 'aria-hidden': 'true' }, icon('bottle'));

  const body = h(
    'div',
    { class: 'wine-card__body' },
    h('strong', { class: 'wine-card__domain' }, primary),
    h('div', { class: 'wine-card__title' }, secondary),
    wine.color || meta || style || gift
      ? h(
          'div',
          { class: 'wine-card__meta muted' },
          wine.color ? h('span', { class: `dot dot--${wine.color}`, 'aria-hidden': 'true' }) : null,
          [colorLabel(wine.color), style, meta, gift].filter(Boolean).join(' · '),
        )
      : null,
    loc ? h('div', { class: 'wine-card__loc muted' }, loc) : null,
  );

  const qty =
    row.quantity > 0
      ? h('span', { class: 'badge', 'aria-label': `${row.quantity} bouteille${row.quantity > 1 ? 's' : ''}` }, `×${row.quantity}`)
      : h('span', { class: 'badge badge--muted' }, 'Épuisé');

  const attrs = { class: `wine-card${row.quantity === 0 ? ' wine-card--history' : ''}`, 'data-wine-id': wine.id };
  return opts.href
    ? h('a', { ...attrs, href: opts.href }, thumb, body, qty)
    : h('article', attrs, thumb, body, qty);
}
