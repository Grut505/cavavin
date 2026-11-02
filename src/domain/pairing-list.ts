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


// --- mode végétarien ---

/** Mots (singulier) qui désignent de la viande, de la charcuterie, du poisson ou des fruits de mer. */
const NON_VEGETARIAN = new Set([
  'viande', 'boeuf', 'veau', 'porc', 'agneau', 'mouton', 'poulet', 'volaille', 'dinde', 'canard', 'magret', 'oie', 'lapin', 'gibier',
  'cerf', 'sanglier', 'biche', 'chevreuil', 'pigeon', 'caille', 'pintade', 'jambon', 'lard', 'lardon', 'bacon', 'saucisse', 'saucisson',
  'charcuterie', 'terrine', 'rillette', 'foie', 'boudin', 'merguez', 'chorizo', 'steak', 'entrecote', 'gigot', 'confit', 'cassoulet',
  'bourguignon', 'poisson', 'saumon', 'thon', 'cabillaud', 'morue', 'sole', 'dorade', 'truite', 'sardine', 'anchois', 'maquereau',
  'crevette', 'gambas', 'homard', 'langouste', 'langoustine', 'crabe', 'moule', 'huitre', 'coquillage', 'calamar', 'poulpe', 'sushi',
  'sashimi', 'coquille', 'crustace', 'tripe', 'andouillette',
]);
const NON_VEGETARIAN_PHRASES = ['fruit de mer', 'fruits de mer', 'pot au feu', 'saint jacques', 'jus de viande', 'bouillon de poule'];

const singular = (w: string): string => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

/** Vrai si le met ne contient ni viande, ni charcuterie, ni poisson, ni fruits de mer (œufs, laitages et fromages acceptés). */
export function isVegetarian(item: string): boolean {
  const f = fold(item);
  if (NON_VEGETARIAN_PHRASES.some((p) => f.includes(p))) return false;
  return !f.split(' ').some((w) => NON_VEGETARIAN.has(w) || NON_VEGETARIAN.has(singular(w)));
}

/** Sépare une liste de mets entre végétariens (gardés) et non végétariens (écartés). */
export function splitVegetarian(items: string[]): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const i of items) (isVegetarian(i) ? kept : dropped).push(i);
  return { kept, dropped };
}
