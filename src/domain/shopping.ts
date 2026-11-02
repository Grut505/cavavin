// Liste de courses (spec 002) : les fiches marquées « à racheter ».
import type { WineRow } from './query';
import { wineTitle } from './wine';

export interface ShoppingEntry {
  row: WineRow;
}

export const isOnList = (w: { to_buy?: boolean }): boolean => w.to_buy === true;

/** Fiches de la liste : épuisées d'abord (on n'en a plus), puis par domaine. */
export function shoppingList(rows: WineRow[]): ShoppingEntry[] {
  return rows
    .filter((r) => !r.wine.deleted && isOnList(r.wine))
    .sort(
      (a, b) =>
        Number(a.quantity > 0) - Number(b.quantity > 0) ||
        wineTitle(a.wine).primary.localeCompare(wineTitle(b.wine).primary, 'fr', { sensitivity: 'base' }),
    )
    .map((row) => ({ row }));
}

/** Texte à envoyer (Messages…) : une ligne par vin, avec fournisseur et prix s'ils sont connus. */
export function shoppingText(entries: ShoppingEntry[]): string {
  const lines = entries.map(({ row }) => {
    const w = row.wine;
    const { primary, secondary } = wineTitle(w);
    const price = w.purchase_price !== null ? `${w.purchase_price.toFixed(2).replace('.', ',')} €` : '';
    const detail = [w.supplier, price].filter(Boolean).join(', ');
    return `- ${secondary ? `${primary} — ${secondary}` : primary}${detail ? ` (${detail})` : ''}`;
  });
  return ['Liste de courses (cave) :', ...lines].join('\n');
}
