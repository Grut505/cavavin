import { describe, expect, it, vi } from 'vitest';
import { makeDevice, makeSheet, wineFields } from './helpers';

/** Deux appareils (ou plus) partageant la même feuille et la même horloge simulée. */
async function twoDevices() {
  const sheets = await makeSheet();
  const clock = { t: Date.parse('2026-11-02T10:00:00.000Z') };
  const a = await makeDevice(sheets, 'dev-A', clock);
  await a.repo.createFurniture('Meuble', 1);
  const shelf = (await a.repo.list('location'))[0]!;
  const wine = await a.repo.addWine(wineFields({ notes: null, supplier: null }), [{ location_id: shelf.id, quantity: 5, position_hint: null }]);
  await a.repo.sync();
  const b = await makeDevice(sheets, 'dev-B', clock);
  await b.repo.sync();
  const c = await makeDevice(sheets, 'dev-C', clock);
  await c.repo.sync();
  const stock = (await a.repo.list('stock'))[0]!;
  return { sheets, clock, a, b, c, wine, stock, shelf };
}

describe('quantités : les sorties de plusieurs appareils se cumulent', () => {
  it('deux sorties concurrentes sur la même fiche donnent −2, trois appareils −1 −2 −1', async () => {
    const { sheets, a, b, c, stock } = await twoDevices();
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null });
    await b.repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-11-01', note: null, quantity: 2 });
    await c.repo.recordOutflow(stock.id, { reason: 'broken', date: '2026-11-01', note: null });
    for (const d of [a, b, c, a, b, c]) await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(1); // 5 − 1 − 2 − 1
    expect(sheets.records('Sorties')).toHaveLength(4);
    for (const d of [a, b, c]) expect((await d.repo.get('stock', stock.id))?.quantity).toBe(1);
  });

  it('une sortie et un ajout concurrents se cumulent aussi', async () => {
    const { sheets, a, b, stock, wine, shelf } = await twoDevices();
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null, quantity: 2 });
    await b.repo.addStock(wine.id, { location_id: shelf.id, quantity: 3, position_hint: null });
    await a.repo.sync();
    await b.repo.sync();
    await a.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(6); // 5 − 2 + 3
  });

  it('ne passe jamais sous zéro : la quantité est plafonnée et un avis prévient', async () => {
    const { sheets, a, b, stock } = await twoDevices();
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null, quantity: 4 });
    await b.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null, quantity: 3 });
    await a.repo.sync();
    await b.repo.sync();
    expect(sheets.records('Stocks')[0]).toMatchObject({ quantity: 0, deleted: true });
    const notices = await b.repo.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'clamped', entity: 'stock', entity_id: stock.id });
    expect(notices[0]!.message).toContain('ramenée à 0');
    expect(notices[0]!.message).toContain('2 opérations concernées'); // 2 sorties sur 3 dépassaient le stock : un seul avis
    expect(await a.repo.notices()).toHaveLength(0);
    // Les deux sorties restent enregistrées : rien n'est perdu en silence.
    expect(sheets.records('Sorties')).toHaveLength(7);
  });
});

