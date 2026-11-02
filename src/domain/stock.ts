// Sorties de stock et déplacements : règles de validation (FR-011, FR-012).
import { OUTFLOW_REASONS, type Outflow, type OutflowReason } from './types';
import { parseDate } from './wine';

export const OUTFLOW_REASON_LABELS: Record<OutflowReason, string> = {
  drunk: 'Bue',
  gifted: 'Offerte',
  broken: 'Cassée / bouchonnée',
  other: 'Autre',
};

export interface StockIssue {
  field: 'quantity' | 'date' | 'reason' | 'destination';
  message: string;
}

/** Date du jour au format ISO (AAAA-MM-JJ), en heure locale. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type OutflowCheck =
  | { ok: true; value: { quantity: number; date: string; reason: OutflowReason } }
  | { ok: false; issues: StockIssue[] };

/** `date` vide = aujourd'hui ; une date future est refusée. */
export function validateOutflow(
  input: { quantity: number; available: number; date: string; reason: string },
  now: Date = new Date(),
): OutflowCheck {
  const issues: StockIssue[] = [];
  const q = input.quantity;
  if (!Number.isInteger(q) || q < 1) issues.push({ field: 'quantity', message: 'La quantité doit être un entier supérieur ou égal à 1.' });
  else if (q > input.available) {
    issues.push({ field: 'quantity', message: `Il n'y a que ${input.available} bouteille${input.available > 1 ? 's' : ''} à cet emplacement.` });
  }
  const today = todayIso(now);
  let date = today;
  if (input.date.trim() !== '') {
    const parsed = parseDate(input.date);
    if (!parsed) issues.push({ field: 'date', message: 'Date invalide (jj/mm/aaaa).' });
    else if (parsed > today) issues.push({ field: 'date', message: 'La date ne peut pas être dans le futur.' });
    else date = parsed;
  }
  if (!(OUTFLOW_REASONS as readonly string[]).includes(input.reason)) {
    issues.push({ field: 'reason', message: 'Motif inconnu.' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { quantity: q, date, reason: input.reason as OutflowReason } };
}

export type MoveCheck = { ok: true; quantity: number } | { ok: false; issues: StockIssue[] };

export function validateMove(input: {
  quantity: number;
  available: number;
  fromLocationId: string;
  toLocationId: string | null;
}): MoveCheck {
  const issues: StockIssue[] = [];
  const q = input.quantity;
  if (!Number.isInteger(q) || q < 1) issues.push({ field: 'quantity', message: 'La quantité doit être un entier supérieur ou égal à 1.' });
  else if (q > input.available) {
    issues.push({ field: 'quantity', message: `Il n'y a que ${input.available} bouteille${input.available > 1 ? 's' : ''} à cet emplacement.` });
  }
  if (!input.toLocationId) issues.push({ field: 'destination', message: 'Choisissez la destination.' });
  else if (input.toLocationId === input.fromLocationId) {
    issues.push({ field: 'destination', message: 'La destination est déjà l’emplacement actuel.' });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, quantity: q };
}

/** Sorties, les plus récentes d'abord ; filtrées sur une fiche si `wineId` est donné. */
export function outflowsOf(outflows: Outflow[], wineId?: string): Outflow[] {
  return outflows
    .filter((o) => !o.deleted && (wineId === undefined || o.wine_id === wineId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.updated_at < b.updated_at ? 1 : -1));
}
