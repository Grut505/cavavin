import { describe, expect, it } from 'vitest';
import { outflowsOf, todayIso, validateMove, validateOutflow } from '../../src/domain/stock';
import type { Outflow } from '../../src/domain/types';

const NOW = new Date(2026, 10, 2, 10, 0, 0); // 2 nov. 2026, heure locale
const fields = (r: ReturnType<typeof validateOutflow>): string[] => (r.ok ? [] : r.issues.map((i) => i.field));

describe('validateOutflow', () => {
  it('accepte une sortie simple : motif « bue » et date du jour', () => {
    const r = validateOutflow({ quantity: 1, available: 3, date: '', reason: 'drunk' }, NOW);
    expect(r).toEqual({ ok: true, value: { quantity: 1, date: '2026-11-02', reason: 'drunk' } });
  });
  it('accepte une date passée au format jj/mm/aaaa ou ISO, refuse le futur et l’invalide', () => {
    expect(validateOutflow({ quantity: 1, available: 1, date: '24/12/2025', reason: 'gifted' }, NOW)).toMatchObject({ ok: true, value: { date: '2025-12-24' } });
    expect(validateOutflow({ quantity: 1, available: 1, date: '2025-12-24', reason: 'gifted' }, NOW)).toMatchObject({ ok: true });
    expect(fields(validateOutflow({ quantity: 1, available: 1, date: '03/11/2026', reason: 'drunk' }, NOW))).toEqual(['date']);
    expect(fields(validateOutflow({ quantity: 1, available: 1, date: '31/02/2026', reason: 'drunk' }, NOW))).toEqual(['date']);
    expect(validateOutflow({ quantity: 1, available: 1, date: '02/11/2026', reason: 'drunk' }, NOW).ok).toBe(true);
  });
  it('borne la quantité entre 1 et le stock disponible', () => {
    expect(fields(validateOutflow({ quantity: 0, available: 3, date: '', reason: 'drunk' }, NOW))).toEqual(['quantity']);
    expect(fields(validateOutflow({ quantity: 1.5, available: 3, date: '', reason: 'drunk' }, NOW))).toEqual(['quantity']);
    const over = validateOutflow({ quantity: 4, available: 3, date: '', reason: 'drunk' }, NOW);
    expect(over.ok).toBe(false);
    expect(!over.ok && over.issues[0]!.message).toContain('3 bouteilles');
    expect(validateOutflow({ quantity: 3, available: 3, date: '', reason: 'drunk' }, NOW).ok).toBe(true);
  });
  it('refuse un motif inconnu et accepte les quatre motifs', () => {
    expect(fields(validateOutflow({ quantity: 1, available: 1, date: '', reason: 'vendue' }, NOW))).toEqual(['reason']);
    for (const reason of ['drunk', 'gifted', 'broken', 'other']) {
      expect(validateOutflow({ quantity: 1, available: 1, date: '', reason }, NOW).ok).toBe(true);
    }
  });
  it('cumule les erreurs', () => {
    expect(fields(validateOutflow({ quantity: 0, available: 1, date: 'x', reason: '?' }, NOW)).sort()).toEqual(['date', 'quantity', 'reason']);
  });
});

describe('validateMove', () => {
  it('accepte un déplacement partiel vers un autre emplacement', () => {
    expect(validateMove({ quantity: 2, available: 5, fromLocationId: 'A', toLocationId: 'B' })).toEqual({ ok: true, quantity: 2 });
  });
  it('refuse une quantité hors bornes, une destination absente ou identique', () => {
    const bad = (i: Parameters<typeof validateMove>[0]): string[] => {
      const r = validateMove(i);
      return r.ok ? [] : r.issues.map((x) => x.field);
    };
    expect(bad({ quantity: 6, available: 5, fromLocationId: 'A', toLocationId: 'B' })).toEqual(['quantity']);
    expect(bad({ quantity: 0, available: 5, fromLocationId: 'A', toLocationId: 'B' })).toEqual(['quantity']);
    expect(bad({ quantity: 1, available: 5, fromLocationId: 'A', toLocationId: null })).toEqual(['destination']);
    expect(bad({ quantity: 1, available: 5, fromLocationId: 'A', toLocationId: 'A' })).toEqual(['destination']);
  });
});

describe('outflowsOf', () => {
  const o = (id: string, wine_id: string, date: string, over: Partial<Outflow> = {}): Outflow => ({
    id, wine_id, location_id: 'L', reason: 'drunk', date, note: null, rev: 1, updated_at: `2026-01-0${id}`, deleted: false, ...over,
  });
  it('trie du plus récent au plus ancien, filtre par fiche et ignore les supprimées', () => {
    const list = [o('1', 'w1', '2026-01-01'), o('2', 'w2', '2026-03-01'), o('3', 'w1', '2026-02-01'), o('4', 'w1', '2026-04-01', { deleted: true })];
    expect(outflowsOf(list).map((x) => x.id)).toEqual(['2', '3', '1']);
    expect(outflowsOf(list, 'w1').map((x) => x.id)).toEqual(['3', '1']);
  });
  it('départage deux sorties du même jour par date d’enregistrement', () => {
    const list = [o('1', 'w1', '2026-01-01'), o('2', 'w1', '2026-01-01')];
    expect(outflowsOf(list).map((x) => x.id)).toEqual(['2', '1']);
  });
  it('todayIso suit l’heure locale', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
