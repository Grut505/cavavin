// Liste des fiches : lignes dérivées (quantités, emplacements), tri et filtres (FR-006, FR-007, FR-008).
import { classify, type Maturity } from './maturity';
import { normalizeText } from './normalize';
import { WINE_COLORS, type Furniture, type Location, type Stock, type Wine, type WineColor } from './types';

export interface RowLocation {
  id: string;
  label: string;
  /** Clé de tri : meuble puis étagère, lieux ensuite, « à rattacher » en dernier. */
  order: number;
}

export interface WineRow {
  wine: Wine;
  /** Somme des quantités actives. 0 = fiche « en historique ». */
  quantity: number;
  locations: RowLocation[];
}

export type SortKey = 'domain' | 'appellation' | 'vintage' | 'location' | 'added' | 'quantity';
export type SortDir = 'asc' | 'desc';
export interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

export const SORT_LABELS: Record<SortKey, string> = {
  domain: 'Domaine',
  appellation: 'Appellation',
  vintage: 'Millésime',
  location: 'Emplacement',
  added: 'Date d’ajout',
  quantity: 'Quantité',
};

export interface Filters {
  colors: WineColor[];
  countries: string[];
  regions: string[];
  /** Appellations (comme pays et régions, `''` = non renseigné). */
  appellations: string[];
  /** Catégories de maturité (selon la fenêtre de garde et l'année en cours). */
  maturity: Maturity[];
  /** Plage de millésimes (les non millésimés en sont exclus dès qu'une borne est posée). */
  vintageMin: number | null;
  vintageMax: number | null;
  /** Inclut les non millésimés (NV) : seuls s'il n'y a pas de plage, en plus de la plage sinon. */
  vintageNone: boolean;
  /** Quantité totale en stock. */
  qtyMin: number | null;
  qtyMax: number | null;
  locationIds: string[];
  /** Identifiant de la personne qui a offert la bouteille (fiches « cadeau »). */
  giftFrom: string | null;
  /** Inclut les fiches sans bouteille en stock. */
  includeHistory: boolean;
}

export function emptyFilters(): Filters {
  return {
    colors: [],
    countries: [],
    regions: [],
    appellations: [],
    maturity: [],
    vintageMin: null,
    vintageMax: null,
    vintageNone: false,
    qtyMin: null,
    qtyMax: null,
    locationIds: [],
    giftFrom: null,
    includeHistory: false,
  };
}

/** Nombre de critères actifs (un critère = un groupe de filtre renseigné). */
export function activeFilterCount(f: Filters): number {
  return (
    (f.colors.length > 0 ? 1 : 0) +
    (f.countries.length > 0 ? 1 : 0) +
    (f.regions.length > 0 ? 1 : 0) +
    (f.appellations.length > 0 ? 1 : 0) +
    (f.maturity.length > 0 ? 1 : 0) +
    (f.vintageMin !== null || f.vintageMax !== null || f.vintageNone ? 1 : 0) +
    (f.qtyMin !== null || f.qtyMax !== null ? 1 : 0) +
    (f.locationIds.length > 0 ? 1 : 0) +
    (f.giftFrom !== null ? 1 : 0) +
    (f.includeHistory ? 1 : 0)
  );
}

// --- construction des lignes ---

function locationOrder(loc: Location, furniture: Furniture[]): number {
  if (loc.kind === 'shelf') {
    const fo = furniture.find((f) => f.id === loc.furniture_id)?.order ?? 999;
    return fo * 1000 + loc.order;
  }
  return (loc.kind === 'place' ? 1_000_000 : 2_000_000) + loc.order;
}

function locationLabel(loc: Location, furniture: Furniture[]): string {
  if (loc.kind !== 'shelf') return loc.name;
  const f = furniture.find((x) => x.id === loc.furniture_id);
  return f ? `${f.name} · ${loc.name}` : loc.name;
}

export function buildRows(input: {
  wines: Wine[];
  stocks: Stock[];
  locations: Location[];
  furniture: Furniture[];
}): WineRow[] {
  const locById = new Map(input.locations.filter((l) => !l.deleted).map((l) => [l.id, l] as const));
  const furniture = input.furniture.filter((f) => !f.deleted);
  const byWine = new Map<string, Stock[]>();
  for (const s of input.stocks) {
    if (s.deleted || s.quantity <= 0) continue;
    const list = byWine.get(s.wine_id);
    if (list) list.push(s);
    else byWine.set(s.wine_id, [s]);
  }
  const rows: WineRow[] = [];
  for (const wine of input.wines) {
    if (wine.deleted) continue;
    const stocks = byWine.get(wine.id) ?? [];
    const seen = new Set<string>();
    const locations: RowLocation[] = [];
    for (const st of stocks) {
      const loc = locById.get(st.location_id);
      if (!loc || seen.has(loc.id)) continue;
      seen.add(loc.id);
      locations.push({ id: loc.id, label: locationLabel(loc, furniture), order: locationOrder(loc, furniture) });
    }
    locations.sort((a, b) => a.order - b.order);
    rows.push({ wine, quantity: stocks.reduce((n, s) => n + s.quantity, 0), locations });
  }
  return rows;
}

