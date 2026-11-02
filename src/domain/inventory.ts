// Pointage d'une étagère : on compare ce que l'application croit y trouver à ce qu'on y trouve vraiment.
import type { Stock } from './types';

export interface CountDiff {
  stockId: string;
  wineId: string;
  recorded: number;
  counted: number;
  /** counted − recorded (négatif = bouteille manquante). */
  delta: number;
}

/** Entier ≥ 0, sinon `null`. */
export const parseCount = (raw: string | number): number | null => {
  if (typeof raw === 'string' && raw.trim() === '') return null; // champ vide : pas un 0
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
};

/** Écarts à corriger : uniquement les stocks dont le nombre compté diffère du nombre enregistré. */
export function countDiffs(stocks: Stock[], counted: Map<string, number>): CountDiff[] {
  const out: CountDiff[] = [];
  for (const s of stocks) {
    if (s.deleted || s.quantity <= 0) continue;
    const c = counted.get(s.id);
    if (c === undefined || c === s.quantity) continue;
    out.push({ stockId: s.id, wineId: s.wine_id, recorded: s.quantity, counted: c, delta: c - s.quantity });
  }
  return out;
}
