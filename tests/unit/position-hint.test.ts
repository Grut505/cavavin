import { describe, expect, it } from 'vitest';
import { rowToEntity, kindHeaders } from '../../src/data/schema';
import { POSITION_HINTS, normalizePositionHint, positionLabel } from '../../src/domain/types';

describe('positions sur l’étagère', () => {
  it('propose neuf zones : trois rangées × trois colonnes', () => {
    expect(POSITION_HINTS).toHaveLength(9);
    expect(POSITION_HINTS).toContain('dessus-gauche');
    expect(POSITION_HINTS).toContain('milieu-centre');
    expect(POSITION_HINTS).toContain('dessous-droite');
    expect(positionLabel('dessus-gauche')).toBe('Dessus · gauche');
    expect(positionLabel('milieu-centre')).toBe('Milieu · centre');
  });

  it('reprend les anciennes valeurs : dessus et dessous → milieu', () => {
    expect(normalizePositionHint('dessus')).toBe('milieu-centre');
    expect(normalizePositionHint('dessous')).toBe('milieu-centre');
    expect(normalizePositionHint('gauche')).toBe('milieu-gauche');
    expect(normalizePositionHint('droite')).toBe('milieu-droite');
    expect(normalizePositionHint(' Dessous-Droite ')).toBe('dessous-droite');
    for (const bad of [null, undefined, '', 'nimporte', 42]) expect(normalizePositionHint(bad), String(bad)).toBeNull();
  });

  it('une ligne de la feuille avec une ancienne position est lue avec la nouvelle', () => {
    const header = kindHeaders('stock');
    const row = header.map((h) => ({ id: 's1', rev: 1, updated_at: '', deleted: false, wine_id: 'w', location_id: 'L', quantity: 2, position_hint: 'dessus' } as Record<string, unknown>)[h] as never);
    expect(rowToEntity('stock', header, row).position_hint).toBe('milieu-centre');
  });
});
