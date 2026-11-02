import { describe, expect, it } from 'vitest';
import { giftsOf } from '../../src/domain/gifts';
import { classify, colorCounts, maturityGroups, windowText } from '../../src/domain/maturity';
import { activeFilterCount, buildRows, emptyFilters, queryRows, type WineRow } from '../../src/domain/query';
import { cellarValue, consumption, distribution, NOT_SET, overview, topSlices } from '../../src/domain/stats';
import type { Outflow, Wine } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const base = { rev: 1, updated_at: '', deleted: false };
let n = 0;
const wine = (over: Partial<Wine> = {}): Wine => ({ ...wineData(over), ...base, id: `w${++n}` });
const row = (w: Wine, quantity = 1): WineRow => ({ wine: w, quantity, locations: [{ id: 'L', label: 'Meuble · Étagère 1', order: 1 }] });
const Y = 2026;

describe('maturité', () => {
  it('classe selon la fenêtre de garde et l’année', () => {
    const c = (from: number | null, until: number | null) => classify({ drink_from: from, drink_until: until }, Y);
    expect(c(2015, 2020).category).toBe('late');
    expect(c(2024, 2030)).toEqual({ category: 'now', finishing: false });
    expect(c(2024, 2027)).toEqual({ category: 'now', finishing: true });
    expect(c(2024, 2026).finishing).toBe(true);
    expect(c(2027, 2035).category).toBe('soon');
    expect(c(2030, 2040).category).toBe('early');
    expect(c(null, null).category).toBe('unknown');
    expect(c(2030, 2020).category).toBe('unknown');
    expect(c(2024, null).category).toBe('now');
    expect(c(null, 2020).category).toBe('late');
  });

  it('regroupe en 5 groupes, urgentes d’abord, chaque fiche en stock une seule fois', () => {
    const rows = [
      row(wine({ drink_from: 2024, drink_until: 2030 }), 2),
      row(wine({ drink_from: 2024, drink_until: 2026 }), 1),
      row(wine({ drink_from: 2010, drink_until: 2020 }), 3),
      row(wine({ drink_from: null, drink_until: null }), 1),
      row(wine({ drink_from: 2024, drink_until: 2030 }), 0), // épuisée : ignorée
    ];
    const groups = maturityGroups(rows, Y);
    expect(groups.map((g) => g.category)).toEqual(['late', 'now', 'soon', 'early', 'unknown']);
    expect(groups.reduce((s, g) => s + g.entries.length, 0)).toBe(4);
    expect(groups[1]!.entries[0]!.info.finishing).toBe(true); // « à finir » avant les autres
    expect(groups[0]!.bottles).toBe(3);
  });

  it('filtre par couleur et trie selon le critère choisi', () => {
    const rows = [
      row(wine({ domain: 'Zed', vintage: 2015, color: 'rouge', drink_from: 2020, drink_until: 2040 })),
      row(wine({ domain: 'Alpha', vintage: null, color: 'blanc', drink_from: 2020, drink_until: 2028 })),
      row(wine({ domain: 'Mike', vintage: 2010, color: 'rouge', drink_from: 2020, drink_until: 2027 }), 3),
    ];
    const names = (sort?: 'urgency' | 'domain' | 'vintage' | 'location', color?: 'rouge' | 'blanc'): string[] =>
      maturityGroups(rows, Y, { sort, color })[1]!.entries.map((e) => e.row.wine.domain);
    expect(names('urgency')).toEqual(['Mike', 'Alpha', 'Zed']); // « à finir » (2027) puis fin de garde
    expect(names('domain')).toEqual(['Alpha', 'Mike', 'Zed']);
    expect(names('vintage')).toEqual(['Mike', 'Zed', 'Alpha']); // non millésimé en dernier
    expect(names('domain', 'rouge')).toEqual(['Mike', 'Zed']);
    expect(maturityGroups(rows, Y, { color: 'blanc' })[1]!.bottles).toBe(1);
    expect(colorCounts(rows, Y)).toEqual([{ color: 'rouge', bottles: 4 }, { color: 'blanc', bottles: 1 }]);
  });

  it('formate la fenêtre', () => {
    expect(windowText({ drink_from: 2024, drink_until: 2028 })).toBe('2024–2028');
    expect(windowText({ drink_from: 2024, drink_until: null })).toBe('dès 2024');
    expect(windowText({ drink_from: null, drink_until: null })).toBe('');
  });
});

