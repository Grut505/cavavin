// Liste des mets d'une fiche : lecture/écriture tolérantes (aucune dépendance, utilisable partout).
import { normalizeText } from './normalize';

/** Minuscules, sans accents ni ligatures (œ → oe, æ → ae). */
export const fold = (s: string): string => normalizeText(s.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'));

export const MAX_PAIRINGS = 12;
const MAX_PAIRING_LENGTH = 60;
const SEPARATOR = '; ';

/** Saisie libre (texte ou liste) → liste propre : virgules, points-virgules et retours à la ligne acceptés, doublons retirés. */
export function parsePairings(raw: string | string[] | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[;,\n•·]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const item = String(part)
      .replace(/^[\s[\]"'«»]+|[\s[\]"'«»]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_PAIRING_LENGTH);
    const key = fold(item);
    if (item === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_PAIRINGS) break;
  }
  return out;
}

export const joinPairings = (list: string[]): string | null => (list.length === 0 ? null : list.join(SEPARATOR));

/** Mets d'une fiche (tolère l'absence du champ sur d'anciennes fiches locales). */
export const pairingsOf = (w: { pairings?: string | null }): string[] => parsePairings(w.pairings ?? null);

