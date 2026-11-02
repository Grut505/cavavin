// Cadeaux par personne (spec 002, FR-013, FR-014) : bouteilles en stock et déjà sorties d'une personne.
import type { WineRow } from './query';
import type { Outflow, Person, Wine } from './types';

export interface GiftOutflow {
  outflow: Outflow;
  wine: Wine;
}

export interface PersonGifts {
  inStock: WineRow[];
  gone: GiftOutflow[];
  bottlesInStock: number;
}

const isFrom = (w: Wine, person: Pick<Person, 'id'>): boolean => !w.deleted && w.gift && w.gift_from === person.id;

export function giftsOf(person: Pick<Person, 'id'>, rows: WineRow[], outflows: Outflow[]): PersonGifts {
  const inStock = rows.filter((r) => r.quantity > 0 && isFrom(r.wine, person));
  const byId = new Map(rows.map((r) => [r.wine.id, r.wine] as const));
  const gone: GiftOutflow[] = [];
  for (const o of outflows) {
    if (o.deleted) continue;
    const wine = byId.get(o.wine_id);
    if (wine && isFrom(wine, person)) gone.push({ outflow: o, wine });
  }
  gone.sort((a, b) => (a.outflow.date < b.outflow.date ? 1 : a.outflow.date > b.outflow.date ? -1 : 0));
  return { inStock, gone, bottlesInStock: inStock.reduce((n, r) => n + r.quantity, 0) };
}
