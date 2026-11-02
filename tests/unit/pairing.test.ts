import { describe, expect, it } from 'vitest';
import { editDistance, dishTokens, pairingVocabulary, searchByDish, wordScore } from '../../src/domain/pairing';
import { isVegetarian, joinPairings, parsePairings, splitVegetarian } from '../../src/domain/pairing-list';
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
    expect(parsePairings('risotto aux champignons, Gratin dauphinois ; fromages\nrisotto aux champignons')).toEqual(['risotto aux champignons', 'Gratin dauphinois', 'fromages']);
    expect(parsePairings(['  tarte  aux poireaux ', 'Tarte aux poireaux'])).toEqual(['tarte aux poireaux']);
    expect(parsePairings('["risotto", "curry"]')).toEqual(['risotto', 'curry']);
    expect(parsePairings(null)).toEqual([]);
    expect(joinPairings(['a', 'b'])).toBe('a; b');
    expect(joinPairings([])).toBeNull();
    expect(parsePairings(Array.from({ length: 30 }, (_, i) => `plat ${i}`))).toHaveLength(12);
  });

  it('passe par le formulaire, la validation et la proposition', () => {
    const draft = { ...emptyDraft(), domain: 'D', cuvee: 'C', vintage: '2019', appellation: 'A', color: 'rouge', drink_from: '2024', drink_until: '2030', pairings: 'risotto, curry; risotto' };
    const res = validateWine(draft);
    expect(res.ok && res.value.pairings).toBe('risotto; curry');
    const w = { ...wineData({ pairings: 'risotto; curry' }), id: 'x', rev: 1, updated_at: '', deleted: false } as Wine;
    expect(draftFromWine(w).pairings).toBe('risotto, curry');
    const { proposals } = parseProposals('{"v":1,"domain":"D","cuvee":"C","pairings":["risotto aux champignons","Gratin dauphinois"]}');
    expect(proposals[0]!.pairings).toBe('risotto aux champignons; Gratin dauphinois');
    expect(parseProposals('{"domain":"D","pairings":"a; b"}').proposals[0]!.pairings).toBe('a; b');
    expect(parseProposals('{"domain":"D"}').proposals[0]!.pairings).toBeNull();
  });
});

describe('mode végétarien', () => {
  it('reconnaît viande, charcuterie, poisson et fruits de mer, accepte œufs, laitages et fromages', () => {
    for (const ok of ['risotto aux champignons', 'fromages à pâte dure', 'pâtes au pesto', 'pizza margherita', 'œufs cocotte', 'fromage de chèvre', 'ratatouille', 'artichauts', 'soleil de légumes', 'curry de légumes'])
      expect(isVegetarian(ok), ok).toBe(true);
    for (const ko of ['magret de canard', 'Bœuf bourguignon', 'moules frites', 'tarte au lard', 'salade au thon', 'boudin noir', 'huîtres', 'fruits de mer', 'pot-au-feu', 'Saint-Jacques', 'agneau rôti', 'charcuterie', 'poisson grillé', 'jambon cru'])
      expect(isVegetarian(ko), ko).toBe(false);
    expect(splitVegetarian(['curry', 'poulet rôti'])).toEqual({ kept: ['curry'], dropped: ['poulet rôti'] });
  });

  it('écarte les mets non végétariens d’une proposition, avec avertissement', () => {
    const r = parseProposals('{"domain":"D","pairings":["magret de canard","curry de légumes","Poisson grillé","fromages à pâte dure","Huîtres"]}');
    expect(r.proposals[0]!.pairings).toBe('curry de légumes; fromages à pâte dure');
    expect(r.warnings.join(' ')).toContain('mets non végétariens retirés : magret de canard, Poisson grillé, Huîtres');
  });

  it('refuse un met non végétarien saisi dans le formulaire', () => {
    const draft = { ...emptyDraft(), domain: 'D', cuvee: 'C', vintage: '2019', appellation: 'A', color: 'rouge', drink_from: '2024', drink_until: '2030', pairings: 'curry, gigot d’agneau' };
    const res = validateWine(draft);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.issues.find((i) => i.field === 'pairings')?.message).toContain('mode végétarien');
  });
});

