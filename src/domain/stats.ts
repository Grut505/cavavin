// Statistiques globales de la cave (spec 002, FR-005 à FR-008) : tout est calculé à partir des données locales.
import type { WineRow } from './query';
import { OUTFLOW_REASONS, type Outflow, type OutflowReason } from './types';

export const NOT_SET = 'Non renseigné';

export type Axis = 'color' | 'country' | 'region' | 'vintage' | 'appellation';

export interface Slice {
  label: string;
  bottles: number;
  wines: number;
}

export interface Overview {
  bottles: number;
  wines: number;
}

export function overview(rows: WineRow[]): Overview {
  const inStock = rows.filter((r) => r.quantity > 0 && !r.wine.deleted);
  return { bottles: inStock.reduce((n, r) => n + r.quantity, 0), wines: inStock.length };
}

function axisValue(row: WineRow, axis: Axis): string {
  const w = row.wine;
  const raw = axis === 'vintage' ? (w.vintage === null ? null : String(w.vintage)) : (w[axis] as string | null);
  return raw && raw.trim() !== '' ? raw.trim() : NOT_SET;
}

/** Bouteilles par valeur de l'axe, de la plus à la moins représentée (« Non renseigné » toujours en dernier). */
export function distribution(rows: WineRow[], axis: Axis): Slice[] {
  const map = new Map<string, { label: string; bottles: number; wines: number }>();
  for (const row of rows) {
    if (row.quantity <= 0 || row.wine.deleted) continue;
    const label = axisValue(row, axis);
    const key = label.toLocaleLowerCase('fr');
    const cur = map.get(key) ?? { label, bottles: 0, wines: 0 };
    cur.bottles += row.quantity;
    cur.wines += 1;
    map.set(key, cur);
  }
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  return [...map.values()].sort((a, b) => {
    if (a.label === NOT_SET) return 1;
    if (b.label === NOT_SET) return -1;
    return b.bottles - a.bottles || collator.compare(a.label, b.label);
  });
}

/** Garde les `n` premières tranches et regroupe le reste sous « Autres » (sans toucher à « Non renseigné »). */
export function topSlices(slices: Slice[], n: number): Slice[] {
  if (slices.length <= n) return slices;
  const head = slices.slice(0, n);
  const rest = slices.slice(n);
  const other = rest.filter((s) => s.label !== NOT_SET);
  const unset = rest.find((s) => s.label === NOT_SET);
  const out = [...head];
  if (other.length > 0) out.push({ label: 'Autres', bottles: other.reduce((a, s) => a + s.bottles, 0), wines: other.reduce((a, s) => a + s.wines, 0) });
  if (unset) out.push(unset);
  return out;
}

export interface CellarValue {
  /** Somme prix d'achat × quantité des fiches ayant un prix. */
  total: number;
  /** Prix moyen par bouteille (fiches avec prix), `null` si aucune. */
  average: number | null;
  pricedBottles: number;
  /** Fiches en stock sans prix exploitable (non comptées). */
  unpricedWines: number;
}

export function cellarValue(rows: WineRow[]): CellarValue {
  let total = 0;
  let pricedBottles = 0;
  let unpricedWines = 0;
  for (const { wine, quantity } of rows) {
    if (quantity <= 0 || wine.deleted) continue;
    const p = wine.purchase_price;
    if (p === null || !(p > 0)) {
      unpricedWines++;
      continue;
    }
    total += p * quantity;
    pricedBottles += quantity;
  }
  return { total, average: pricedBottles > 0 ? total / pricedBottles : null, pricedBottles, unpricedWines };
}

export interface MonthCount {
  /** AAAA-MM */
  month: string;
  count: number;
}

export interface Consumption {
  months: MonthCount[];
  byReason: Record<OutflowReason, number>;
  /** Sorties sur les 12 mois affichés. */
  total: number;
}

const monthKey = (y: number, m0: number): string => `${y}-${String(m0 + 1).padStart(2, '0')}`;

/** Sorties par mois sur les 12 derniers mois (mois courant inclus) et par motif sur la même période. */
export function consumption(outflows: Outflow[], now: Date = new Date()): Consumption {
  const months: MonthCount[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d.getFullYear(), d.getMonth()), count: 0 });
  }
  const index = new Map(months.map((m, i) => [m.month, i] as const));
  const byReason = Object.fromEntries(OUTFLOW_REASONS.map((r) => [r, 0])) as Record<OutflowReason, number>;
  let total = 0;
  for (const o of outflows) {
    if (o.deleted) continue;
    const i = index.get(o.date.slice(0, 7));
    if (i === undefined) continue;
    months[i]!.count++;
    byReason[o.reason] = (byReason[o.reason] ?? 0) + 1;
    total++;
  }
  return { months, byReason, total };
}

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2026-11 » → « nov. 2026 » */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS_FR[Number(m) - 1] ?? m} ${y}`;
}

export const formatEuro = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
