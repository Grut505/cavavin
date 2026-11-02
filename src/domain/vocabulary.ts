// Vocabulaire des champs textuels répétitifs (appellation, région, pays, millésime) :
// suggestions tirées de la cave + graphies de référence, pour éviter les variantes quasi identiques.
import { normalizeText } from './normalize';
import type { Wine } from './types';

export type VocabField = 'appellation' | 'region' | 'country';

export interface VocabEntry {
  /** Graphie de référence (la plus utilisée dans la cave, sinon celle du jeu de départ). */
  value: string;
  /** Nombre de fiches qui l'utilisent. */
  count: number;
  /** Clé normalisée (sans accents, casse, ponctuation). */
  key: string;
}

export interface Related {
  region: string | null;
  country: string | null;
}

export interface Vocabulary {
  appellation: VocabEntry[];
  region: VocabEntry[];
  country: VocabEntry[];
  /** Millésimes présents dans la cave, du plus récent au plus ancien. */
  vintages: number[];
  /** Pour une appellation (clé normalisée) : région et pays les plus souvent associés. */
  related: Map<string, Related>;
}

/** Graphies de départ, pour que les premières saisies soient déjà cohérentes. */
export const SEED_COUNTRIES = [
  'France', 'Italie', 'Espagne', 'Portugal', 'Allemagne', 'Suisse', 'Autriche', 'Grèce', 'Hongrie',
  'Géorgie', 'Liban', 'Luxembourg', 'Belgique', 'Royaume-Uni', 'États-Unis', 'Argentine', 'Chili',
  'Australie', 'Nouvelle-Zélande', 'Afrique du Sud',
];

export const SEED_REGIONS = [
  'Alsace', 'Beaujolais', 'Bordeaux', 'Bourgogne', 'Champagne', 'Corse', 'Jura', 'Languedoc', 'Loire',
  'Provence', 'Roussillon', 'Savoie', 'Sud-Ouest', 'Vallée du Rhône',
];

const clean = (s: string | null | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ');

/** Regroupe les graphies d'une même clé normalisée ; retient la plus fréquente (puis la plus « riche »). */
function group(values: (string | null)[], seeds: string[] = []): VocabEntry[] {
  const byKey = new Map<string, Map<string, number>>();
  const add = (raw: string | null, n: number): void => {
    const v = clean(raw);
    const key = normalizeText(v);
    if (!key) return;
    const variants = byKey.get(key) ?? new Map<string, number>();
    variants.set(v, (variants.get(v) ?? 0) + n);
    byKey.set(key, variants);
  };
  for (const v of values) add(v, 1);
  const real = new Set(byKey.keys());
  for (const s of seeds) if (!real.has(normalizeText(s))) add(s, 0);

  const out: VocabEntry[] = [];
  for (const [key, variants] of byKey) {
    const ranked = [...variants.entries()].sort(
      (a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], 'fr'),
    );
    out.push({ value: ranked[0]![0], count: [...variants.values()].reduce((x, y) => x + y, 0), key });
  }
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr', { sensitivity: 'base' }));
}

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, { value: string; n: number }>();
  for (const raw of values) {
    const v = clean(raw);
    const key = normalizeText(v);
    if (!key) continue;
    const c = counts.get(key) ?? { value: v, n: 0 };
    c.n++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.value ?? null;
}

export function buildVocabulary(wines: Wine[]): Vocabulary {
  const active = wines.filter((w) => !w.deleted);
  const regions = group(active.map((w) => w.region), SEED_REGIONS);
  const countries = group(active.map((w) => w.country), SEED_COUNTRIES);
  const appellations = group(active.map((w) => w.appellation));

  // Les régions/pays déjà associés à une appellation sont repris tels que la cave les épelle.
  const canonical = (entries: VocabEntry[], v: string | null): string | null => {
    const key = normalizeText(v);
    return entries.find((e) => e.key === key)?.value ?? (clean(v) || null);
  };
  const byAppellation = new Map<string, Wine[]>();
  for (const w of active) {
    const key = normalizeText(w.appellation);
    if (!key) continue;
    byAppellation.set(key, [...(byAppellation.get(key) ?? []), w]);
  }
  const related = new Map<string, Related>();
  for (const [key, ws] of byAppellation) {
    related.set(key, {
      region: canonical(regions, mostCommon(ws.map((w) => w.region))),
      country: canonical(countries, mostCommon(ws.map((w) => w.country))),
    });
  }

  const vintages = [...new Set(active.map((w) => w.vintage).filter((v): v is number => v !== null))].sort((a, b) => b - a);
  return { appellation: appellations, region: regions, country: countries, vintages, related };
}

/** Distance d'édition (insertion, suppression, substitution). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

export type Canonical =
  | { kind: 'empty' }
  /** Même valeur, éventuellement écrite autrement (casse, accents, tiret) : on reprend la graphie existante. */
  | { kind: 'same'; value: string; changed: boolean }
  /** Valeur proche d'une existante (faute de frappe probable) : à faire confirmer. */
  | { kind: 'close'; typed: string; suggestion: string }
  | { kind: 'new'; value: string };

/** Seuil de proximité : plus la valeur est longue, plus on tolère de fautes. */
function threshold(len: number): number {
  if (len >= 9) return 2;
  if (len >= 5) return 1;
  return 0;
}

export function canonicalize(entries: VocabEntry[], raw: string): Canonical {
  const typed = clean(raw);
  if (typed === '') return { kind: 'empty' };
  const key = normalizeText(typed);
  const exact = entries.find((e) => e.key === key);
  if (exact) return { kind: 'same', value: exact.value, changed: exact.value !== typed };

  let best: { entry: VocabEntry; d: number } | undefined;
  for (const entry of entries) {
    const limit = threshold(Math.min(key.length, entry.key.length));
    if (limit === 0 || Math.abs(entry.key.length - key.length) > limit) continue;
    const d = editDistance(key, entry.key);
    if (d <= limit && (!best || d < best.d || (d === best.d && entry.count > best.entry.count))) best = { entry, d };
  }
  return best ? { kind: 'close', typed, suggestion: best.entry.value } : { kind: 'new', value: typed };
}

/** Région et pays à proposer quand l'appellation est déjà connue de la cave. */
export function relatedFor(vocab: Vocabulary, appellation: string): Related | undefined {
  return vocab.related.get(normalizeText(appellation));
}
