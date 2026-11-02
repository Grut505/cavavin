// Statistiques → Liste : filtre correspondant à une ligne cliquée (spec 002, FR-022).
import type { Maturity } from './maturity';
import type { Filters } from './query';
import { NOT_SET, type Axis, type Slice } from './stats';
import { WINE_COLORS, type WineColor } from './types';

/**
 * Filtres à appliquer à la Liste pour retrouver les bouteilles d'une ligne de statistique, ou `null` si la ligne
 * ne correspond pas à un filtre (millésime non renseigné ou regroupé sous « Autres »).
 */
export function sliceFilter(axis: Axis, slice: Slice): Partial<Filters> | null {
  // « Non renseigné » → valeur vide ; « Autres » → toutes les valeurs regroupées.
  const labels = (): string[] => (slice.label === NOT_SET ? [''] : (slice.keys ?? [slice.label]));
  switch (axis) {
    case 'color':
      return (WINE_COLORS as readonly string[]).includes(slice.label) ? { colors: [slice.label as WineColor] } : null;
    case 'country':
      return { countries: labels() };
    case 'region':
      return { regions: labels() };
    case 'appellation':
      return { appellations: labels() };
    case 'vintage': {
      const year = Number(slice.label);
      return Number.isInteger(year) ? { vintageMin: year, vintageMax: year } : null;
    }
  }
}

export const maturityFilter = (category: Maturity): Partial<Filters> => ({ maturity: [category] });
