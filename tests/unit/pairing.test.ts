import { describe, expect, it } from 'vitest';
import { editDistance, dishTokens, pairingVocabulary, searchByDish, wordScore } from '../../src/domain/pairing';
import { joinPairings, parsePairings } from '../../src/domain/pairing-list';
import type { WineRow } from '../../src/domain/query';
import type { Wine } from '../../src/domain/types';
import { parseProposals } from '../../src/scan/proposal';
import { validateWine, emptyDraft, draftFromWine } from '../../src/domain/wine';
import { wineData } from '../contract/helpers';

const Y = 2026;
let n = 0;
const row = (pairings: string | null, over: Partial<Wine> = {}, quantity = 1): WineRow => ({
  wine: { ...wineData({ pairings, drink_from: 2020, drink_until: 2032, ...over }), rev: 1, updated_at: '', deleted: false, id: `w${++n}` },
  quantity,
  locations: [],
});

describe('liste de mets', () => {
  it('accepte virgules, points-virgules, tableaux JSON et retire les doublons', () => {
    expect(parsePairings('magret de canard, Agneau rôti ; fromages\nmagret de canard')).toEqual(['magret de canard', 'Agneau rôti', 'fromages']);
    expect(parsePairings(['  poisson  grillé ', 'Poisson grillé'])).toEqual(['poisson grillé']);
    expect(parsePairings('["magret", "agneau"]')).toEqual(['magret', 'agneau']);
    expect(parsePairings(null)).toEqual([]);
    expect(joinPairings(['a', 'b'])).toBe('a; b');
    expect(joinPairings([])).toBeNull();
    expect(parsePairings(Array.from({ length: 30 }, (_, i) => `plat ${i}`))).toHaveLength(12);
  });

  it('passe par le formulaire, la validation et la proposition', () => {
    const draft = { ...emptyDraft(), domain: 'D', cuvee: 'C', vintage: '2019', appellation: 'A', color: 'rouge', drink_from: '2024', drink_until: '2030', pairings: 'magret, agneau; magret' };
    const res = validateWine(draft);
    expect(res.ok && res.value.pairings).toBe('magret; agneau');
    const w = { ...wineData({ pairings: 'magret; agneau' }), id: 'x', rev: 1, updated_at: '', deleted: false } as Wine;
    expect(draftFromWine(w).pairings).toBe('magret, agneau');
    const { proposals } = parseProposals('{"v":1,"domain":"D","cuvee":"C","pairings":["magret de canard","Agneau rôti"]}');
    expect(proposals[0]!.pairings).toBe('magret de canard; Agneau rôti');
    expect(parseProposals('{"domain":"D","pairings":"a; b"}').proposals[0]!.pairings).toBe('a; b');
    expect(parseProposals('{"domain":"D"}').proposals[0]!.pairings).toBeNull();
  });
});

describe('tolérance aux fautes', () => {
  it('mesure les fautes de frappe (substitution, oubli, inversion)', () => {
    expect(editDistance('magret', 'magret')).toBe(0);
    expect(editDistance('magret', 'magrret')).toBe(1);
    expect(editDistance('magret', 'margret')).toBe(1);
    expect(editDistance('magret', 'magert')).toBe(1); // transposition
    expect(editDistance('canard', 'poulet', 2)).toBeGreaterThan(2);
  });

  it('ignore mots vides, nombres de convives, pluriels, accents et ligatures', () => {
    expect(dishTokens('Un magret de canard pour 4 personnes')).toEqual(['magret', 'canard']);
    expect(dishTokens('Bœuf bourguignon')).toEqual(['boeuf', 'bourguignon']);
    expect(dishTokens('moules frites')).toEqual(['moule', 'frite']);
    expect(wordScore('moule', 'moule')).toBe(3);
    expect(wordScore('mag', 'magret')).toBe(2.5);
    expect(wordScore('magrat', 'magret')).toBe(2);
    expect(wordScore('poulet', 'magret')).toBe(0);
    expect(wordScore('a', 'b')).toBe(0);
  });
});

describe('recherche par plat', () => {
  const rows = [
    row('magret de canard; agneau rôti; fromages à pâte dure', { cuvee: 'A' }),
    row('poisson grillé; fruits de mer; huîtres', { cuvee: 'B', color: 'blanc' }),
    row('bœuf bourguignon; gibier', { cuvee: 'C' }),
    row(null, { cuvee: 'D' }),
    row('magret de canard', { cuvee: 'E', drink_from: 2040, drink_until: 2050 }), // trop tôt
    row('magret de canard', { cuvee: 'F' }, 0), // épuisée
  ];
  const cuvees = (q: string): string[] => searchByDish(rows, q, Y).matches.map((m) => m.row.wine.cuvee);

  it('retrouve malgré fautes de frappe, accents, pluriels et mots parasites', () => {
    expect(cuvees('magret')).toEqual(['A', 'E']);
    expect(cuvees('Magrett de canars')).toEqual(['A', 'E']);
    expect(cuvees('je veux un MAGRET pour 6 personnes')).toEqual(['A', 'E']);
    expect(cuvees('boeuf bourgignon')).toEqual(['C']);
    expect(cuvees('huitre')).toEqual(['B']);
    expect(cuvees('fruit de mer')).toEqual(['B']);
    expect(cuvees('agneau roti')).toEqual(['A']);
  });

  it('accepte une correspondance partielle (au moins la moitié des mots)', () => {
    expect(cuvees('canard laqué')).toEqual(['A', 'E']);
    expect(cuvees('sushi saumon')).toEqual([]);
  });

  it('classe les bouteilles à boire avant les trop jeunes et ignore stock vide et fiches sans mets', () => {
    expect(cuvees('magret')[0]).toBe('A');
    const r = searchByDish(rows, 'magret', Y);
    expect(r.withoutPairings).toBe(1);
    expect(r.matches[0]!.matched).toEqual(['magret de canard']);
    expect(searchByDish(rows, '   ', Y).matches).toEqual([]);
    expect(searchByDish(rows, 'de la le', Y).tokens).toEqual([]);
  });

  it('propose les mets les plus fréquents de la cave', () => {
    const vocab = pairingVocabulary(rows, 3);
    expect(vocab[0]).toEqual({ label: 'magret de canard', bottles: 2 });
    expect(vocab).toHaveLength(3);
  });
});
