import { describe, expect, it } from 'vitest';
import { findDuplicate } from '../../src/domain/duplicates';
import type { Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const wine = (id: string, over: Partial<Wine> = {}): Wine => ({
  ...wineData(over),
  id,
  rev: 1,
  updated_at: '',
  deleted: over.deleted ?? false,
});

describe('findDuplicate', () => {
  const wines = [
    wine('a', { domain: 'Domaine de la Côte', cuvee: 'Les Éclats', vintage: 2019 }),
    wine('b', { domain: 'Château Z', cuvee: '—', vintage: null }),
    wine('c', { domain: 'Supprimé', cuvee: 'X', vintage: 2000, deleted: true }),
  ];

  it('trouve une correspondance exacte insensible aux accents et à la casse', () => {
    const d = findDuplicate(wines, { domain: 'domaine de la cote', cuvee: 'les eclats', vintage: 2019 });
    expect(d?.wine.id).toBe('a');
    expect(d?.match).toBe('exact');
  });

  it('distingue les millésimes', () => {
    expect(findDuplicate(wines, { domain: 'Domaine de la Côte', cuvee: 'Les Éclats', vintage: 2020 })).toBeUndefined();
  });

  it('traite le non millésimé et la cuvée vide comme une clé à part entière', () => {
    expect(findDuplicate(wines, { domain: 'Château Z', cuvee: '', vintage: null })?.wine.id).toBe('b');
  });

  it('signale un doublon probable quand une seule des deux cuvées est vide', () => {
    const d = findDuplicate(wines, { domain: 'Château Z', cuvee: 'Grand Vin', vintage: null });
    expect(d?.wine.id).toBe('b');
    expect(d?.match).toBe('probable');
  });

  it('ignore les fiches supprimées', () => {
    expect(findDuplicate(wines, { domain: 'Supprimé', cuvee: 'X', vintage: 2000 })).toBeUndefined();
  });
});
