import { describe, expect, it } from 'vitest';
import { buildRows, emptyFilters, queryRows } from '../../src/domain/query';
import type { Furniture, Location, Stock, Wine } from '../../src/domain/types';
import { WINE_COLORS } from '../../src/domain/types';
import { wineData } from '../contract/helpers';

const base = { rev: 1, updated_at: '', deleted: false };

function dataset(count: number) {
  const furniture: Furniture[] = [{ ...base, id: 'F', name: 'M', order: 0 }];
  const locations: Location[] = Array.from({ length: 40 }, (_, i) => ({
    ...base, id: `L${i}`, kind: 'shelf', furniture_id: 'F', name: `Étagère ${i + 1}`, order: i,
  }));
  const wines: Wine[] = [];
  const stocks: Stock[] = [];
  for (let i = 0; i < count; i++) {
    wines.push({
      ...wineData({
        domain: `Domaine ${(i * 7919) % 1000}`,
        cuvee: `Cuvée ${i}`,
        vintage: 1990 + (i % 35),
        color: WINE_COLORS[i % WINE_COLORS.length]!,
        country: i % 3 === 0 ? 'France' : 'Italie',
        region: `Région ${i % 12}`,
        created_at: new Date(2026, 0, 1 + (i % 300)).toISOString(),
      }),
      id: `w${i}`, rev: 1, updated_at: '', deleted: false,
    });
    stocks.push({ ...base, id: `s${i}`, wine_id: `w${i}`, location_id: `L${i % 40}`, quantity: 1 + (i % 6), position_hint: null });
  }
  return { wines, stocks, locations, furniture };
}

describe('performance (SC-004 : 500 fiches, < 100 ms)', () => {
  const rows = buildRows(dataset(500));

  it('construit les lignes de 500 fiches en moins de 100 ms', () => {
    const d = dataset(500);
    const t = performance.now();
    buildRows(d);
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('trie et filtre 500 fiches en moins de 100 ms (médiane de 15 essais)', () => {
    const filters = { ...emptyFilters(), colors: ['rouge', 'blanc', 'rosé'] as never[], vintageMin: 1995, qtyMin: 2 };
    const keys = ['domain', 'appellation', 'vintage', 'location', 'added', 'quantity'] as const;
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t = performance.now();
      for (const key of keys) queryRows(rows, filters, { key, dir: i % 2 ? 'asc' : 'desc' });
      times.push((performance.now() - t) / keys.length);
    }
    times.sort((a, b) => a - b);
    expect(times[7]!).toBeLessThan(100);
  });
});
