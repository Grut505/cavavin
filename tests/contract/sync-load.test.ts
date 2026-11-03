// Charge : 1000 fiches synchronisées, puis une synchro incrémentale ne retransmet que le delta.
import { describe, expect, it } from 'vitest';
import { makeDevice, makeSheet, wineData } from './helpers';

describe('charge : 1000 fiches', () => {
  it('première synchro puis synchro incrémentale rapide, deuxième appareil à jour', async () => {
    const sheets = await makeSheet();
    const a = await makeDevice(sheets, 'dev-a');
    const b = await makeDevice(sheets, 'dev-b');

    for (let i = 0; i < 1000; i++) await a.repo.create('wine', wineData({ cuvee: `Cuvée ${i}`, vintage: 1990 + (i % 35) }));
    const t0 = performance.now();
    await a.repo.sync();
    const first = performance.now() - t0;
    expect(await a.repo.pendingCount()).toBe(0);

    await b.repo.sync();
    expect(await b.repo.list('wine')).toHaveLength(1000);

    await a.repo.create('wine', wineData({ cuvee: 'Nouvelle' }));
    const t1 = performance.now();
    await a.repo.sync();
    await b.repo.sync();
    const incremental = performance.now() - t1;
    expect(await b.repo.list('wine')).toHaveLength(1001);

    // Seuils larges : ils ne servent qu'à repérer une dérive franche (la suite complète tourne en parallèle).
    expect(first).toBeLessThan(25_000);
    expect(incremental).toBeLessThan(8_000);
  }, 90_000);
});
