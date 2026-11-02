import { describe, expect, it } from 'vitest';
import { buildRows, type WineRow } from '../../src/domain/query';
import { searchRows, tokenize } from '../../src/domain/search';
import type { Furniture, Location, Stock, Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const base = { rev: 1, updated_at: '', deleted: false };
let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...wineData(over), id: `w${++n}`, rev: 1, updated_at: '', deleted: false });
const furniture: Furniture[] = [{ ...base, id: 'F', name: 'Cave du salon', order: 0 }];
const locations: Location[] = [
  { ...base, id: 'S1', kind: 'shelf', furniture_id: 'F', name: 'Étagère 1', order: 0 },
  { ...base, id: 'P1', kind: 'place', furniture_id: null, name: 'Cellier', order: 0 },
];
const wines = [
  wine({ domain: 'Domaine Fabre', cuvee: 'Les Pins', vintage: 2015, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France', color: 'rouge' }),
  wine({ domain: 'Élan', cuvee: 'Brut', vintage: null, appellation: 'Champagne', region: 'Champagne', country: 'France', color: 'effervescent' }),
  wine({ domain: '', cuvee: 'Rouge Edile', vintage: 2021, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France', color: 'rouge', notes: 'offert pour Noël' }),
  wine({ domain: 'Zeta', cuvee: 'Collio', vintage: 2019, appellation: 'Collio', region: 'Frioul', country: 'Italie', color: 'blanc', supplier: 'Caviste Jean' }),
];
const stocks: Stock[] = [
  { ...base, id: 's1', wine_id: wines[0]!.id, location_id: 'S1', quantity: 3, position_hint: null },
  { ...base, id: 's2', wine_id: wines[1]!.id, location_id: 'P1', quantity: 6, position_hint: null },
  { ...base, id: 's3', wine_id: wines[2]!.id, location_id: 'S1', quantity: 1, position_hint: null },
  { ...base, id: 's4', wine_id: wines[3]!.id, location_id: 'S1', quantity: 2, position_hint: null },
];
const rows: WineRow[] = buildRows({ wines, stocks, locations, furniture });
const names = (r: WineRow[]): string[] => r.map((x) => x.wine.domain || x.wine.cuvee);
const q = (query: string): string[] => names(searchRows(rows, query));

describe('recherche', () => {
  it('une requête vide rend toutes les fiches, dans l’ordre reçu', () => {
    expect(searchRows(rows, '   ')).toBe(rows);
    expect(tokenize('  Saint  Joseph ')).toEqual(['saint', 'joseph']);
  });
  it('ignore casse, accents et ponctuation', () => {
    expect(q('ELAN')).toEqual(['Élan']);
    expect(q('saint joseph').sort()).toEqual(['Domaine Fabre', 'Rouge Edile'].sort());
    expect(q('vallee du rhone')).toHaveLength(2);
    expect(q('cote')).toEqual([]);
  });
  it('trouve par domaine, cuvée, appellation, millésime, région, pays, fournisseur et notes', () => {
    expect(q('fabre')).toEqual(['Domaine Fabre']);
    expect(q('brut')).toEqual(['Élan']);
    expect(q('collio')).toEqual(['Zeta']);
    expect(q('2019')).toEqual(['Zeta']);
    expect(q('frioul')).toEqual(['Zeta']);
    expect(q('italie')).toEqual(['Zeta']);
    expect(q('caviste')).toEqual(['Zeta']);
    expect(q('noel')).toEqual(['Rouge Edile']);
  });
  it('trouve par emplacement (étagère, meuble, lieu)', () => {
    expect(q('cellier')).toEqual(['Élan']);
    expect(q('salon').sort()).toEqual(['Domaine Fabre', 'Rouge Edile', 'Zeta'].sort());
    expect(q('etagere 1')).toHaveLength(3);
  });
  it('trouve les non millésimés par « NV » et la couleur par son nom', () => {
    expect(q('nv')).toEqual(['Élan']);
    expect(q('effervescent')).toEqual(['Élan']);
    expect(q('blanc')).toEqual(['Zeta']);
  });
  it('tous les mots doivent correspondre (chacun dans un champ quelconque)', () => {
    expect(q('saint joseph 2015')).toEqual(['Domaine Fabre']);
    expect(q('saint joseph 1999')).toEqual([]);
    expect(q('fabre italie')).toEqual([]);
  });
  it('classe en tête les correspondances les plus pertinentes (domaine avant notes ; début de mot avant fragment)', () => {
    const r = buildRows({
      wines: [
        wine({ domain: 'Autre', cuvee: 'X', notes: 'avec du fabre dedans' }),
        wine({ domain: 'Fabre', cuvee: 'Y' }),
        wine({ domain: 'Les Fabres Réunis', cuvee: 'Z' }),
      ],
      stocks: [],
      locations,
      furniture,
    });
    expect(names(searchRows(r, 'fabre'))).toEqual(['Fabre', 'Les Fabres Réunis', 'Autre']);
  });
  it('un nombre court n’est jamais cherché à l’intérieur d’un millésime', () => {
    // « étagère 1 » ne doit pas retrouver 2015 ou 2021 par leur « 1 » ni « 2 » par un millésime.
    expect(q('etagere 2')).toEqual([]);
    expect(q('etagere 1')).toHaveLength(3);
    expect(q('1')).toEqual(names(rows.filter((r) => r.locations.some((l) => /\b1\b/.test(l.label)))));
    expect(q('20')).toEqual([]); // ni « 20 » dans 2015/2019/2021
  });
  it('un nombre d’au moins trois chiffres peut être un début de millésime', () => {
    expect(q('201').sort()).toEqual(['Domaine Fabre', 'Zeta'].sort()); // 2015, 2019
    expect(q('2021')).toEqual(['Rouge Edile']);
  });
  it('un fragment au milieu d’un mot reste trouvé', () => {
    expect(q('ose')).toEqual(expect.arrayContaining(['Domaine Fabre']));
  });
});
