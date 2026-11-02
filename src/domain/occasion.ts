// Prompt « quoi boire ce soir » à coller dans le projet Claude (spec 002, FR-009 à FR-012). Aucun appel d'IA.
import { MATURITY_LABELS, classify, maturityGroups, windowText } from './maturity';
import type { WineRow } from './query';
import { wineTitle } from './wine';

export const MAX_PROMPT_BOTTLES = 60;

export interface OccasionPrompt {
  text: string;
  included: number;
  total: number;
  truncated: boolean;
}

export function buildOccasionPrompt(
  occasion: string,
  rows: WineRow[],
  year: number,
  max: number = MAX_PROMPT_BOTTLES,
): OccasionPrompt {
  // Priorité : en retard, à finir, à boire, bientôt, non évaluées, trop tôt.
  const groups = maturityGroups(rows, year);
  const order = ['late', 'now', 'soon', 'unknown', 'early'] as const;
  const entries = order.flatMap((c) => groups.find((g) => g.category === c)!.entries);
  const kept = entries.slice(0, max);
  const lines = kept.map(({ row }) => {
    const w = row.wine;
    const { primary, secondary } = wineTitle(w);
    const info = classify(w, year);
    const parts = [
      secondary ? `${primary} — ${secondary}` : primary,
      w.appellation,
      w.color,
      `×${row.quantity}`,
      `${MATURITY_LABELS[info.category]}${info.finishing ? ' (à finir)' : ''}${windowText(w) ? ` ${windowText(w)}` : ''}`,
      row.locations[0]?.label,
    ].filter((p): p is string => !!p && p.trim() !== '');
    return `- ${parts.join(' | ')}`;
  });
  const truncated = entries.length > kept.length;
  const text = [
    'Voici ma cave. Aide-moi à choisir une ou plusieurs bouteilles pour l’occasion ci-dessous.',
    '',
    `Occasion : ${occasion.trim() || 'pas de contrainte particulière'}`,
    `Année en cours : ${year}`,
    '',
    'Consignes :',
    '- Choisis uniquement parmi les bouteilles de la liste, sans en inventer.',
    '- Propose 3 choix maximum, par ordre de préférence, avec une courte justification (accord, maturité).',
    '- Privilégie les bouteilles « en retard » ou « à finir » quand elles conviennent.',
    '- Indique pour chaque choix où la trouver (emplacement).',
    '',
    `Mes bouteilles (${kept.length}${truncated ? ` sur ${entries.length}, les plus urgentes` : ''}) — domaine — cuvée — millésime | appellation | couleur | quantité | maturité | emplacement :`,
    ...lines,
  ].join('\n');
  return { text, included: kept.length, total: entries.length, truncated };
}