describe('statistiques', () => {
  const rows = [
    row(wine({ color: 'rouge', region: 'Bordeaux', purchase_price: 20 }), 3),
    row(wine({ color: 'rouge', region: 'bordeaux', purchase_price: 10 }), 1),
    row(wine({ color: 'blanc', region: null, vintage: null }), 2),
    row(wine({ color: 'blanc' }), 0),
  ];

  it('répartit en bouteilles, accents/casse ignorés, « Non renseigné » en dernier', () => {
    const d = distribution(rows, 'region');
    expect(d.map((s) => [s.label, s.bottles])).toEqual([['Bordeaux', 4], [NOT_SET, 2]]);
    expect(distribution(rows, 'color').map((s) => [s.label, s.bottles])).toEqual([['rouge', 4], ['blanc', 2]]);
    expect(overview(rows)).toEqual({ bottles: 6, wines: 3 });
  });

  it('regroupe le reste sous « Autres »', () => {
    const slices = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, bottles: 5 - i, wines: 1 }));
    const top = topSlices([...slices, { label: NOT_SET, bottles: 1, wines: 1 }], 2);
    expect(top.map((s) => s.label)).toEqual(['L0', 'L1', 'Autres', NOT_SET]);
    expect(top[2]!.bottles).toBe(3 + 2 + 1);
  });

  it('calcule la valeur et signale les fiches sans prix', () => {
    const v = cellarValue(rows);
    expect(v.total).toBe(70);
    expect(v.pricedBottles).toBe(4);
    expect(v.average).toBe(17.5);
    expect(v.unpricedWines).toBe(1);
    expect(cellarValue([]).average).toBeNull();
  });

  it('compte les sorties sur 12 mois, par motif', () => {
    const o = (date: string, reason: Outflow['reason']): Outflow => ({ ...base, id: date + reason, wine_id: 'w', location_id: 'L', reason, date, note: null });
    const c = consumption([o('2026-11-02', 'drunk'), o('2026-11-15', 'gifted'), o('2026-01-10', 'drunk'), o('2025-10-01', 'drunk'), o('2025-11-30', 'broken')], new Date(2026, 10, 20));
    expect(c.months).toHaveLength(12);
    expect(c.months[0]!.month).toBe('2025-12');
    expect(c.months[11]).toEqual({ month: '2026-11', count: 2 });
    expect(c.total).toBe(3); // les sorties plus anciennes que 12 mois sont hors période
    expect(c.byReason.drunk).toBe(2);
    expect(consumption([]).total).toBe(0);
  });
});

describe('cadeaux par personne', () => {
  it('sépare stock et sorties et ignore les autres personnes', () => {
    const a = wine({ gift: true, gift_from: 'P1' });
    const b = wine({ gift: true, gift_from: 'P1' });
    const c = wine({ gift: true, gift_from: 'P2' });
    const d = wine({ gift: false, gift_from: 'P1' });
    const rows = [row(a, 2), row(b, 0), row(c, 1), row(d, 1)];
    const out = (w: Wine, date: string): Outflow => ({ ...base, id: `o${w.id}`, wine_id: w.id, location_id: 'L', reason: 'drunk', date, note: null });
    const g = giftsOf({ id: 'P1' }, rows, [out(b, '2026-05-01'), out(c, '2026-05-02'), out(a, '2026-06-01')]);
    expect(g.inStock.map((r) => r.wine.id)).toEqual([a.id]);
    expect(g.bottlesInStock).toBe(2);
    expect(g.gone.map((x) => x.wine.id)).toEqual([a.id, b.id]); // plus récent d'abord
  });

  it('filtre « Offert par » de la Liste', () => {
    const a = wine({ gift: true, gift_from: 'P1' });
    const b = wine({ gift: true, gift_from: 'P2' });
    const rows = buildRows({ wines: [a, b], stocks: [], locations: [], furniture: [] }).map((r) => ({ ...r, quantity: 1 }));
    const f = { ...emptyFilters(), giftFrom: 'P1' };
    expect(queryRows(rows, f, { key: 'domain', dir: 'asc' }).map((r) => r.wine.id)).toEqual([a.id]);
    expect(activeFilterCount(f)).toBe(1);
  });
});
