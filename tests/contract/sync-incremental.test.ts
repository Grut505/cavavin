import { describe, expect, it } from 'vitest';
import { makeDevice, makeSheet, wineFields } from './helpers';

const big = (c: string): string => btoa(c.repeat(3000));

async function seed() {
  const sheets = await makeSheet();
  const a = await makeDevice(sheets, 'dev-a');
  await a.repo.createFurniture('Meuble', 1);
  const shelf = (await a.repo.list('location'))[0]!;
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) {
    const w = await a.repo.addWine(wineFields({ cuvee: `C${i}` }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    await a.repo.setThumbnail(w.id, { mime: 'image/jpeg', width: 5, height: 5, data: big(String.fromCharCode(65 + i)) }, 'avant');
    ids.push(w.id);
  }
  await a.engine.sync();
  return { sheets, a, ids };
}

describe('synchronisation incrémentale', () => {
  it('ne relit pas les photos quand rien n’a changé', async () => {
    const { sheets, a } = await seed();
    const photoCells = 12 * 3 * 40000; // ordre de grandeur d'une lecture complète des photos
    sheets.cellsRead = 0;
    await a.engine.sync();
    expect(sheets.cellsRead).toBeLessThan(2000);
    expect(photoCells).toBeGreaterThan(sheets.cellsRead);
  });

  it('un nouvel appareil récupère tout, puis plus rien aux synchros suivantes', async () => {
    const { sheets } = await seed();
    const b = await makeDevice(sheets, 'dev-b');
    await b.engine.sync();
    expect(await b.repo.list('wine')).toHaveLength(12);
    expect((await b.repo.thumbnailUrls()).size).toBe(12);
    sheets.cellsRead = 0;
    await b.engine.sync();
    expect(sheets.cellsRead).toBeLessThan(2000);
  });

  it('ne relit que la photo modifiée par l’autre appareil', async () => {
    const { sheets, a, ids } = await seed();
    const b = await makeDevice(sheets, 'dev-b');
    await b.engine.sync();
    await a.repo.setThumbnail(ids[3]!, { mime: 'image/jpeg', width: 5, height: 5, data: big('Z') }, 'avant');
    await a.engine.sync();
    sheets.cellsRead = 0;
    await b.engine.sync();
    expect(sheets.cellsRead).toBeLessThan(2000 + 3 * 3000); // probe + une ligne de photo
    expect((await b.repo.thumbnailUrls()).get(ids[3]!)).toContain(big('Z'));
  });

  it('propage les suppressions et envoie les modifications locales', async () => {
    const { sheets, a, ids } = await seed();
    const b = await makeDevice(sheets, 'dev-b');
    await b.engine.sync();
    await a.repo.remove('wine', ids[0]!);
    await a.engine.sync();
    await b.repo.patch('wine', ids[1]!, { notes: 'bu avec Anne' });
    await b.engine.sync();
    await a.engine.sync();
    expect((await b.repo.list('wine')).some((w) => w.id === ids[0])).toBe(false);
    expect((await a.repo.get('wine', ids[1]!))?.notes).toBe('bu avec Anne');
  });
});
