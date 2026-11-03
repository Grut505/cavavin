import { describe, expect, it } from 'vitest';
import { makeDevice, makeSheet, wineFields } from './helpers';

const thumb = { data: 'QUJDREVG', mime: 'image/jpeg' as const, width: 24, height: 32 };

async function cave() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-A');
  await d.repo.createFurniture('Meuble A', 2);
  const [s1, s2] = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  await d.repo.sync();
  return { sheets, d, s1: s1!, s2: s2! };
}

describe('session hors-ligne', () => {
  it('conserve la miniature et la fiche en local, puis les envoie au retour du réseau', async () => {
    const { sheets, d, s1 } = await cave();
    sheets.offline = true;
    const wine = await d.repo.addWine(wineFields({ domain: 'Hors-ligne' }), [{ location_id: s1.id, quantity: 2, position_hint: null }], thumb);
    await expect(d.repo.sync()).rejects.toMatchObject({ kind: 'network' });
    // Tout reste utilisable : la fiche, son stock et sa miniature sont visibles localement.
    expect(await d.repo.get('wine', wine.id)).toMatchObject({ domain: 'Hors-ligne' });
    expect((await d.repo.thumbnailUrls()).get(wine.id)).toBe('data:image/jpeg;base64,QUJDREVG');
    expect(await d.repo.pendingCount()).toBeGreaterThanOrEqual(4); // fiche, stock, photo, rattachement
    expect(sheets.records('Vins')).toHaveLength(0);

    sheets.offline = false;
    await d.repo.sync();
    expect(await d.repo.pendingCount()).toBe(0);
    expect(sheets.records('Vins')[0]).toMatchObject({ domain: 'Hors-ligne', thumb_ref: expect.any(String) });
    expect(sheets.records('Photos')[0]).toMatchObject({ wine_id: wine.id, seg_0: 'QUJDREVG' });
    expect((await d.repo.thumbnailUrls()).get(wine.id)).toBe('data:image/jpeg;base64,QUJDREVG');
  });

  it('un second appareil reçoit la fiche et sa miniature', async () => {
    const { sheets, d, s1 } = await cave();
    const wine = await d.repo.addWine(wineFields(), [{ location_id: s1.id, quantity: 1, position_hint: null }], thumb);
    await d.repo.sync();
    const other = await makeDevice(sheets, 'dev-B');
    await other.repo.sync();
    expect((await other.repo.thumbnailUrls()).get(wine.id)).toBe('data:image/jpeg;base64,QUJDREVG');
  });

  it('une longue session (ajout, déplacement, sortie, modification) est rejouée dans l’ordre', async () => {
    const { sheets, d, s1, s2 } = await cave();
    sheets.offline = true;
    const wine = await d.repo.addWine(wineFields({ notes: null }), [{ location_id: s1.id, quantity: 4, position_hint: null }]);
    const stock = (await d.repo.list('stock'))[0]!;
    await d.repo.moveBottles(stock.id, s2.id, 1, 'milieu-gauche');
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: 'Hier soir' });
    await d.repo.updateWine(wine.id, { notes: 'Très bon' });
    await d.repo.addPerson('Marie');
    for (let i = 0; i < 3; i++) await expect(d.repo.sync()).rejects.toMatchObject({ kind: 'network' });
    expect(await d.repo.list('wine')).toHaveLength(1);

    sheets.offline = false;
    await d.repo.sync();
    expect(await d.repo.pendingCount()).toBe(0);
    const byLoc = Object.fromEntries(sheets.records('Stocks').filter((s) => !s.deleted).map((s) => [s.location_id, s.quantity]));
    expect(byLoc).toEqual({ [s1.id]: 2, [s2.id]: 1 });
    expect(sheets.records('Stocks').find((s) => s.location_id === s2.id)?.position_hint).toBe('milieu-gauche');
    expect(sheets.records('Sorties')).toHaveLength(1);
    expect(sheets.records('Vins')[0]?.notes).toBe('Très bon');
    expect(sheets.records('Personnes').map((p) => p.name)).toEqual(['Marie']);
  });

  it('deux appareils hors-ligne en même temps se retrouvent sans perte', async () => {
    const { sheets, d, s1 } = await cave();
    const wine = await d.repo.addWine(wineFields(), [{ location_id: s1.id, quantity: 6, position_hint: null }]);
    await d.repo.sync();
    const other = await makeDevice(sheets, 'dev-B');
    await other.repo.sync();
    const stock = (await d.repo.list('stock'))[0]!;
    sheets.offline = true;
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null, quantity: 2 });
    await other.repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-11-01', note: null, quantity: 1 });
    await other.repo.updateWine(wine.id, { supplier: 'Caviste' });
    await expect(d.repo.sync()).rejects.toBeDefined();
    await expect(other.repo.sync()).rejects.toBeDefined();
    sheets.offline = false;
    await d.repo.sync();
    await other.repo.sync();
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(3);
    expect(sheets.records('Sorties')).toHaveLength(3);
    expect((await d.repo.get('wine', wine.id))?.supplier).toBe('Caviste');
  });
});
