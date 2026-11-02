import { describe, expect, it } from 'vitest';
import {
  SEED_COUNTRIES,
  buildVocabulary,
  canonicalize,
  editDistance,
  relatedFor,
  type VocabEntry,
} from '../../src/domain/vocabulary';
import type { Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

let n = 0;
const wine = (over: Partial<Wine> = {}): Wine => ({
  ...wineData(over),
  id: `w${++n}`,
  rev: 1,
  updated_at: '',
  deleted: over.deleted ?? false,
});

const entries = (values: string[]): VocabEntry[] => buildVocabulary(values.map((a) => wine({ appellation: a }))).appellation;

describe('vocabulaire', () => {
  it('liste les valeurs de la cave, les plus utilisées d’abord, sans doublon de graphie', () => {
    const v = buildVocabulary([
      wine({ appellation: 'Saint-Joseph' }),
      wine({ appellation: 'saint joseph' }),
      wine({ appellation: 'Saint-Joseph' }),
      wine({ appellation: 'Pauillac' }),
      wine({ appellation: null }),
      wine({ appellation: 'Supprimée', deleted: true }),
    ]);
    expect(v.appellation.map((e) => [e.value, e.count])).toEqual([
      ['Saint-Joseph', 3],
      ['Pauillac', 1],
    ]);
  });

  it('retient la graphie la plus fréquente d’une même valeur', () => {
    const v = entries(['Côte-Rôtie', 'Cote Rotie', 'Côte-Rôtie', 'cote rotie']);
    expect(v).toHaveLength(1);
    expect(v[0]!.value).toBe('Côte-Rôtie');
  });

  it('propose des pays et régions de départ, sans écraser la graphie de la cave', () => {
    const v = buildVocabulary([wine({ country: 'france', region: 'Vallée du Rhône' })]);
    expect(v.country.map((e) => e.value)).toContain('Italie');
    expect(v.country.filter((e) => e.key === 'france')).toHaveLength(1);
    expect(v.country.find((e) => e.key === 'france')!.value).toBe('france'); // la cave prime sur le jeu de départ
    expect(v.country.length).toBe(SEED_COUNTRIES.length);
    expect(v.region.map((e) => e.value)).toContain('Bourgogne');
  });

  it('liste les millésimes présents, du plus récent au plus ancien', () => {
    const v = buildVocabulary([wine({ vintage: 2015 }), wine({ vintage: 2021 }), wine({ vintage: null }), wine({ vintage: 2015 })]);
    expect(v.vintages).toEqual([2021, 2015]);
  });

  it('associe à une appellation la région et le pays les plus souvent utilisés', () => {
    const v = buildVocabulary([
      wine({ appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' }),
      wine({ appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' }),
      wine({ appellation: 'Saint-Joseph', region: 'Rhône', country: 'France' }),
      wine({ appellation: 'Pauillac', region: null, country: null }),
    ]);
    expect(relatedFor(v, 'saint joseph')).toEqual({ region: 'Vallée du Rhône', country: 'France' });
    expect(relatedFor(v, 'Pauillac')).toEqual({ region: null, country: null });
    expect(relatedFor(v, 'Inconnue')).toBeUndefined();
  });
});

describe('editDistance', () => {
  it('compte insertions, suppressions et substitutions', () => {
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('saintjoseph', 'saintjosef')).toBe(2);
    expect(editDistance('pauillac', 'pauiliac')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('canonicalize : éviter les entrées presque identiques', () => {
  const e = entries(['Saint-Joseph', 'Pauillac', 'Côte-Rôtie', 'Vouvray']);

  it('vide', () => {
    expect(canonicalize(e, '   ')).toEqual({ kind: 'empty' });
  });
  it('reprend la graphie existante pour une variante de casse, d’accents ou de tiret', () => {
    expect(canonicalize(e, 'saint joseph')).toEqual({ kind: 'same', value: 'Saint-Joseph', changed: true });
    expect(canonicalize(e, 'COTE ROTIE')).toEqual({ kind: 'same', value: 'Côte-Rôtie', changed: true });
    expect(canonicalize(e, 'Pauillac')).toEqual({ kind: 'same', value: 'Pauillac', changed: false });
    expect(canonicalize(e, '  pauillac  ')).toEqual({ kind: 'same', value: 'Pauillac', changed: true });
  });
  it('signale une faute de frappe probable à faire confirmer', () => {
    expect(canonicalize(e, 'Pauiliac')).toEqual({ kind: 'close', typed: 'Pauiliac', suggestion: 'Pauillac' });
    expect(canonicalize(e, 'Saint-Josef')).toEqual({ kind: 'close', typed: 'Saint-Josef', suggestion: 'Saint-Joseph' });
    expect(canonicalize(e, 'Vouvrai')).toMatchObject({ kind: 'close', suggestion: 'Vouvray' });
  });
  it('accepte une valeur nouvelle et suffisamment différente', () => {
    expect(canonicalize(e, 'Chablis')).toEqual({ kind: 'new', value: 'Chablis' });
    expect(canonicalize(e, 'Saint-Émilion')).toEqual({ kind: 'new', value: 'Saint-Émilion' });
  });
  it('ne confond pas des mots courts différents', () => {
    const short = entries(['Jura', 'Gard']);
    expect(canonicalize(short, 'Jure')).toEqual({ kind: 'new', value: 'Jure' });
    expect(canonicalize(short, 'Gers')).toEqual({ kind: 'new', value: 'Gers' });
  });
  it('choisit la valeur la plus proche, puis la plus utilisée', () => {
    const ee = entries(['Margaux', 'Margaux', 'Margeaux']);
    expect(canonicalize(ee, 'Margau')).toMatchObject({ kind: 'close', suggestion: 'Margaux' });
  });
});
