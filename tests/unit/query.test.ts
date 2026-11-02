import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  buildRows,
  emptyFilters,
  facetsOf,
  queryRows,
  totalBottles,
  type Filters,
  type SortSpec,
} from '../../src/domain/query';
import type { Furniture, Location, Stock, Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const base = { rev: 1, updated_at: '', deleted: false };
let n = 0;
const wine = (over: Partial<Wine> = {}): Wine => ({
  ...wineData(over),
  id: `w${++n}`,
  rev: 1,
  updated_at: '',
  deleted: over.deleted ?? false,
});
const stock = (wine_id: string, location_id: string, quantity: number, deleted = false): Stock => ({
  ...base,
  id: `s${++n}`,
  wine_id,
  location_id,
  quantity,
  position_hint: null,
  deleted,
});
const furn = (id: string, name: string, order: number): Furniture => ({ ...base, id, name, order });
const loc = (id: string, name: string, order: number, over: Partial<Location> = {}): Location => ({
  ...base,
  id,
  kind: 'shelf',
  furniture_id: 'F1',
  name,
  order,
  ...over,
});

// --- jeu de données ---
const furniture = [furn('F1', 'Meuble A', 0), furn('F2', 'Meuble B', 1)];
const locations = [
  loc('A1', 'Étagère 1', 0),
  loc('A2', 'Étagère 2', 1),
  loc('B1', 'Étagère 1', 0, { furniture_id: 'F2' }),
  loc('P1', 'Cellier', 0, { kind: 'place', furniture_id: null }),
];
const wines = [
  wine({ domain: 'Fabre', cuvee: 'Les Pins', vintage: 2015, color: 'rouge', country: 'France', region: 'Rhône', appellation: 'Saint-Joseph', created_at: '2026-01-03T00:00:00Z' }),
  wine({ domain: 'Élan', cuvee: 'Brut', vintage: null, color: 'effervescent', country: 'France', region: 'Champagne', appellation: null, created_at: '2026-01-01T00:00:00Z' }),
  wine({ domain: 'Zeta', cuvee: 'Blanc', vintage: 2021, color: 'blanc', country: 'Italie', region: 'Frioul', appellation: 'Collio', created_at: '2026-01-02T00:00:00Z' }),
  wine({ domain: 'Alba', cuvee: 'Vieux', vintage: 2010, color: 'rouge', country: 'France', region: 'Bordeaux', appellation: 'Pauillac', created_at: '2026-01-04T00:00:00Z' }),
  wine({ domain: 'Épuisé', cuvee: 'X', vintage: 2012, color: 'rouge', country: 'France', region: 'Rhône', created_at: '2026-01-05T00:00:00Z' }),
  wine({ domain: 'Supprimé', cuvee: 'Y', vintage: 2000, deleted: true }),
];
const [fabre, elan, zeta, alba, epuise] = wines as [Wine, Wine, Wine, Wine, Wine, Wine];
const stocks = [
  stock(fabre.id, 'A1', 3),
  stock(fabre.id, 'B1', 2),
  stock(elan.id, 'P1', 6),
  stock(zeta.id, 'A2', 1),
  stock(alba.id, 'B1', 12),
  stock(alba.id, 'A1', 4, true), // supprimé : ignoré
  stock(epuise.id, 'A1', 0), // à zéro : historique
];

const rows = buildRows({ wines, stocks, locations, furniture });
const asc = (key: SortSpec['key']): SortSpec => ({ key, dir: 'asc' });
const desc = (key: SortSpec['key']): SortSpec => ({ key, dir: 'desc' });
const names = (r: ReturnType<typeof queryRows>): string[] => r.map((x) => x.wine.domain);
const f = (over: Partial<Filters> = {}): Filters => ({ ...emptyFilters(), ...over });

describe('buildRows', () => {
  it('cumule les quantités actives et ignore stocks supprimés ou à zéro et fiches supprimées', () => {
    expect(rows).toHaveLength(5);
    const byDomain = Object.fromEntries(rows.map((r) => [r.wine.domain, r.quantity]));
    expect(byDomain).toEqual({ Fabre: 5, Élan: 6, Zeta: 1, Alba: 12, Épuisé: 0 });
  });
  it('libellés d’emplacement lisibles, triés par meuble puis étagère', () => {
    const fab = rows.find((r) => r.wine.id === fabre.id)!;
    expect(fab.locations.map((l) => l.label)).toEqual(['Meuble A · Étagère 1', 'Meuble B · Étagère 1']);
    expect(rows.find((r) => r.wine.id === elan.id)!.locations[0]!.label).toBe('Cellier');
  });
  it('totalBottles somme les quantités', () => {
    expect(totalBottles(rows)).toBe(24);
  });
});

describe('tri', () => {
  const q = (s: SortSpec): string[] => names(queryRows(rows, f({ includeHistory: true }), s));

  it('domaine : alphabétique sans tenir compte des accents ni de la casse', () => {
    expect(q(asc('domain'))).toEqual(['Alba', 'Élan', 'Épuisé', 'Fabre', 'Zeta']);
    expect(q(desc('domain'))).toEqual(['Zeta', 'Fabre', 'Épuisé', 'Élan', 'Alba']);
  });
  it('millésime : non millésimés toujours en dernier', () => {
    expect(q(asc('vintage'))).toEqual(['Alba', 'Épuisé', 'Fabre', 'Zeta', 'Élan']);
    expect(q(desc('vintage'))).toEqual(['Zeta', 'Fabre', 'Épuisé', 'Alba', 'Élan']);
  });
  it('appellation : absentes en dernier dans les deux sens', () => {
    const a = q(asc('appellation'));
    expect(a.slice(0, 3)).toEqual(['Zeta', 'Alba', 'Fabre']); // Collio, Pauillac, Saint-Joseph
    expect(a.slice(3)).toEqual(['Élan', 'Épuisé']); // sans appellation : départagés par domaine
    const d = q(desc('appellation'));
    expect(d.slice(0, 3)).toEqual(['Fabre', 'Alba', 'Zeta']);
    expect(d.slice(3)).toEqual(['Élan', 'Épuisé']);
  });
  it('emplacement : par meuble puis étagère, lieux après, sans emplacement en dernier', () => {
    const a = q(asc('location'));
    expect(a.slice(0, 4)).toEqual(['Fabre', 'Zeta', 'Alba', 'Élan']);
    expect(a[4]).toBe('Épuisé');
  });
  it('date d’ajout', () => {
    expect(q(asc('added'))).toEqual(['Élan', 'Zeta', 'Fabre', 'Alba', 'Épuisé']);
    expect(q(desc('added'))[0]).toBe('Épuisé');
  });
  it('quantité', () => {
    expect(q(asc('quantity'))).toEqual(['Épuisé', 'Zeta', 'Fabre', 'Élan', 'Alba']);
    expect(q(desc('quantity'))[0]).toBe('Alba');
  });
  it('départage les égalités de façon stable (domaine, cuvée, millésime)', () => {
    const twins = [
      wine({ domain: 'Same', cuvee: 'B', vintage: 2020, color: 'rouge' }),
      wine({ domain: 'Same', cuvee: 'A', vintage: 2021, color: 'rouge' }),
      wine({ domain: 'Same', cuvee: 'A', vintage: 2019, color: 'rouge' }),
    ];
    const st = twins.map((w) => stock(w.id, 'A1', 1));
    const r = buildRows({ wines: twins, stocks: st, locations, furniture });
    const out = queryRows(r, emptyFilters(), asc('quantity')).map((x) => `${x.wine.cuvee}${x.wine.vintage}`);
    expect(out).toEqual(['A2019', 'A2021', 'B2020']);
  });
});

describe('filtres', () => {
  const q = (filters: Partial<Filters>): string[] => names(queryRows(rows, f(filters), asc('domain')));

  it('par défaut : uniquement les fiches en stock', () => {
    expect(q({})).toEqual(['Alba', 'Élan', 'Fabre', 'Zeta']);
  });
  it('« inclure l’historique » ajoute les fiches à zéro', () => {
    expect(q({ includeHistory: true })).toContain('Épuisé');
  });
  it('couleur (plusieurs valeurs = « ou »)', () => {
    expect(q({ colors: ['rouge'] })).toEqual(['Alba', 'Fabre']);
    expect(q({ colors: ['rouge', 'blanc'] })).toEqual(['Alba', 'Fabre', 'Zeta']);
  });
  it('pays et région, insensibles aux accents/casse', () => {
    expect(q({ countries: ['italie'] })).toEqual(['Zeta']);
    expect(q({ regions: ['rhone'] })).toEqual(['Fabre']);
    expect(q({ countries: ['France'], regions: ['Bordeaux', 'Champagne'] })).toEqual(['Alba', 'Élan']);
  });
  it('plage de millésimes (les non millésimés en sont exclus)', () => {
    expect(q({ vintageMin: 2012, vintageMax: 2020 })).toEqual(['Fabre']);
    expect(q({ vintageMin: 2015 })).toEqual(['Fabre', 'Zeta']);
    expect(q({ vintageMax: 2010 })).toEqual(['Alba']);
  });
  it('quantité totale minimale et maximale', () => {
    expect(q({ qtyMin: 5 })).toEqual(['Alba', 'Élan', 'Fabre']);
    expect(q({ qtyMax: 5 })).toEqual(['Fabre', 'Zeta']);
    expect(q({ qtyMin: 2, qtyMax: 6 })).toEqual(['Élan', 'Fabre']);
  });
  it('emplacement : au moins un stock actif sur l’un des emplacements choisis', () => {
    expect(q({ locationIds: ['B1'] })).toEqual(['Alba', 'Fabre']);
    expect(q({ locationIds: ['A1'] })).toEqual(['Fabre']); // Alba y a un stock supprimé
    expect(q({ locationIds: ['P1', 'A2'] })).toEqual(['Élan', 'Zeta']);
  });
  it('filtres combinés (« et » entre critères)', () => {
    expect(q({ colors: ['rouge'], locationIds: ['B1'], qtyMin: 10 })).toEqual(['Alba']);
    expect(q({ colors: ['blanc'], qtyMin: 10 })).toEqual([]);
  });
  it('réinitialiser les filtres rend la liste complète en stock', () => {
    const filtered = q({ colors: ['rouge'], qtyMin: 10 });
    expect(filtered).toEqual(['Alba']);
    expect(q({})).toHaveLength(4);
  });
  it('compte les critères actifs', () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(activeFilterCount(f({ colors: ['rouge'], vintageMin: 2010, vintageMax: 2020, qtyMin: 1, includeHistory: true }))).toBe(4);
  });
});

describe('facettes', () => {
  it('liste les valeurs présentes pour construire les filtres', () => {
    const fc = facetsOf(rows);
    expect(fc.colors).toEqual(['rouge', 'blanc', 'effervescent']);
    expect(fc.countries).toEqual(['France', 'Italie']);
    expect(fc.regions).toEqual(['Bordeaux', 'Champagne', 'Frioul', 'Rhône']);
    expect(fc.vintageMin).toBe(2010);
    expect(fc.vintageMax).toBe(2021);
  });
});
