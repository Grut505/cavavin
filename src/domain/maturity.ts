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

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const titleOf = (e: MaturityEntry): string => wineTitle(e.row.wine).primary;

/** Critères de tri de la liste « À boire ». */
export type DrinkSort = 'urgency' | 'domain' | 'location' | 'vintage';

export const DRINK_SORT_LABELS: Record<DrinkSort, string> = {
  urgency: 'Urgence',
  domain: 'Domaine',
  location: 'Emplacement',
  vintage: 'Millésime',
};

export const DRINK_SORT_HINTS: Record<DrinkSort, string> = {
  urgency: 'Les plus pressées d’abord : fin de garde la plus proche, « à finir » en tête.',
  domain: 'Par ordre alphabétique de domaine.',
  location: 'Dans l’ordre de la cave (meuble, étagère), pour sortir plusieurs bouteilles d’un coup.',
  vintage: 'Du plus ancien au plus récent ; les non millésimés à la fin.',
};

const byUrgency = (a: MaturityEntry, b: MaturityEntry): number =>
  Number(b.info.finishing) - Number(a.info.finishing) ||
  (a.row.wine.drink_until ?? Infinity) - (b.row.wine.drink_until ?? Infinity) ||
  (a.row.wine.drink_from ?? Infinity) - (b.row.wine.drink_from ?? Infinity) ||
  collator.compare(titleOf(a), titleOf(b));

const COMPARATORS: Record<DrinkSort, (a: MaturityEntry, b: MaturityEntry) => number> = {
  urgency: byUrgency,
  domain: (a, b) => collator.compare(titleOf(a), titleOf(b)) || (a.row.wine.vintage ?? Infinity) - (b.row.wine.vintage ?? Infinity),
  location: (a, b) =>
    (a.row.locations[0]?.order ?? Infinity) - (b.row.locations[0]?.order ?? Infinity) || collator.compare(titleOf(a), titleOf(b)),
  vintage: (a, b) => (a.row.wine.vintage ?? Infinity) - (b.row.wine.vintage ?? Infinity) || collator.compare(titleOf(a), titleOf(b)),
};

export interface GroupOptions {
  /** Ne garder que cette couleur. */
  color?: Wine['color'];
  sort?: DrinkSort;
}

/**
 * Répartit les fiches en stock en groupes (toujours les 5, éventuellement vides). Tri par urgence par défaut ;
 * `color` restreint à une couleur.
 */
export function maturityGroups(rows: WineRow[], year: number, opts: GroupOptions = {}): MaturityGroup[] {
  const groups = new Map<Maturity, MaturityEntry[]>(MATURITY_ORDER.map((c) => [c, []]));
  for (const row of rows) {
    if (row.quantity <= 0 || row.wine.deleted) continue;
    if (opts.color && row.wine.color !== opts.color) continue;
    const info = classify(row.wine, year);
    groups.get(info.category)!.push({ row, info });
  }
  const cmp = COMPARATORS[opts.sort ?? 'urgency'];
  return MATURITY_ORDER.map((category) => {
    const entries = groups.get(category)!.sort(cmp);
    return { category, entries, bottles: entries.reduce((n, e) => n + e.row.quantity, 0) };
  });
}

/** Bouteilles en stock par couleur, de la plus à la moins nombreuse (pour proposer le filtre). */
export function colorCounts(rows: WineRow[], year: number): { color: NonNullable<Wine['color']>; bottles: number }[] {
  const map = new Map<NonNullable<Wine['color']>, number>();
  for (const g of maturityGroups(rows, year)) {
    for (const e of g.entries) if (e.row.wine.color) map.set(e.row.wine.color, (map.get(e.row.wine.color) ?? 0) + e.row.quantity);
  }
  return [...map.entries()].map(([color, bottles]) => ({ color, bottles })).sort((a, b) => b.bottles - a.bottles);
}

/** « 2024–2028 », « dès 2026 », « jusqu'à 2030 » ou chaîne vide. */
export function windowText(wine: Pick<Wine, 'drink_from' | 'drink_until'>): string {
  const { drink_from: from, drink_until: until } = wine;
  if (from !== null && until !== null) return from === until ? String(from) : `${from}–${until}`;
  if (from !== null) return `dès ${from}`;
  if (until !== null) return `jusqu’à ${until}`;
  return '';
}
