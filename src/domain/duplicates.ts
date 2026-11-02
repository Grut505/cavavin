// Détection de doublons de fiches (FR-004) : clé = domaine + cuvée + millésime.
import { normalizeText, wineKey } from './normalize';
import type { Wine } from './types';

export interface DuplicateMatch {
  wine: Wine;
  /** `exact` : même clé ; `probable` : même domaine et millésime, une seule des deux cuvées renseignée. */
  match: 'exact' | 'probable';
}

type Candidate = { domain: string | null; cuvee: string | null; vintage: number | null };

export function findDuplicate(wines: Wine[], c: Candidate): DuplicateMatch | undefined {
  const active = wines.filter((w) => !w.deleted);
  const key = wineKey(c);
  const exact = active.find((w) => wineKey(w) === key);
  if (exact) return { wine: exact, match: 'exact' };

  const domain = normalizeText(c.domain);
  const cuvee = normalizeText(c.cuvee);
  const probable = active.find((w) => {
    if (normalizeText(w.domain) !== domain || w.vintage !== c.vintage) return false;
    const other = normalizeText(w.cuvee);
    return (other === '') !== (cuvee === '');
  });
  return probable ? { wine: probable, match: 'probable' } : undefined;
}