export const totalBottles = (rows: WineRow[]): number => rows.reduce((n, r) => n + r.quantity, 0);

// --- filtres ---

const norm = (v: string | null): string => normalizeText(v);

export function matches(row: WineRow, f: Filters, year: number = new Date().getFullYear()): boolean {
  const { wine } = row;
  if (!f.includeHistory && row.quantity <= 0) return false;
  if (f.colors.length > 0 && !(wine.color && f.colors.includes(wine.color))) return false;
  if (f.countries.length > 0 && !f.countries.some((c) => norm(c) === norm(wine.country))) return false;
  if (f.regions.length > 0 && !f.regions.some((r) => norm(r) === norm(wine.region))) return false;
  if (f.appellations.length > 0 && !f.appellations.some((a) => norm(a) === norm(wine.appellation))) return false;
  if (f.maturity.length > 0 && !f.maturity.includes(classify(wine, year).category)) return false;
  const hasRange = f.vintageMin !== null || f.vintageMax !== null;
  if (hasRange || f.vintageNone) {
    const v = wine.vintage;
    const inRange = v !== null && hasRange && (f.vintageMin === null || v >= f.vintageMin) && (f.vintageMax === null || v <= f.vintageMax);
    if (!(inRange || (v === null && f.vintageNone))) return false;
  }
  if (f.qtyMin !== null && row.quantity < f.qtyMin) return false;
  if (f.qtyMax !== null && row.quantity > f.qtyMax) return false;
  if (f.locationIds.length > 0 && !row.locations.some((l) => f.locationIds.includes(l.id))) return false;
  if (f.giftFrom !== null && !(wine.gift && wine.gift_from === f.giftFrom)) return false;
  return true;
}

// --- tri ---

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Compare deux valeurs éventuellement absentes : les absentes sont toujours en dernier. */
function compareNullable<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? cmp(a, b) : -cmp(a, b);
}

const text = (v: string | null): string | null => (v && v.trim() !== '' ? v : null);

function compare(a: WineRow, b: WineRow, s: SortSpec): number {
  switch (s.key) {
    case 'domain':
      return compareNullable(text(a.wine.domain), text(b.wine.domain), (x, y) => collator.compare(x, y), s.dir);
    case 'appellation':
      return compareNullable(text(a.wine.appellation), text(b.wine.appellation), (x, y) => collator.compare(x, y), s.dir);
    case 'vintage':
      return compareNullable(a.wine.vintage, b.wine.vintage, (x, y) => x - y, s.dir);
    case 'location':
      return compareNullable(a.locations[0]?.order ?? null, b.locations[0]?.order ?? null, (x, y) => x - y, s.dir);
    case 'added':
      return compareNullable(a.wine.created_at, b.wine.created_at, (x, y) => (x < y ? -1 : x > y ? 1 : 0), s.dir);
    case 'quantity':
      return compareNullable(a.quantity, b.quantity, (x, y) => x - y, s.dir);
  }
}

function tieBreak(a: WineRow, b: WineRow): number {
  return (
    collator.compare(a.wine.domain, b.wine.domain) ||
    collator.compare(a.wine.cuvee, b.wine.cuvee) ||
    (a.wine.vintage ?? Infinity) - (b.wine.vintage ?? Infinity) ||
    (a.wine.id < b.wine.id ? -1 : a.wine.id > b.wine.id ? 1 : 0)
  );
}

export function queryRows(rows: WineRow[], filters: Filters, sort: SortSpec, year: number = new Date().getFullYear()): WineRow[] {
  return rows.filter((r) => matches(r, filters, year)).sort((a, b) => compare(a, b, sort) || tieBreak(a, b));
}

// --- facettes (valeurs disponibles pour construire les filtres) ---

export interface Facets {
  colors: WineColor[];
  countries: string[];
  regions: string[];
  appellations: string[];
  vintageMin: number | null;
  vintageMax: number | null;
}

export function facetsOf(rows: WineRow[]): Facets {
  const colors = new Set<WineColor>();
  const countries = new Map<string, string>();
  const regions = new Map<string, string>();
  const appellations = new Map<string, string>();
  let vMin: number | null = null;
  let vMax: number | null = null;
  for (const { wine, quantity } of rows) {
    if (quantity <= 0) continue;
    if (wine.color) colors.add(wine.color);
    if (wine.country && !countries.has(norm(wine.country))) countries.set(norm(wine.country), wine.country);
    if (wine.region && !regions.has(norm(wine.region))) regions.set(norm(wine.region), wine.region);
    if (wine.appellation && !appellations.has(norm(wine.appellation))) appellations.set(norm(wine.appellation), wine.appellation);
    if (wine.vintage !== null) {
      vMin = vMin === null ? wine.vintage : Math.min(vMin, wine.vintage);
      vMax = vMax === null ? wine.vintage : Math.max(vMax, wine.vintage);
    }
  }
  const sortText = (m: Map<string, string>): string[] => [...m.values()].sort((a, b) => collator.compare(a, b));
  return {
    colors: WINE_COLORS.filter((c) => colors.has(c)),
    countries: sortText(countries),
    regions: sortText(regions),
    appellations: sortText(appellations),
    vintageMin: vMin,
    vintageMax: vMax,
  };
}
