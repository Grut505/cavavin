import { describe, expect, it } from 'vitest';
import { SheetsError } from '../../src/data/sheets-api';
import { NotInitializedError } from '../../src/data/sync-engine';
import { SchemaTooNewError, TabNameConflictError, initSheet, isInitialized } from '../../src/data/init-sheet';
import { SCHEMA_VERSION, allTabs, kindHeaders } from '../../src/data/schema';
import { FakeSheets } from './fake-sheets';
import { makeDevice, makeSheet, wineData, wineFields } from './helpers';

describe('initSheet', () => {
  it('crée les onglets, les en-têtes et la version de schéma, de façon idempotente', async () => {
    const sheets = new FakeSheets();
    const first = await initSheet(sheets);
    expect(first.createdTabs.length).toBe(allTabs().length);
    expect(isInitialized([...sheets.tabs.keys()])).toBe(true);
    expect(sheets.records('_Meta')).toEqual([{ key: 'schema_version', value: SCHEMA_VERSION }]);

    const second = await initSheet(sheets);
    expect(second.createdTabs).toEqual([]);
    expect(sheets.records('_Meta')).toHaveLength(1);
  });

  it("n'altère jamais l'onglet d'origine de l'utilisateur", async () => {
    const sheets = new FakeSheets();
    sheets.tabs.set('Cave', [
      ['Domaine', 'Millésime'],
      ['Château Z', 2015],
    ]);
    await initSheet(sheets);
    expect(sheets.tabs.get('Cave')).toEqual([
      ['Domaine', 'Millésime'],
      ['Château Z', 2015],
    ]);
  });

  it("refuse de s'approprier un onglet existant de même nom mais de structure étrangère", async () => {
    const sheets = new FakeSheets();
    sheets.tabs.set('Vins', [['Domaine', 'Année'], ['X', 2010]]);
    await expect(initSheet(sheets)).rejects.toBeInstanceOf(TabNameConflictError);
    expect(sheets.tabs.get('Vins')).toEqual([['Domaine', 'Année'], ['X', 2010]]);
  });

  it('refuse une feuille de schéma plus récent', async () => {
    const sheets = await makeSheet();
    sheets.tabs.get('_Meta')![1] = ['schema_version', 99];
    await expect(initSheet(sheets)).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it('ajoute à droite les colonnes manquantes sans toucher aux colonnes de l\'utilisateur', async () => {
    const sheets = await makeSheet();
    const header = sheets.tabs.get('Stocks')![0] as string[];
    sheets.tabs.get('Stocks')![0] = header.filter((h) => h !== 'position_hint').concat('ma_colonne');
    const res = await initSheet(sheets);
    expect(res.addedColumns).toContain('Stocks.position_hint');
    const newHeader = sheets.tabs.get('Stocks')![0] as string[];
    expect(newHeader).toContain('ma_colonne');
    expect(newHeader).toContain('position_hint');
  });
});

describe('migration de schéma', () => {
  /** Simule une feuille créée par la version 1 : sans les colonnes tannin / dryness. */
  async function legacySheet() {
    const sheets = await makeSheet();
    for (const tab of ['Vins', 'Propositions']) {
      const rows = sheets.tabs.get(tab)!;
      const header = rows[0] as string[];
      const keep = header.map((h) => h !== 'tannin' && h !== 'dryness');
      sheets.tabs.set(tab, rows.map((r) => r.filter((_, i) => keep[i])));
    }
    sheets.tabs.get('_Meta')![1] = ['schema_version', 1];
    return sheets;
  }

  it('ajoute les colonnes manquantes à la prochaine synchronisation, avant toute écriture', async () => {
    const sheets = await legacySheet();
    expect(sheets.tabs.get('Vins')![0]).not.toContain('tannin');
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.addWine(wineFields({ color: 'rouge', tannin: 4 }), []);
    await d.repo.sync();

    expect(sheets.tabs.get('Vins')![0]).toEqual(expect.arrayContaining(['tannin', 'dryness']));
    expect(sheets.tabs.get('Propositions')![0]).toEqual(expect.arrayContaining(['tannin', 'dryness']));
    expect(sheets.records('Vins')[0]).toMatchObject({ domain: 'Domaine X', tannin: 4 });
    expect(sheets.records('_Meta')).toEqual([{ key: 'schema_version', value: SCHEMA_VERSION }]);
    for (const kind of ['wine', 'proposal'] as const) {
      const tab = kind === 'wine' ? 'Vins' : 'Propositions';
      expect(sheets.tabs.get(tab)![0]).toEqual(expect.arrayContaining(kindHeaders(kind)));
    }
  });

  it('conserve les lignes et colonnes existantes de la feuille migrée', async () => {
    const sheets = await legacySheet();
    const d = await makeDevice(sheets, 'dev-A');
    const w = await d.repo.addWine(wineFields({ domain: 'Avant' }), []);
    await d.repo.sync();
    const d2 = await makeDevice(sheets, 'dev-B');
    await d2.repo.sync();
    const [seen] = await d2.repo.list('wine');
    expect(seen).toMatchObject({ id: w.id, domain: 'Avant', tannin: null, dryness: null });
  });

  it('ne réécrit pas la structure quand la feuille est déjà à jour', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.addWine(wineFields(), []);
    const before = JSON.stringify([...sheets.tabs.entries()].map(([k, v]) => [k, v[0]]));
    await d.repo.sync();
    expect(JSON.stringify([...sheets.tabs.entries()].map(([k, v]) => [k, v[0]]))).toBe(before);
  });
});

describe('moteur de sync — base', () => {
  it('pousse une création (fiche, emplacement, stock) et la ramène canonique en local', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const wine = await d.repo.create('wine', wineData());
    const furn = await d.repo.create('furniture', { name: 'Meuble 1', order: 0 });
    const loc = await d.repo.create('location', {
      kind: 'shelf',
      furniture_id: furn.id,
      name: 'Étagère 1',
      order: 0,
    });
    await d.repo.create('stock', {
      wine_id: wine.id,
      location_id: loc.id,
      quantity: 3,
      position_hint: null,
    });
    expect(await d.repo.pendingCount()).toBe(4);

    const report = await d.repo.sync();
    expect(report.pushed).toBe(4);
    expect(await d.repo.pendingCount()).toBe(0);

    expect(sheets.records('Vins')).toHaveLength(1);
    expect(sheets.records('Vins')[0]).toMatchObject({ domain: 'Domaine X', vintage: 2019, rev: 1 });
    expect(sheets.records('Stocks')[0]).toMatchObject({ quantity: 3, deleted: false });
    expect(sheets.records('_Journal')).toHaveLength(4);

    const [localWine] = await d.repo.list('wine');
    expect(localWine?.rev).toBe(1);
  });

  it('applique un patch et incrémente rev', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const wine = await d.repo.create('wine', wineData());
    await d.repo.sync();
    await d.repo.patch('wine', wine.id, { notes: 'Très bon', rating: 4 });
    await d.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ notes: 'Très bon', rating: 4, rev: 2 });
  });

  it("est idempotente : une opération rejouée n'est pas appliquée deux fois", async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const wine = await d.repo.create('wine', wineData());
    const stock = await d.repo.create('stock', {
      wine_id: wine.id,
      location_id: 'loc',
      quantity: 5,
      position_hint: null,
    });
    await d.repo.sync();
    await d.repo.adjustStock(stock.id, -1);
    const op = (await d.db.listOps())[0]!.op;
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(4);

    // Simule une interruption après écriture distante : l'opération est toujours dans l'outbox.
    await d.engine.enqueue(op);
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(4);
    expect(await d.repo.pendingCount()).toBe(0);
  });

  it('sort une bouteille avec un motif, désactive le stock à zéro et plafonne à 0', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const wine = await d.repo.create('wine', wineData());
    const stock = await d.repo.create('stock', {
      wine_id: wine.id,
      location_id: 'loc',
      quantity: 1,
      position_hint: null,
    });
    await d.repo.sync();
    await d.repo.adjustStock(stock.id, -1, { reason: 'drunk', date: '2026-11-02', note: null });
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]).toMatchObject({ quantity: 0, deleted: true });
    expect(sheets.records('Sorties')).toHaveLength(1);
    expect(sheets.records('Sorties')[0]).toMatchObject({ reason: 'drunk', wine_id: wine.id });

    await d.repo.adjustStock(stock.id, -1);
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(0);
    expect((await d.repo.notices()).map((n) => n.kind)).toContain('clamped');
  });

  it('déplace des bouteilles et fusionne avec un stock existant', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const wine = await d.repo.create('wine', wineData());
    const a = await d.repo.create('stock', { wine_id: wine.id, location_id: 'A', quantity: 4, position_hint: null });
    await d.repo.create('stock', { wine_id: wine.id, location_id: 'B', quantity: 1, position_hint: null });
    await d.repo.sync();
    await d.repo.moveStock(a.id, 'B', 3);
    await d.repo.moveStock(a.id, 'C', 1);
    await d.repo.sync();
    const byLoc = Object.fromEntries(
      sheets.records('Stocks').filter((r) => !r.deleted).map((r) => [r.location_id, r.quantity]),
    );
    expect(byLoc).toEqual({ B: 4, C: 1 });
  });

  it('supprime logiquement une entité', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const f = await d.repo.create('furniture', { name: 'M', order: 0 });
    await d.repo.sync();
    await d.repo.remove('furniture', f.id);
    await d.repo.sync();
    expect(sheets.records('Meubles')[0]).toMatchObject({ deleted: true, rev: 2 });
    expect(await d.repo.list('furniture')).toHaveLength(0);
  });

  it("récupère (pull) les lignes de la feuille, y compris celles saisies à la main sans `id`", async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    sheets.addManualRow('Meubles', { name: 'Ajouté à la main', order: 2 });
    const report = await d.repo.sync();
    expect(report.healed).toBe(1);
    const [m] = await d.repo.list('furniture');
    expect(m?.name).toBe('Ajouté à la main');
    expect(sheets.records('Meubles')[0]?.id).toBeTruthy();
    expect(sheets.records('Meubles')[0]?.rev).toBe(1);
  });

  it('retire de la copie locale une ligne supprimée dans la feuille', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.create('furniture', { name: 'M', order: 0 });
    await d.repo.sync();
    sheets.tabs.get('Meubles')!.splice(1, 1);
    await d.repo.sync();
    expect(await d.repo.list('furniture', true)).toHaveLength(0);
  });

  it("conserve l'outbox quand la synchronisation échoue (jeton expiré)", async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.create('furniture', { name: 'M', order: 0 });
    sheets.failNext = new SheetsError('expiré', 'auth', 401);
    await expect(d.repo.sync()).rejects.toMatchObject({ kind: 'auth' });
    expect(await d.repo.pendingCount()).toBe(1);
    await d.repo.sync();
    expect(await d.repo.pendingCount()).toBe(0);
    expect(sheets.records('Meubles')).toHaveLength(1);
  });

  it("signale une feuille non initialisée", async () => {
    const sheets = new FakeSheets();
    for (const t of allTabs()) sheets.tabs.set(t.title, []);
    const d = await makeDevice(sheets, 'dev-A');
    await expect(d.repo.sync()).rejects.toBeInstanceOf(NotInitializedError);
  });
});
