// Compléter les mets des fiches existantes (spec 002) : prompt par lots pour le projet Claude, puis
// lecture de sa réponse. Aucun appel d'IA par l'application ; seules les fiches sans mets sont touchées.
import { extractJson } from '../scan/proposal';
import { joinPairings, pairingsOf, parsePairings, splitVegetarian } from './pairing-list';
import type { WineRow } from './query';
import { wineTitle } from './wine';

export const BACKFILL_BATCH = 30;

/** Fiches non supprimées dont les mets sont vides (en stock d'abord, puis historique). */
export function winesWithoutPairings(rows: WineRow[]): WineRow[] {
  return rows
    .filter((r) => !r.wine.deleted && pairingsOf(r.wine).length === 0)
    .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0));
}

export interface BackfillPrompt {
  text: string;
  count: number;
  remaining: number;
}

export function buildBackfillPrompt(rows: WineRow[], max: number = BACKFILL_BATCH): BackfillPrompt {
  const todo = winesWithoutPairings(rows);
  const batch = todo.slice(0, max);
  const lines = batch.map(({ wine }) => {
    const { primary, secondary } = wineTitle(wine);
    return `- ${[wine.id, secondary ? `${primary} — ${secondary}` : primary, wine.appellation, wine.color].filter(Boolean).join(' | ')}`;
  });
  const text = [
    'Tu es un extracteur de données, pas un conseiller. Pour chacun des vins ci-dessous, donne les mets qui s’accordent bien avec lui, d’après ta connaissance du vin, de son appellation, de sa couleur et de son style.',
    '',
    'RÈGLES',
    '1. Cuisine STRICTEMENT VÉGÉTARIENNE : jamais de viande, volaille, gibier, charcuterie, poisson, crustacé ni fruit de mer (œufs, laitages et fromages sont acceptés).',
    '2. 4 à 8 mets par vin, noms courts en français (ex. « risotto aux champignons », « gratin dauphinois », « curry de légumes », « fromages à pâte dure »), sans phrase ni justification.',
    '3. Si tu n’es pas raisonnablement sûr d’un vin, mets null pour ses mets.',
    '4. Réponds UNIQUEMENT par un bloc de code json : un tableau avec un objet par vin, en recopiant exactement son id. Aucune phrase avant ou après.',
    '',
    'FORMAT',
    '```json',
    '[{ "id": "recopie-l-id", "pairings": ["risotto aux champignons", "gratin dauphinois", "fromages à pâte dure"] }]',
    '```',
    '',
    `VINS (id | vin | appellation | couleur) — ${batch.length} :`,
    ...lines,
  ].join('\n');
  return { text, count: batch.length, remaining: todo.length - batch.length };
}

export interface BackfillUpdate {
  id: string;
  pairings: string;
}

export interface BackfillResult {
  updates: BackfillUpdate[];
  warnings: string[];
}

/** Lit la réponse de Claude ; ne garde que les ids connus et sans mets, les mets végétariens uniquement. */
export function parseBackfill(text: string, rows: WineRow[]): BackfillResult {
  const json = extractJson(text);
  if (json === undefined) return { updates: [], warnings: ['Aucun JSON valide trouvé dans le texte collé.'] };
  const items = Array.isArray(json) ? json : [json];
  const byId = new Map(rows.map((r) => [r.wine.id, r.wine] as const));
  const updates: BackfillUpdate[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const wine = byId.get(id);
    if (!wine) {
      warnings.push(`Identifiant inconnu ignoré : « ${id || '?'} ».`);
      continue;
    }
    const title = wineTitle(wine).primary;
    if (seen.has(id)) continue;
    seen.add(id);
    if (pairingsOf(wine).length > 0) {
      warnings.push(`${title} : déjà des mets, laissés tels quels.`);
      continue;
    }
    const raw = o.pairings;
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw !== 'string' && !(Array.isArray(raw) && raw.every((x) => typeof x === 'string'))) {
      warnings.push(`${title} : mets illisibles, ignorés.`);
      continue;
    }
    const { kept, dropped } = splitVegetarian(parsePairings(raw as string | string[]));
    if (dropped.length > 0) warnings.push(`${title} : mets non végétariens retirés (${dropped.join(', ')}).`);
    const joined = joinPairings(kept);
    if (joined) updates.push({ id, pairings: joined });
  }
  return { updates, warnings };
}