describe('champs : la modification la plus récente gagne, avec un avis', () => {
  it('deux appareils modifient des champs différents : les deux modifications sont conservées', async () => {
    const { sheets, a, b, wine } = await twoDevices();
    await a.repo.updateWine(wine.id, { notes: 'Très bon' });
    await b.repo.updateWine(wine.id, { supplier: 'Caviste Jean' });
    await a.repo.sync();
    await b.repo.sync();
    await a.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ notes: 'Très bon', supplier: 'Caviste Jean' });
    expect(await a.repo.notices()).toHaveLength(0);
    expect(await b.repo.notices()).toHaveLength(0);
    expect(await a.repo.get('wine', wine.id)).toMatchObject({ notes: 'Très bon', supplier: 'Caviste Jean' });
  });

  it('même champ : la modification faite en dernier l’emporte, même synchronisée en premier', async () => {
    const { sheets, clock, a, b, wine } = await twoDevices();
    await a.repo.updateWine(wine.id, { notes: 'Version A' }); // 1re modification
    clock.t += 60_000;
    await b.repo.updateWine(wine.id, { notes: 'Version B' }); // plus récente
    await a.repo.sync();
    await b.repo.sync();
    await a.repo.sync();
    expect(sheets.records('Vins')[0]?.notes).toBe('Version B');
    expect((await a.repo.get('wine', wine.id))?.notes).toBe('Version B');
    const notices = await b.repo.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'conflict_lww', entity: 'wine', entity_id: wine.id });
    expect(notices[0]!.message).toContain('votre version a remplacé l’autre');
    expect(notices[0]!.message).toContain('notes');
  });

  it('même champ : une modification plus ancienne, synchronisée après, ne remplace pas la plus récente', async () => {
    const { sheets, clock, a, b, wine } = await twoDevices();
    await b.repo.updateWine(wine.id, { notes: 'Ancienne (B, hors-ligne)' }); // modification la plus ancienne
    clock.t += 60_000;
    await a.repo.updateWine(wine.id, { notes: 'Récente (A)' });
    await a.repo.sync(); // A synchronise d'abord
    await b.repo.sync(); // B arrive après avec une modification plus ancienne
    expect(sheets.records('Vins')[0]?.notes).toBe('Récente (A)');
    expect((await b.repo.get('wine', wine.id))?.notes).toBe('Récente (A)'); // B reprend la version conservée
    const notices = await b.repo.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain('la version la plus récente a été conservée');
    expect(await a.repo.notices()).toHaveLength(0);
  });

  it('les avis sont conservés jusqu’à acquittement, individuellement ou en bloc', async () => {
    const { clock, a, b, wine } = await twoDevices();
    for (const n of ['1', '2']) {
      await a.repo.updateWine(wine.id, { notes: `A${n}` });
      clock.t += 60_000;
      await b.repo.updateWine(wine.id, { notes: `B${n}` });
      await a.repo.sync();
      await b.repo.sync();
    }
    const first = await b.repo.notices();
    expect(first).toHaveLength(2);
    // Un nouveau cycle de synchronisation ne les fait pas disparaître.
    await b.repo.sync();
    expect(await b.repo.notices()).toHaveLength(2);
    await b.repo.acknowledgeNotice(first[0]!.id);
    expect((await b.repo.notices()).map((n) => n.id)).toEqual([first[1]!.id]);
    await b.repo.acknowledgeAllNotices();
    expect(await b.repo.notices()).toEqual([]);
  });

  it('une modification locale en attente est fusionnée avec une modification distante sur un autre champ', async () => {
    const { a, b, wine } = await twoDevices();
    await b.repo.updateWine(wine.id, { supplier: 'Local (hors-ligne)' });
    await a.repo.updateWine(wine.id, { notes: 'Distante' });
    await a.repo.sync();
    expect((await b.repo.get('wine', wine.id))?.supplier).toBe('Local (hors-ligne)'); // pas encore envoyée
    await b.repo.sync();
    expect(await b.repo.get('wine', wine.id)).toMatchObject({ supplier: 'Local (hors-ligne)', notes: 'Distante' });
  });
});

describe('interruption', () => {
  it('une synchronisation interrompue après l’écriture distante ne s’applique pas deux fois', async () => {
    const { sheets, a, stock } = await twoDevices();
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: 'Bien' });
    // Simule une coupure juste après l'écriture dans la feuille, avant d'effacer l'opération locale.
    const original = a.db.removeOp.bind(a.db);
    a.db.removeOp = vi.fn().mockRejectedValueOnce(new Error('coupure')).mockImplementation(original);
    await expect(a.repo.sync()).rejects.toThrow('coupure');
    expect(sheets.records('Stocks')[0]?.quantity).toBe(4);
    expect(await a.repo.pendingCount()).toBe(1);
    await a.repo.sync(); // reprise : l'opération est reconnue grâce au journal
    expect(await a.repo.pendingCount()).toBe(0);
    expect(sheets.records('Stocks')[0]?.quantity).toBe(4);
    expect(sheets.records('Sorties')).toHaveLength(1);
  });

  it('une coupure réseau pendant la synchronisation laisse la file intacte, puis tout est envoyé dans l’ordre', async () => {
    const { sheets, a, stock } = await twoDevices();
    await a.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null });
    await a.repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-11-02', note: null });
    sheets.offline = true;
    await expect(a.repo.sync()).rejects.toMatchObject({ kind: 'network' });
    expect(await a.repo.pendingCount()).toBe(2);
    sheets.offline = false;
    await a.repo.sync();
    expect(await a.repo.pendingCount()).toBe(0);
    expect(sheets.records('Stocks')[0]?.quantity).toBe(3);
    expect(sheets.records('Sorties').map((o) => o.reason)).toEqual(['drunk', 'gifted']);
  });
});
