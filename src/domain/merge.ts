// Fusion de deux fiches (doublons) : la fiche conservée absorbe l'autre sans rien perdre.
import { normalizeText, wineKey } from './normalize';
import { joinPairings, pairingsOf, parsePairings } from './pairing-list';
import type { Wine } from './types';

type Patch = Partial<Pick<Wine, 'appellation' | 'region' | 'country' | 'drink_from' | 'drink_until' | 'purchase_price' | 'purchase_date' | 'supplier' | 'rating' | 'notes' | 'tannin' | 'dryness' | 'pairings' | 'gift' | 'gift_from' | 'to_buy' | 'needs_review'>>;

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

/**
 * Champs de la fiche conservée à mettre à jour : on ne comble que les champs vides avec ceux de l'autre fiche
 * (rien n'est écrasé) ; mets réunis ; notes concaténées si elles diffèrent ; liste de courses et cadeau repris.
 */
export function mergePatch(keep: Wine, absorbed: Wine): Patch {
  const out: Patch = {};
  const fill = <K extends keyof Patch>(k: K): void => {
    if (isEmpty(keep[k as keyof Wine]) && !isEmpty(absorbed[k as keyof Wine])) (out as Record<string, unknown>)[k] = absorbed[k as keyof Wine];
  };
  for (const k of ['appellation', 'region', 'country', 'drink_from', 'drink_until', 'purchase_price', 'purchase_date', 'supplier', 'rating', 'tannin', 'dryness'] as const) fill(k);

  const a = keep.notes?.trim() ?? '';
  const b = absorbed.notes?.trim() ?? '';
  if (b && normalizeText(a) !== normalizeText(b)) out.notes = a ? `${a}\n${b}` : b;

  const pairings = parsePairings([...pairingsOf(keep), ...pairingsOf(absorbed)]);
  const joined = joinPairings(pairings);
  if (joined !== (keep.pairings ?? null)) out.pairings = joined;

  if (!keep.gift && absorbed.gift) {
    out.gift = true;
    out.gift_from = absorbed.gift_from;
  } else if (keep.gift && !keep.gift_from && absorbed.gift_from) {
    out.gift_from = absorbed.gift_from;
  }
  if (!keep.to_buy && absorbed.to_buy) out.to_buy = true;
  if (keep.needs_review && !absorbed.needs_review) out.needs_review = false;
  return out;
}

/** Fiches proposées pour une fusion : d'abord les doublons probables (même domaine, ou même clé), puis les autres. */
export function mergeCandidates(wines: Wine[], target: Wine, search = ''): Wine[] {
  const q = normalizeText(search);
  const domain = normalizeText(target.domain);
  const key = wineKey(target);
  const score = (w: Wine): number => (wineKey(w) === key ? 0 : domain !== '' && normalizeText(w.domain) === domain ? 1 : 2);
  return wines
    .filter((w) => !w.deleted && w.id !== target.id)
    .filter((w) => q === '' || normalizeText(`${w.domain} ${w.cuvee} ${w.vintage ?? 'nv'} ${w.appellation ?? ''}`).includes(q))
    .sort((a, b) => score(a) - score(b) || normalizeText(a.domain).localeCompare(normalizeText(b.domain)) || (a.vintage ?? 0) - (b.vintage ?? 0));
}
