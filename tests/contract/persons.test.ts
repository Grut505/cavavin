import { describe, expect, it } from 'vitest';
import { PersonRuleError } from '../../src/domain/people';
import { SCHEMA_VERSION, allTabs } from '../../src/data/schema';
import { NotInitializedError } from '../../src/data/sync-engine';
import { FakeSheets } from './fake-sheets';
import { makeDevice, makeSheet, wineFields } from './helpers';

describe('personnes (cadeaux)', () => {
  it('ajoute, renomme et supprime une personne, synchronisées dans l’onglet Personnes', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const marie = await d.repo.addPerson('Marie');
    await d.repo.addPerson('Alice');
    await d.repo.sync();
    expect(sheets.records('Personnes').map((r) => r.name)).toEqual(['Marie', 'Alice']);

    await d.repo.renamePerson(marie.id, 'Marie-Claire');
    await d.repo.sync();
    expect(sheets.records('Personnes')[0]).toMatchObject({ name: 'Marie-Claire', rev: 2 });
    expect((await d.repo.persons()).map((p) => p.name)).toEqual(['Alice', 'Marie-Claire']);

    await d.repo.removePerson(marie.id);
    await d.repo.sync();
    expect(sheets.records('Personnes')[0]).toMatchObject({ deleted: true });
    expect((await d.repo.persons()).map((p) => p.name)).toEqual(['Alice']);
  });

  it('refuse un nom vide ou en double', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    await d.repo.addPerson('Marie');
    await expect(d.repo.addPerson('marie')).rejects.toBeInstanceOf(PersonRuleError);
    await expect(d.repo.addPerson('  ')).rejects.toMatchObject({ code: 'empty_name' });
    expect(await d.repo.pendingCount()).toBe(1);
  });

  it('enregistre « cadeau » et la personne sur la fiche, et compte les fiches offertes par une personne', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-A');
    const marie = await d.repo.addPerson('Marie');
    await d.repo.addWine(wineFields({ gift: true, gift_from: marie.id }), []);
    await d.repo.addWine(wineFields({ domain: 'Autre', cuvee: 'Z', gift: false }), []);
    await d.repo.sync();
    expect(sheets.records('Vins').find((v) => v.gift === true)).toMatchObject({ gift: true, gift_from: marie.id });
    expect(await d.repo.giftCount(marie.id)).toBe(1);
    // La suppression de la personne ne retire pas la mention « cadeau » des fiches.
    await d.repo.removePerson(marie.id);
    expect(await d.repo.giftCount(marie.id)).toBe(1);
  });
});

describe('migration vers la v3 (onglet Personnes, colonnes cadeau)', () => {
  /** Feuille créée par la v2 : sans onglet Personnes ni colonnes gift / gift_from. */
  async function v2Sheet() {
    const sheets = await makeSheet();
    sheets.tabs.delete('Personnes');
    const rows = sheets.tabs.get('Vins')!;
    const keep = (rows[0] as string[]).map((h) => h !== 'gift' && h !== 'gift_from');
    sheets.tabs.set('Vins', rows.map((r) => r.filter((_, i) => keep[i])));
    sheets.tabs.get('_Meta')![1] = ['schema_version', 2];
    return sheets;
  }

  it('crée l’onglet et les colonnes manquantes au premier échange, sans rien perdre', async () => {
    const sheets = await v2Sheet();
    const old = await makeDevice(sheets, 'dev-old');
    // Une fiche déjà présente dans la feuille v2.
    sheets.addManualRow('Vins', { id: 'w-old', rev: 1, updated_at: '2026-01-01T00:00:00Z', deleted: false, domain: 'Avant', cuvee: 'X', format: '75cl', created_at: '2026-01-01T00:00:00Z' });

    const marie = await old.repo.addPerson('Marie');
    await old.repo.addWine(wineFields({ domain: 'Nouveau', gift: true, gift_from: marie.id }), []);
    await old.repo.sync();

    expect(sheets.tabs.has('Personnes')).toBe(true);
    expect(sheets.tabs.get('Vins')![0]).toEqual(expect.arrayContaining(['gift', 'gift_from']));
    expect(sheets.records('Vins').find((v) => v.domain === 'Avant')).toMatchObject({ id: 'w-old' });
    expect(sheets.records('Vins').find((v) => v.domain === 'Nouveau')).toMatchObject({ gift: true, gift_from: marie.id });
    expect(sheets.records('Personnes')[0]).toMatchObject({ name: 'Marie' });
    expect(sheets.records('_Meta')).toEqual([{ key: 'schema_version', value: SCHEMA_VERSION }]);
    for (const t of allTabs()) expect(sheets.tabs.has(t.title)).toBe(true);
  });

  it('une feuille jamais initialisée reste à la main de l’utilisateur (aucune création automatique)', async () => {
    const sheets = new FakeSheets();
    sheets.tabs.set('Cave', [['Domaine'], ['X']]);
    const d = await makeDevice(sheets, 'dev-A');
    await expect(d.repo.sync()).rejects.toBeInstanceOf(NotInitializedError);
    expect([...sheets.tabs.keys()]).toEqual(['Cave']);
  });
});
