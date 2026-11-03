// Mets conseillés par bouteille (spec 002) et recherche tolérante « quoi boire avec… ».
// Les mets sont stockés dans la fiche sous forme de liste séparée par des points-virgules.
import { classify, windowText, type Maturity, type MaturityInfo } from './maturity';
import { fold, pairingsOf } from './pairing-list';
import type { WineRow } from './query';

// --- tolérance aux fautes ---

/** Mots sans valeur pour la recherche (articles, politesses, nombre de convives…). */
const STOP = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'cet', 'cette', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'pour', 'sur', 'un', 'une', 'ce', 'soir',
  'personne', 'personnes', 'convive', 'convives', 'invite', 'invites', 'pers', 'je', 'veux', 'voudrais', 'quoi', 'boire', 'vin', 'bouteille', 'plat', 'repas', 'diner', 'dejeuner',
]);

/** Singulier approximatif : « moules » → « moule », « poireaux » → « poireau ». */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('aux')) return w.slice(0, -1);
  if (w.length > 3 && (w.endsWith('s') || w.endsWith('x'))) return w.slice(0, -1);
  return w;
}

/** Mots significatifs d'une phrase (normalisés, sans mots vides ni nombres isolés). */
export function dishTokens(s: string): string[] {
  return fold(s)
    .split(' ')
    .filter((w) => w !== '' && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

/** Distance de Damerau-Levenshtein (insertion, suppression, substitution, transposition) bornée. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? Infinity) + 1);
      cur[j] = v;
    }
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length]!;
}

/** Score d'un mot cherché contre un mot de met : 3 identique, 2,5 préfixe, 2 faute de frappe, 0 sinon. */
export function wordScore(query: string, word: string): number {
  if (query === word) return 3;
  if (query.length >= 3 && (word.startsWith(query) || (word.length >= 4 && query.startsWith(word)))) return 2.5;
  if (query.length < 4) return 0;
  const tolerance = query.length >= 8 ? 2 : 1;
  return editDistance(query, word, tolerance) <= tolerance ? 2 : 0;
}

// --- recherche ---

const RANK: Record<Maturity, number> = { now: 0, late: 1, unknown: 2, soon: 3, early: 4 };

export interface PairingMatch {
  row: WineRow;
  info: MaturityInfo;
  /** Part des mots cherchés retrouvés (0–1). */
  coverage: number;
  score: number;
  /** Mets de la fiche qui ont déclenché la correspondance. */
  matched: string[];
  window: string;
}

export interface PairingSearch {
  tokens: string[];
  matches: PairingMatch[];
  /** Fiches en stock sans aucun met renseigné (jamais trouvées par cette recherche). */
  withoutPairings: number;
}

/**
 * Une fiche correspond-elle au plat (mots déjà extraits par `dishTokens`) ? Il suffit qu'au moins la moitié des mots
 * significatifs soit retrouvée dans ses mets ; `null` sinon (ou sans mets renseignés).
 */
export function dishMatch(row: WineRow, tokens: string[], year: number): PairingMatch | null {
  if (tokens.length === 0) return null;
  const items = pairingsOf(row.wine).map((item) => ({ item, words: dishTokens(item) }));
  if (items.length === 0) return null;
  const need = Math.max(1, Math.ceil(tokens.length / 2));
  let score = 0;
  let found = 0;
  const matched = new Set<string>();
  for (const t of tokens) {
    let best = 0;
    let bestItem = '';
    for (const { item, words } of items) {
      for (const w of words) {
        const s = wordScore(t, w);
        if (s > best) {
          best = s;
          bestItem = item;
        }
      }
    }
    if (best > 0) {
      found++;
      score += best;
      matched.add(bestItem);
    }
  }
  if (found < need) return null;
  return { row, info: classify(row.wine, year), coverage: found / tokens.length, score, matched: [...matched], window: windowText(row.wine) };
}

/**
 * Cherche, parmi les bouteilles en stock, celles dont les mets correspondent à la demande.
 * Permissif : fautes de frappe, accents, pluriels, mots vides et nombres de convives sont ignorés ;
 * il suffit qu'au moins la moitié des mots significatifs soit retrouvée. Les bouteilles à boire
 * maintenant (puis « à finir ») passent avant les autres à pertinence égale.
 */
export function searchByDish(rows: WineRow[], query: string, year: number): PairingSearch {
  const tokens = dishTokens(query);
  const inStock = rows.filter((r) => r.quantity > 0 && !r.wine.deleted);
  const withoutPairings = inStock.filter((r) => pairingsOf(r.wine).length === 0).length;
  if (tokens.length === 0) return { tokens, matches: [], withoutPairings };

  const matches: PairingMatch[] = [];
  for (const row of inStock) {
    const m = dishMatch(row, tokens, year);
    if (m) matches.push(m);
  }

  const rank = (m: PairingMatch): number => (m.info.category === 'now' && m.info.finishing ? -1 : RANK[m.info.category]);
  matches.sort(
    (a, b) =>
      Number(b.coverage === 1) - Number(a.coverage === 1) ||
      rank(a) - rank(b) ||
      b.score - a.score ||
      (a.row.wine.drink_until ?? Infinity) - (b.row.wine.drink_until ?? Infinity),
  );
  return { tokens, matches, withoutPairings };
}

export interface VocabItem {
  label: string;
  bottles: number;
}

/** Mets les plus fréquents de la cave (pour proposer des raccourcis de recherche). */
export function pairingVocabulary(rows: WineRow[], limit = 10): VocabItem[] {
  const map = new Map<string, VocabItem>();
  for (const row of rows) {
    if (row.quantity <= 0 || row.wine.deleted) continue;
    for (const item of pairingsOf(row.wine)) {
      const key = fold(item);
      const cur = map.get(key) ?? { label: item, bottles: 0 };
      cur.bottles += row.quantity;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.bottles - a.bottles || a.label.localeCompare(b.label, 'fr')).slice(0, limit);
}
