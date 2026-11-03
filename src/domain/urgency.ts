// Code couleur d'urgence d'une bouteille selon l'échéance de sa fenêtre de garde (cave et étagères).
import { classify } from './maturity';
import type { Stock, Wine } from './types';

export type Urgency = 'late' | 'finishing' | 'now' | 'soon' | 'early' | 'unknown';

/** Du plus urgent au moins urgent. */
export const URGENCY_ORDER: readonly Urgency[] = ['late', 'finishing', 'now', 'soon', 'early', 'unknown'];

export const URGENCY_LABELS: Record<Urgency, string> = {
  late: 'En retard',
  finishing: 'À finir',
  now: 'À point',
  soon: 'Bientôt',
  early: 'Trop tôt',
  unknown: 'Non évaluée',
};

/** Texte de la légende. */
export const URGENCY_HINTS: Record<Urgency, string> = {
  late: 'La fenêtre de garde est dépassée : à boire sans attendre.',
  finishing: 'La fenêtre se termine cette année ou la suivante.',
  now: 'Dans la fenêtre de garde, aucune urgence.',
  soon: 'La fenêtre s’ouvre l’an prochain.',
  early: 'La fenêtre s’ouvre dans plus d’un an : à garder.',
  unknown: 'Fenêtre de garde absente ou incohérente.',
};

export function urgencyOf(wine: Pick<Wine, 'drink_from' | 'drink_until'>, year: number): Urgency {
  const m = classify(wine, year);
  return m.category === 'now' && m.finishing ? 'finishing' : m.category;
}

const rank = (u: Urgency): number => URGENCY_ORDER.indexOf(u);

/** Une entrée par bouteille, la plus urgente d'abord, pour chaque emplacement (stocks actifs seulement). */
export function urgencyByLocation(stocks: Stock[], wines: Wine[], year: number): Map<string, Urgency[]> {
  const byWine = new Map(wines.map((w) => [w.id, urgencyOf(w, year)] as const));
  const out = new Map<string, Urgency[]>();
  for (const st of stocks) {
    if (st.deleted || st.quantity <= 0) continue;
    const u = byWine.get(st.wine_id) ?? 'unknown';
    const list = out.get(st.location_id) ?? [];
    for (let i = 0; i < st.quantity; i++) list.push(u);
    out.set(st.location_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => rank(a) - rank(b));
  return out;
}