describe('tolérance aux fautes', () => {
  it('mesure les fautes de frappe (substitution, oubli, inversion)', () => {
    expect(editDistance('risotto', 'risotto')).toBe(0);
    expect(editDistance('risotto', 'risoto')).toBe(1);
    expect(editDistance('risotto', 'risotta')).toBe(1);
    expect(editDistance('risotto', 'risotot')).toBe(1); // transposition
    expect(editDistance('curry', 'gratin', 2)).toBeGreaterThan(2);
  });

  it('ignore mots vides, nombres de convives, pluriels, accents et ligatures', () => {
    expect(dishTokens('Un risotto aux champignons pour 4 personnes')).toEqual(['risotto', 'champignon']);
    expect(dishTokens('Gratin d’œufs')).toEqual(['gratin', 'oeuf']);
    expect(wordScore('poireau', 'poireau')).toBe(3);
    expect(wordScore('ris', 'risotto')).toBe(2.5);
    expect(wordScore('risoto', 'risotto')).toBe(2);
    expect(wordScore('curry', 'risotto')).toBe(0);
    expect(wordScore('a', 'b')).toBe(0);
  });
});

describe('recherche par plat', () => {
  const rows = [
    row('risotto aux champignons; gratin dauphinois; fromages à pâte dure', { cuvee: 'A' }),
    row('salade de chèvre chaud; tarte aux poireaux; quiche aux épinards', { cuvee: 'B', color: 'blanc' }),
    row('curry de légumes; ratatouille; tajine de légumes', { cuvee: 'C' }),
    row(null, { cuvee: 'D' }),
    row('risotto aux champignons', { cuvee: 'E', drink_from: 2040, drink_until: 2050 }), // trop tôt
    row('risotto aux champignons', { cuvee: 'F' }, 0), // épuisée
  ];
  const cuvees = (q: string): string[] => searchByDish(rows, q, Y).matches.map((m) => m.row.wine.cuvee);

  it('retrouve malgré fautes de frappe, accents, pluriels et mots parasites', () => {
    expect(cuvees('risotto')).toEqual(['A', 'E']);
    expect(cuvees('Un risoto aux champignon pour 4 personnes')).toEqual(['A', 'E']);
    expect(cuvees('je veux un RISOTTO pour 6 personnes')).toEqual(['A', 'E']);
    expect(cuvees('ratatouile')).toEqual(['C']);
    expect(cuvees('epinard')).toEqual(['B']);
    expect(cuvees('tarte poireaux')).toEqual(['B']);
    expect(cuvees('curry legume')).toEqual(['C']);
    expect(cuvees('gratin daufinois')).toEqual(['A']);
  });

  it('accepte une correspondance partielle (au moins la moitié des mots)', () => {
    expect(cuvees('risotto truffe')).toEqual(['A', 'E']);
    expect(cuvees('sushi tempura')).toEqual([]);
  });

  it('classe les bouteilles à boire avant les trop jeunes et ignore stock vide et fiches sans mets', () => {
    expect(cuvees('risotto')[0]).toBe('A');
    const r = searchByDish(rows, 'risotto', Y);
    expect(r.withoutPairings).toBe(1);
    expect(r.matches[0]!.matched).toEqual(['risotto aux champignons']);
    expect(searchByDish(rows, '   ', Y).matches).toEqual([]);
    expect(searchByDish(rows, 'de la le', Y).tokens).toEqual([]);
  });

  it('propose les mets les plus fréquents de la cave', () => {
    const vocab = pairingVocabulary(rows, 3);
    expect(vocab[0]).toEqual({ label: 'risotto aux champignons', bottles: 2 });
    expect(vocab).toHaveLength(3);
  });
});
