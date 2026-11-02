// Choix d'un emplacement dans le schéma de la cave, puis (étagère) de la position sur l'étagère.
import type { AppContext } from '../../app';
import { bottleCounts, stocksAt } from '../../domain/locations';
import type { Furniture, Location, PositionHint, Stock } from '../../domain/types';
import { renderCaveMap } from '../cave-map/cave-map';
import { renderShelfPosition } from '../cave-map/shelf-position';
import { h } from '../dom';
import { openDialog } from './dialog';

export interface PickedLocation {
  location: Location;
  hint: PositionHint | null;
}

export function locationLabel(loc: Location, furniture: Furniture[]): string {
  if (loc.kind === 'shelf') {
    const f = furniture.find((x) => x.id === loc.furniture_id);
    return f ? `${f.name} · ${loc.name}` : loc.name;
  }
  return loc.name;
}

function hintCounts(stocks: Stock[], locationId: string): Partial<Record<PositionHint, number>> {
  const out: Partial<Record<PositionHint, number>> = {};
  for (const st of stocksAt(stocks, locationId)) {
    if (st.position_hint) out[st.position_hint] = (out[st.position_hint] ?? 0) + st.quantity;
  }
  return out;
}

/**
 * Étape 1 : toucher une étagère ou un lieu dans le schéma.
 * Étape 2 (étagères seulement) : toucher la zone de l'étagère (facultatif).
 * `null` si l'utilisateur annule.
 */
export async function pickLocation(
  ctx: Pick<AppContext, 'repo'>,
  current?: { locationId?: string; hint?: PositionHint | null },
): Promise<PickedLocation | null> {
  const [furniture, locations, stocks] = await Promise.all([
    ctx.repo.list('furniture'),
    ctx.repo.list('location'),
    ctx.repo.list('stock'),
  ]);

  const { result } = openDialog<PickedLocation>('Choisir un emplacement', (close) => {
    const wrapper = h('div', { class: 'stack' });

    const showMap = (): void => {
      wrapper.replaceChildren(
        locations.length === 0
          ? h(
              'div',
              { class: 'stack' },
              h('p', { class: 'muted' }, 'Votre cave n’a pas encore d’étagère ni de lieu.'),
              h('a', { class: 'btn btn--primary', href: '#/cave/config', onClick: () => close(null) }, 'Configurer ma cave'),
            )
          : renderCaveMap(
              { furniture, locations, counts: bottleCounts(stocks) },
              {
                selectedId: current?.locationId,
                onSelect: (loc) => (loc.kind === 'shelf' ? showPosition(loc) : close({ location: loc, hint: null })),
              },
            ),
        h('div', { class: 'dialog__actions' }, h('button', { class: 'btn', type: 'button', onClick: () => close(null) }, 'Annuler')),
      );
    };

    const showPosition = (loc: Location): void => {
      const initial = current?.locationId === loc.id ? (current.hint ?? null) : null;
      const picker = renderShelfPosition({
        shelfName: loc.name,
        selected: initial,
        counts: hintCounts(stocks, loc.id),
      });
      const unplaced = stocksAt(stocks, loc.id)
        .filter((st) => !st.position_hint)
        .reduce((n, st) => n + st.quantity, 0);
      const info =
        unplaced > 0
          ? h('p', { class: 'muted', style: 'font-size:0.85rem' }, `${unplaced} bouteille${unplaced > 1 ? 's' : ''} sans position précisée sur cette étagère.`)
          : null;
      wrapper.replaceChildren(
        h('h3', {}, locationLabel(loc, furniture)),
        h('p', { class: 'muted' }, 'Où sur l’étagère ? Touchez une zone (facultatif).'),
        picker.el,
        ...(info ? [info] : []),
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close({ location: loc, hint: picker.value() }) }, 'Valider'),
          h('div', { class: 'dialog__actions', style: 'justify-content:space-between' },
            h('button', { class: 'btn', type: 'button', onClick: showMap }, 'Retour'),
            h('button', { class: 'btn', type: 'button', onClick: () => close({ location: loc, hint: null }) }, 'Sans précision'),
          ),
        ),
      );
    };

    showMap();
    return [wrapper];
  });
  return result;
}
