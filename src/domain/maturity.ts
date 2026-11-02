// Maturité d'une fiche selon sa fenêtre de garde et l'année en cours (spec 002, FR-002/FR-003).
import { wineTitle } from './wine';
import type { WineRow } from './query';
import type { Wine } from './types';

export type Maturity = 'late' | 'now' | 'soon' | 'early' | 'unknown';

/** Ordre d'affichage : les plus urgentes d'abord. */
export const MATURITY_ORDER: readonly Maturity[] = ['late', 'now', 'soon', 'early', 'unknown'];

export const MATURITY_LABELS: Record<Maturity, string> = {
  late: 'En retard',
  now: 'À boire maintenant',
  soon: 'Bientôt',
  early: 'Trop tôt',
  unknown: 'Non évaluée',
};

export const MATURITY_HINTS: Record<Maturity, string> = {
  late: 'Fenêtre de garde dépassée',
  now: 'Dans la fenêtre de garde',
  soon: 'La fenêtre s’ouvre l’an prochain',
  early: 'La fenêtre s’ouvre dans plus d’un an',
  unknown: 'Fenêtre de garde absente ou incohérente',
};

export interface MaturityInfo {
  category: Maturity;
  /** À boire maintenant dont la fenêtre se termine cette année ou la suivante. */
  finishing: boolean;
}

export function classify(wine: Pick<Wine, 'drink_from' | 'drink_until'>, year: number): MaturityInfo {
  const from = wine.drink_from;
  const until = wine.drink_until;
  if ((from === null && until === null) || (from !== null && until !== null && from > until)) {
    return { category: 'unknown', finishing: false };
  }
  if (until !== null && year > until) return { category: 'late', finishing: false };
  if (from !== null && year < from) return { category: from === year + 1 ? 'soon' : 'early', finishing: false };
  return { category: 'now', finishing: until !== null && until <= year + 1 };
}

export interface MaturityEntry {
  row: WineRow;
  info: MaturityInfo;
}

export interface MaturityGroup {
  category: Maturity;
  entries: MaturityEntry[];
  bottles: number;
}

const byUrgency = (a: MaturityEntry, b: MaturityEntry): number =>
  Number(b.info.finishing) - Number(a.info.finishing) ||
  (a.row.wine.drink_until ?? Infinity) - (b.row.wine.drink_until ?? Infinity) ||
  (a.row.wine.drink_from ?? Infinity) - (b.row.wine.drink_from ?? Infinity) ||
  wineTitle(a.row.wine).primary.localeCompare(wineTitle(b.row.wine).primary, 'fr', { sensitivity: 'base' });

/** Répartit les fiches en stock en groupes (toujours les 5, éventuellement vides), urgentes d'abord. */
export function maturityGroups(rows: WineRow[], year: number): MaturityGroup[] {
  const groups = new Map<Maturity, MaturityEntry[]>(MATURITY_ORDER.map((c) => [c, []]));
  for (const row of rows) {
    if (row.quantity <= 0 || row.wine.deleted) continue;
    const info = classify(row.wine, year);
    groups.get(info.category)!.push({ row, info });
  }
  return MATURITY_ORDER.map((category) => {
    const entries = groups.get(category)!.sort(byUrgency);
    return { category, entries, bottles: entries.reduce((n, e) => n + e.row.quantity, 0) };
  });
}

/** « 2024–2028 », « dès 2026 », « jusqu'à 2030 » ou chaîne vide. */
export function windowText(wine: Pick<Wine, 'drink_from' | 'drink_until'>): string {
  const { drink_from: from, drink_until: until } = wine;
  if (from !== null && until !== null) return from === until ? String(from) : `${from}–${until}`;
  if (from !== null) return `dès ${from}`;
  if (until !== null) return `jusqu’à ${until}`;
  return '';
}
