import { describe, expect, it } from 'vitest';
import { normalizeText, wineKey } from '../../src/domain/normalize';

describe('normalizeText', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalizeText('  Château  Léoville-Barton ')).toBe('chateau leoville barton');
  });
  it('gère null et vide', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText('')).toBe('');
  });
});

describe('wineKey', () => {
  it('est insensible aux accents, à la casse et aux espaces', () => {
    const a = wineKey({ domain: 'Domaine  de la Côte', cuvee: 'Les Éclats', vintage: 2019 });
    const b = wineKey({ domain: 'domaine de la cote', cuvee: 'les eclats', vintage: 2019 });
    expect(a).toBe(b);
  });
  it('distingue les millésimes et le non millésimé', () => {
    const base = { domain: 'X', cuvee: 'Y' };
    expect(wineKey({ ...base, vintage: 2019 })).not.toBe(wineKey({ ...base, vintage: 2020 }));
    expect(wineKey({ ...base, vintage: null })).toBe('x|y|nv');
  });
});
