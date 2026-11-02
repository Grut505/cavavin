import { describe, expect, it } from 'vitest';
import { buildRows } from '../../src/domain/query';
import { makeDevice, makeSheet, wineFields } from './helpers';

async function cave() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-A');
  await d.repo.createFurniture('Meuble A', 2);
  const [s1, s2] = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  const wine = await d.repo.addWine(wineFields(), [{ location_id: s1!.id, quantity: 3, position_hint: null }]);
  const stock = (await d.repo.list('stock'))[0]!;
  await d.repo.sync();
  return { sheets, d, s1: s1!, s2: s2!, wine, stock };
}

describe('sorties de stock', () => {
  it('une sortie retire une bouteille, avec motif, date et note, et reste dans l’historique', async () => {
    const { sheets, d, wine, stock } = await cave();
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-10-01', note: '  Excellent  ' });
    await d.repo.sync();
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(2);
    expect(sheets.records('Stocks')[0]).toMatchObject({ quantity: 2, deleted: false });
    expect(sheets.records('Sorties')).toHaveLength(1);
    expect(sheets.records('Sorties')[0]).toMatchObject({ wine_id: wine.id, location_id: stock.location_id, reason: 'drunk', date: '2026-10-01', note: 'Excellent' });
  });

  it('plusieurs bouteilles = une sortie par bouteille', async () => {
    const { sheets, d, stock } = await cave();
    await d.repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-10-01', note: null, quantity: 2 });
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(1);
    expect(sheets.records('Sorties').map((o) => o.reason)).toEqual(['gifted', 'gifted']);
  });

  it('à zéro : le stock est désactivé et la fiche passe en historique, consultable', async () => {
    const { d, wine, stock } = await cave();
    await d.repo.recordOutflow(stock.id, { reason: 'broken', date: '2026-10-01', note: null, quantity: 3 });
    expect(await d.repo.get('stock', stock.id)).toBeUndefined();
    const rows = buildRows({
      wines: await d.repo.list('wine'),
      stocks: await d.repo.list('stock'),
      locations: await d.repo.list('location'),
      furniture: await d.repo.list('furniture'),
    });
    expect(rows.find((r) => r.wine.id === wine.id)?.quantity).toBe(0);
    expect((await d.repo.list('outflow')).length).toBe(3);
  });

  it('refuse une sortie invalide sans rien modifier', async () => {
    const { d, stock } = await cave();
    await expect(d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-10-01', note: null, quantity: 4 })).rejects.toThrow(/3 bouteilles/);
    await expect(d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2999-01-01', note: null })).rejects.toThrow(/futur/);
    await expect(d.repo.recordOutflow(stock.id, { reason: 'vendue' as never, date: '', note: null })).rejects.toThrow(/Motif/);
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(3);
    expect(await d.repo.list('outflow')).toHaveLength(0);
    expect(await d.repo.pendingCount()).toBe(0);
  });

  it('ajouter une bouteille à une fiche épuisée réactive son stock', async () => {
    const { d, s1, wine, stock } = await cave();
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-10-01', note: null, quantity: 3 });
    await d.repo.addStock(wine.id, { location_id: s1.id, quantity: 2, position_hint: null });
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(2);
    expect(await d.repo.list('stock')).toHaveLength(1);
  });

  it('deux appareils qui sortent chacun une bouteille : les sorties se cumulent', async () => {
    const { sheets, d, stock } = await cave();
    const d2 = await makeDevice(sheets, 'dev-B');
    await d2.repo.sync();
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-10-01', note: null });
    await d2.repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-10-02', note: null });
    await d.repo.sync();
    await d2.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(1);
    expect(sheets.records('Sorties')).toHaveLength(2);
  });
});

describe('déplacements', () => {
  it('déplace une partie vers un nouvel emplacement', async () => {
    const { sheets, d, s2, wine, stock } = await cave();
    await d.repo.moveBottles(stock.id, s2.id, 1);
    await d.repo.sync();
    const active = sheets.records('Stocks').filter((s) => !s.deleted);
    expect(Object.fromEntries(active.map((s) => [s.location_id, s.quantity]))).toEqual({ [stock.location_id]: 2, [s2.id]: 1 });
    expect(active.every((s) => s.wine_id === wine.id)).toBe(true);
  });

  it('fusionne avec le stock existant à la destination', async () => {
    const { d, s2, wine, stock } = await cave();
    await d.repo.addStock(wine.id, { location_id: s2.id, quantity: 4, position_hint: null });
    await d.repo.moveBottles(stock.id, s2.id, 3);
    const stocks = await d.repo.list('stock');
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ location_id: s2.id, quantity: 7 });
    expect(await d.repo.get('stock', stock.id)).toBeUndefined();
  });

  it('mémorise la position choisie à la destination', async () => {
    const { sheets, d, s2, stock } = await cave();
    await d.repo.moveBottles(stock.id, s2.id, 1, 'droite');
    await d.repo.sync();
    expect(sheets.records('Stocks').find((s) => s.location_id === s2.id)).toMatchObject({ position_hint: 'droite', quantity: 1 });
  });

  it('refuse quantité hors bornes ou destination identique', async () => {
    const { d, s1, s2, stock } = await cave();
    await expect(d.repo.moveBottles(stock.id, s2.id, 9)).rejects.toThrow(/3 bouteilles/);
    await expect(d.repo.moveBottles(stock.id, s1.id, 1)).rejects.toThrow(/déjà l’emplacement/);
    expect(await d.repo.moveStock(stock.id, s1.id, 1)).toBeNull();
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(3);
  });
});

describe('modification de fiche', () => {
  it('n’écrit que les champs réellement changés et lève « à compléter »', async () => {
    const { sheets, d, wine } = await cave();
    await d.repo.patch('wine', wine.id, { needs_review: true });
    await d.repo.sync();
    await d.repo.updateWine(wine.id, { ...wineFields(), appellation: 'Crozes-Hermitage', domain: wine.domain });
    await d.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ appellation: 'Crozes-Hermitage', needs_review: false });
    const journal = sheets.records('_Journal').filter((j) => j.type === 'patch');
    const last = JSON.parse(String(journal.at(-1)!.payload)) as { fields: Record<string, unknown> };
    expect(Object.keys(last.fields).sort()).toEqual(['appellation', 'needs_review']);
  });

  it('ne fait rien quand rien ne change', async () => {
    const { d, wine } = await cave();
    await d.repo.updateWine(wine.id, { domain: wine.domain, cuvee: wine.cuvee });
    expect(await d.repo.pendingCount()).toBe(0);
  });

  it('refuse une fiche inconnue', async () => {
    const { d } = await cave();
    await expect(d.repo.updateWine('nope', { cuvee: 'X' })).rejects.toThrow(/introuvable/);
  });
});
