// À racheter (spec 002) : bouteilles aimées (note 4 ou 5) épuisées ou à leur dernier exemplaire.
import type { WineRow } from './query';
import { wineTitle } from './wine';

export const LIKED_RATING = 4;

export interface RebuyEntry {
  row: WineRow;
  /** `out` : plus aucune bouteille ; `last` : une seule bouteille restante. */
  reason: 'out' | 'last';
}

export function rebuyList(rows: WineRow[]): RebuyEntry[] {
  const out: RebuyEntry[] = [];
  for (const row of rows) {
    const w = row.wine;
    if (w.deleted || w.rating === null || w.rating < LIKED_RATING) continue;
    if (row.quantity === 0) out.push({ row, reason: 'out' });
    else if (row.quantity === 1) out.push({ row, reason: 'last' });
  }
  return out.sort(
    (a, b) =>
      Number(a.reason === 'last') - Number(b.reason === 'last') ||
      (b.row.wine.rating ?? 0) - (a.row.wine.rating ?? 0) ||
      wineTitle(a.row.wine).primary.localeCompare(wineTitle(b.row.wine).primary, 'fr', { sensitivity: 'base' }),
  );
}
