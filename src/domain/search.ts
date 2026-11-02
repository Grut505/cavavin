// Recherche texte sur la liste (FR-009) : insensible à la casse et aux accents, tous les mots doivent correspondre.
import { normalizeText } from './normalize';
import type { WineRow } from './query';

const COLOR_WORDS: Record<string, string> = {
  rouge: 'rouge',
  blanc: 'blanc',
  rosé: 'rose',
  effervescent: 'effervescent bulles',
  liquoreux: 'liquoreux',
  autre: 'autre',
};

interface Field {
  weight: number;
  text: string;
}

function fieldsOf(row: WineRow): Field[] {
  const w = row.wine;
  return [
    { weight: 5, text: normalizeText(w.domain) },
    { weight: 4, text: normalizeText(w.cuvee) },
    { weight: 4, text: normalizeText(w.appellation) },
    { weight: 3, text: w.vintage === null ? 'nv non millesime' : String(w.vintage) },
    { weight: 2, text: normalizeText(w.region) },
    { weight: 2, text: normalizeText(w.country) },
    { weight: 2, text: row.locations.map((l) => normalizeText(l.label)).join(' ') },
    { weight: 1, text: COLOR_WORDS[w.color ?? ''] ?? '' },
    { weight: 1, text: normalizeText(w.supplier) },
    { weight: 1, text: normalizeText(w.notes) },
  ];
}

/**
 * Score d'un mot dans un champ : mot entier > début de mot > simple fragment ; 0 si absent.
 * Un nombre n'est jamais cherché au milieu d'un mot, et un nombre court (1 ou 2 chiffres) doit être un
 * mot entier : « étagère 2 » ne doit pas retrouver le millésime « 2015 ».
 */
function tokenScore(token: string, field: Field): number {
  if (!field.text) return 0;
  const words = field.text.split(' ');
  if (words.includes(token)) return field.weight * 3;
  if (/^\d+$/.test(token)) {
    return token.length >= 3 && words.some((w) => w.startsWith(token)) ? field.weight * 2 : 0;
  }
  if (words.some((w) => w.startsWith(token))) return field.weight * 2;
  return field.text.includes(token) ? field.weight : 0;
}

export function tokenize(query: string): string[] {
  return normalizeText(query).split(' ').filter(Boolean);
}

/**
 * Lignes correspondant à la requête, les plus pertinentes d'abord (à pertinence égale, l'ordre d'entrée
 * est conservé). Requête vide : lignes inchangées.
 */
export function searchRows(rows: WineRow[], query: string): WineRow[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return rows;
  const scored: { row: WineRow; score: number }[] = [];
  for (const row of rows) {
    const fields = fieldsOf(row);
    let total = 0;
    let all = true;
    for (const t of tokens) {
      const best = Math.max(...fields.map((f) => tokenScore(t, f)));
      if (best === 0) {
        all = false;
        break;
      }
      total += best;
    }
    if (all) scored.push({ row, score: total });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.row);
}
