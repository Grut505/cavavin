import { describe, expect, it } from 'vitest';
import { PersonRuleError, assertPersonName, nextPersonOrder, sortPersons } from '../../src/domain/people';
import type { Person } from '../../src/domain/types';

const p = (id: string, name: string, over: Partial<Person> = {}): Person => ({
  id,
  name,
  order: 0,
  rev: 1,
  updated_at: '',
  deleted: false,
  ...over,
});
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof PersonRuleError ? e.code : 'autre';
  }
  return undefined;
};

describe('liste de personnes', () => {
  it('nettoie le nom et refuse le vide', () => {
    expect(assertPersonName('  Marie   Dupont ', [])).toBe('Marie Dupont');
    expect(code(() => assertPersonName('   ', []))).toBe('empty_name');
  });
  it('refuse un doublon (accents et casse ignorés) mais pas son propre nom au renommage', () => {
    const list = [p('1', 'Hélène')];
    expect(code(() => assertPersonName('helene', list))).toBe('duplicate');
    expect(assertPersonName('Hélène', list, '1')).toBe('Hélène');
  });
  it('ignore les personnes supprimées pour l’unicité', () => {
    expect(assertPersonName('Paul', [p('1', 'Paul', { deleted: true })])).toBe('Paul');
  });
  it('trie par nom sans les supprimées, et numérote à la suite', () => {
    const list = [p('1', 'Zoé', { order: 3 }), p('2', 'Émile', { order: 1 }), p('3', 'Alice', { deleted: true, order: 9 })];
    expect(sortPersons(list).map((x) => x.name)).toEqual(['Émile', 'Zoé']);
    expect(nextPersonOrder(list)).toBe(4);
    expect(nextPersonOrder([])).toBe(0);
  });
});
