import { describe, expect, it } from 'vitest';
import {
  LocationRuleError,
  UNASSIGNED_NAME,
  assertFurnitureName,
  assertPlaceName,
  assertShelfName,
  bottleCount,
  bottleCounts,
  nextShelfName,
  planFurniture,
  requireDecision,
  validateMoveTarget,
} from '../../src/domain/locations';
import type { Furniture, Location, Stock } from '../../src/domain/types';

const base = { rev: 1, updated_at: '', deleted: false };
const furn = (id: string, name: string): Furniture => ({ ...base, id, name, order: 0 });
const loc = (id: string, name: string, over: Partial<Location> = {}): Location => ({
  ...base,
  id,
  kind: 'shelf',
  furniture_id: 'f1',
  name,
  order: 0,
  ...over,
});
const stock = (id: string, location_id: string, quantity: number, over: Partial<Stock> = {}): Stock => ({
  ...base,
  id,
  wine_id: 'w' + id,
  location_id,
  quantity,
  position_hint: null,
  ...over,
});

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof LocationRuleError ? e.code : 'autre';
  }
  return undefined;
};

describe('noms uniques', () => {
  it('refuse un nom vide', () => {
    expect(code(() => assertFurnitureName('   ', []))).toBe('empty_name');
  });
  it('refuse un nom de meuble déjà pris (insensible à la casse et aux accents)', () => {
    expect(code(() => assertFurnitureName('cave à gauche', [furn('1', 'Cave  à Gauche')]))).toBe('duplicate');
    expect(assertFurnitureName('  Cave  droite ', [furn('1', 'Cave à gauche')])).toBe('Cave droite');
  });
  it('autorise de conserver son propre nom lors d’un renommage', () => {
    expect(assertFurnitureName('Cave', [furn('1', 'Cave')], '1')).toBe('Cave');
  });
  it('les étagères sont uniques dans leur meuble, les lieux entre eux', () => {
    expect(code(() => assertShelfName('Étagère 1', [loc('a', 'Etagere 1')]))).toBe('duplicate');
    const places = [loc('p', 'Cellier', { kind: 'place', furniture_id: null })];
    expect(code(() => assertPlaceName('cellier', places))).toBe('duplicate');
    expect(assertPlaceName('Garage', places)).toBe('Garage');
  });
});

describe('création de meuble', () => {
  it('crée N étagères numérotées de haut en bas', () => {
    const plan = planFurniture('Meuble A', 3, []);
    expect(plan.shelves.map((s) => s.name)).toEqual(['Étagère 1', 'Étagère 2', 'Étagère 3']);
    expect(plan.shelves.map((s) => s.order)).toEqual([0, 1, 2]);
  });
  it('place le nouveau meuble après les existants', () => {
    const plan = planFurniture('B', 1, [{ ...furn('1', 'A'), order: 4 }]);
    expect(plan.furniture.order).toBe(5);
  });
  it('refuse un nombre d’étagères invalide', () => {
    expect(code(() => planFurniture('A', 0, []))).toBe('invalid_count');
    expect(code(() => planFurniture('A', 31, []))).toBe('invalid_count');
    expect(code(() => planFurniture('A', 2.5, []))).toBe('invalid_count');
  });
  it('propose le prochain nom d’étagère sans doublon', () => {
    expect(nextShelfName([])).toBe('Étagère 1');
    expect(nextShelfName([loc('a', 'Étagère 1'), loc('b', 'Étagère 3')])).toBe('Étagère 4');
    expect(nextShelfName([loc('a', 'Haut'), loc('b', 'Bas')])).toBe('Étagère 3');
  });
});

describe('comptage et suppression', () => {
  const stocks = [stock('1', 'L1', 3), stock('2', 'L1', 2), stock('3', 'L2', 5, { deleted: true }), stock('4', 'L3', 0)];
  it('compte les bouteilles actives par emplacement', () => {
    expect(bottleCount(stocks, 'L1')).toBe(5);
    expect(bottleCount(stocks, 'L2')).toBe(0);
    expect(bottleCounts(stocks).get('L1')).toBe(5);
    expect(bottleCounts(stocks).has('L3')).toBe(false);
  });
  it('refuse la suppression d’un emplacement non vide sans décision', () => {
    expect(code(() => requireDecision(5, undefined))).toBe('not_empty');
    expect(code(() => requireDecision(0, undefined))).toBeUndefined();
    expect(code(() => requireDecision(5, { action: 'unassigned' }))).toBeUndefined();
  });
  it('valide la destination d’un déplacement', () => {
    const locations = [loc('A', 'A'), loc('B', 'B'), loc('Z', 'Z', { deleted: true })];
    const removed = new Set(['A']);
    expect(code(() => validateMoveTarget({ action: 'move', toLocationId: 'B' }, removed, locations))).toBeUndefined();
    expect(code(() => validateMoveTarget({ action: 'move', toLocationId: 'A' }, removed, locations))).toBe('bad_target');
    expect(code(() => validateMoveTarget({ action: 'move', toLocationId: 'Z' }, removed, locations))).toBe('bad_target');
    expect(code(() => validateMoveTarget({ action: 'move', toLocationId: 'nope' }, removed, locations))).toBe('bad_target');
    expect(UNASSIGNED_NAME).toBe('Sans emplacement');
  });
});
