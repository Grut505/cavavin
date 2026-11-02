// Règles métier de la cave : meubles, étagères, lieux, suppression gardée.
// Voir spec FR-003a/b/d et data-model.md.
import { normalizeText } from './normalize';
import type { Furniture, Location, Stock } from './types';

export const UNASSIGNED_NAME = 'Sans emplacement';
export const MAX_SHELVES = 30;

export type LocationRuleCode = 'empty_name' | 'duplicate' | 'invalid_count' | 'not_empty' | 'bad_target';

export class LocationRuleError extends Error {
  constructor(
    message: string,
    readonly code: LocationRuleCode,
  ) {
    super(message);
    this.name = 'LocationRuleError';
  }
}

export type DeletionDecision =
  | { action: 'move'; toLocationId: string }
  | { action: 'unassigned' };

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function assertUnique(
  name: string,
  siblings: { id: string; name: string }[],
  exceptId: string | undefined,
  what: string,
): string {
  const clean = cleanName(name);
  if (clean === '') throw new LocationRuleError('Le nom ne peut pas être vide.', 'empty_name');
  const key = normalizeText(clean);
  const clash = siblings.some((s) => s.id !== exceptId && normalizeText(s.name) === key);
  if (clash) throw new LocationRuleError(`Un ${what} nommé « ${clean} » existe déjà.`, 'duplicate');
  return clean;
}

export const assertFurnitureName = (name: string, furniture: Furniture[], exceptId?: string): string =>
  assertUnique(name, furniture.filter((f) => !f.deleted), exceptId, 'meuble');

/** `shelves` : les étagères du même meuble. */
export const assertShelfName = (name: string, shelves: Location[], exceptId?: string): string =>
  assertUnique(name, shelves.filter((s) => !s.deleted), exceptId, 'emplacement');

/** `places` : les lieux (pièces, placards…) existants. */
export const assertPlaceName = (name: string, places: Location[], exceptId?: string): string =>
  assertUnique(name, places.filter((p) => !p.deleted), exceptId, 'lieu');

export function nextOrder(items: { order: number; deleted?: boolean }[]): number {
  const active = items.filter((i) => !i.deleted);
  return active.length === 0 ? 0 : Math.max(...active.map((i) => i.order)) + 1;
}

export const shelfLabel = (n: number): string => `Étagère ${n}`;

/** Données d'un nouveau meuble et de ses étagères, numérotées de haut en bas. */
export function planFurniture(
  name: string,
  shelfCount: number,
  existing: Furniture[],
): { furniture: { name: string; order: number }; shelves: { name: string; order: number }[] } {
  if (!Number.isInteger(shelfCount) || shelfCount < 1 || shelfCount > MAX_SHELVES) {
    throw new LocationRuleError(
      `Le nombre d'étagères doit être un entier entre 1 et ${MAX_SHELVES}.`,
      'invalid_count',
    );
  }
  const clean = assertFurnitureName(name, existing);
  return {
    furniture: { name: clean, order: nextOrder(existing) },
    shelves: Array.from({ length: shelfCount }, (_, k) => ({ name: shelfLabel(k + 1), order: k })),
  };
}

/** Prochain nom libre « Étagère n » pour un meuble. */
export function nextShelfName(shelves: Location[]): string {
  const active = shelves.filter((s) => !s.deleted);
  let max = 0;
  for (const s of active) {
    const m = /^(?:etagere)\s+(\d+)$/.exec(normalizeText(s.name));
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = Math.max(max, active.length) + 1;
  const taken = new Set(active.map((s) => normalizeText(s.name)));
  while (taken.has(normalizeText(shelfLabel(n)))) n++;
  return shelfLabel(n);
}

const isActive = (s: Stock): boolean => !s.deleted && s.quantity > 0;

export function stocksAt(stocks: Stock[], locationId: string): Stock[] {
  return stocks.filter((s) => s.location_id === locationId && isActive(s));
}

export function bottleCount(stocks: Stock[], locationId: string): number {
  return stocksAt(stocks, locationId).reduce((n, s) => n + s.quantity, 0);
}

export function bottleCounts(stocks: Stock[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of stocks) {
    if (isActive(s)) out.set(s.location_id, (out.get(s.location_id) ?? 0) + s.quantity);
  }
  return out;
}

/** FR-003d : un emplacement non vide ne peut être supprimé qu'avec une décision explicite. */
export function requireDecision(bottles: number, decision: DeletionDecision | undefined): void {
  if (bottles > 0 && !decision) {
    throw new LocationRuleError(
      `Cet emplacement contient ${bottles} bouteille(s) : déplacez-les ou confirmez explicitement.`,
      'not_empty',
    );
  }
}

/** La destination d'un déplacement doit exister, être active et ne pas être supprimée en même temps. */
export function validateMoveTarget(
  decision: DeletionDecision,
  removedIds: Set<string>,
  locations: Location[],
): void {
  if (decision.action !== 'move') return;
  const target = locations.find((l) => l.id === decision.toLocationId);
  if (!target || target.deleted || removedIds.has(target.id)) {
    throw new LocationRuleError('Destination invalide pour le déplacement des bouteilles.', 'bad_target');
  }
}

export function sortByOrder<T extends { order: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'));
}
