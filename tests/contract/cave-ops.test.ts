import { describe, expect, it } from 'vitest';
import { LocationRuleError } from '../../src/domain/locations';
import { makeDevice, makeSheet, wineData } from './helpers';

async function seedWithBottles() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-A');
  const fid = await d.repo.createFurniture('Meuble A', 3);
  const shelves = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  const wine = await d.repo.create('wine', wineData());
  const stock = await d.repo.create('stock', {
    wine_id: wine.id,
    location_id: shelves[0]!.id,
    quantity: 4,
    position_hint: null,
  });
  await d.repo.sync();
  return { sheets, d, fid, shelves, wine, stock };
}

describe('cave : meubles, étagères et lieux', () => {
  it('crée un meuble et ses étagères, synchronisés dans la feuille', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.createFurniture('Meuble A', 5);
    await d.repo.createPlace('Cellier');
    await d.repo.sync();
    expect(sheets.records('Meubles')).toHaveLength(1);
    const locs = sheets.records('Emplacements');
    expect(locs.filter((l) => l.kind === 'shelf').map((l) => l.name)).toEqual([
      'Étagère 1',
      'Étagère 2',
      'Étagère 3',
      'Étagère 4',
      'Étagère 5',
    ]);
    expect(locs.find((l) => l.kind === 'place')).toMatchObject({ name: 'Cellier', furniture_id: null });
  });

  it('ajoute une étagère en bas et renomme', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const fid = await d.repo.createFurniture('Meuble A', 2);
    const id = await d.repo.addShelf(fid);
    const shelf = await d.repo.get('location', id);
    expect(shelf).toMatchObject({ name: 'Étagère 3', order: 2 });
    await d.repo.renameLocation(id, 'Bas');
    await expect(d.repo.renameLocation(id, 'étagère 1')).rejects.toMatchObject({ code: 'duplicate' });
    await d.repo.renameFurniture(fid, 'Grand meuble');
    await d.repo.sync();
    expect(sheets.records('Meubles')[0]?.name).toBe('Grand meuble');
  });

  it('supprime une étagère vide sans décision', async () => {
    const { d, shelves } = await seedWithBottles();
    await d.repo.deleteLocation(shelves[2]!.id);
    expect((await d.repo.list('location')).map((l) => l.id)).not.toContain(shelves[2]!.id);
  });

  it('refuse de supprimer une étagère non vide sans décision, sans rien modifier', async () => {
    const { d, shelves, stock } = await seedWithBottles();
    const err = await d.repo.deleteLocation(shelves[0]!.id).catch((e) => e);
    expect(err).toBeInstanceOf(LocationRuleError);
    expect(err.code).toBe('not_empty');
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(4);
    expect(await d.repo.pendingCount()).toBe(0);
  });

  it('déplace les bouteilles vers une autre étagère avant de supprimer', async () => {
    const { sheets, d, shelves, wine } = await seedWithBottles();
    await d.repo.deleteLocation(shelves[0]!.id, { action: 'move', toLocationId: shelves[1]!.id });
    await d.repo.sync();
    const active = sheets.records('Stocks').filter((s) => !s.deleted);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ wine_id: wine.id, location_id: shelves[1]!.id, quantity: 4 });
    expect(sheets.records('Emplacements').find((l) => l.id === shelves[0]!.id)?.deleted).toBe(true);
  });

  it('range les bouteilles dans « Sans emplacement » sur confirmation explicite', async () => {
    const { sheets, d, shelves } = await seedWithBottles();
    await d.repo.deleteLocation(shelves[0]!.id, { action: 'unassigned' });
    await d.repo.sync();
    const unassigned = sheets.records('Emplacements').find((l) => l.name === 'Sans emplacement');
    expect(unassigned).toMatchObject({ kind: 'legacy' });
    const active = sheets.records('Stocks').filter((s) => !s.deleted);
    expect(active[0]).toMatchObject({ location_id: unassigned!.id, quantity: 4 });
    // aucune bouteille perdue
    expect(await d.repo.bottlesIn([unassigned!.id as string])).toBe(4);
  });

  it('refuse un déplacement vers l’emplacement supprimé lui-même', async () => {
    const { d, shelves } = await seedWithBottles();
    await expect(
      d.repo.deleteLocation(shelves[0]!.id, { action: 'move', toLocationId: shelves[0]!.id }),
    ).rejects.toMatchObject({ code: 'bad_target' });
  });

  it('supprime un meuble : étagères incluses, bouteilles préservées', async () => {
    const { sheets, d, fid, wine } = await seedWithBottles();
    const place = await d.repo.createPlace('Cellier');
    await expect(d.repo.deleteFurniture(fid)).rejects.toMatchObject({ code: 'not_empty' });
    await d.repo.deleteFurniture(fid, { action: 'move', toLocationId: place });
    await d.repo.sync();
    expect(sheets.records('Meubles')[0]?.deleted).toBe(true);
    expect(sheets.records('Emplacements').filter((l) => l.kind === 'shelf').every((l) => l.deleted)).toBe(true);
    const active = sheets.records('Stocks').filter((s) => !s.deleted);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ wine_id: wine.id, location_id: place, quantity: 4 });
  });
});
