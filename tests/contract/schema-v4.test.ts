// Migration v3 → v4 : colonne « pairings » (mets conseillés) ajoutée à Vins et Propositions.
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/data/schema';
import { makeDevice, makeSheet, wineFields } from './helpers';

describe('migration vers la v4 (mets conseillés)', () => {
  it('ajoute la colonne à la première synchro et synchronise les mets, sans rien perdre', async () => {
    const sheets = await makeSheet();
    for (const tab of ['Vins', 'Propositions']) {
      const rows = sheets.tabs.get(tab)!;
      const keep = (rows[0] as string[]).map((h) => h !== 'pairings');
      sheets.tabs.set(tab, rows.map((r) => r.filter((_, i) => keep[i])));
    }
    sheets.tabs.get('_Meta')![1] = ['schema_version', 3];
    sheets.addManualRow('Vins', { id: 'w-old', rev: 1, updated_at: '2026-01-01T00:00:00Z', deleted: false, domain: 'Avant', cuvee: 'X', format: '75cl', created_at: '2026-01-01T00:00:00Z' });

    const d = await makeDevice(sheets, 'dev-v3');
    await d.repo.addWine(wineFields({ domain: 'Nouveau', pairings: 'risotto aux champignons; gratin dauphinois' }), []);
    await d.repo.sync();

    expect(sheets.tabs.get('Vins')![0]).toContain('pairings');
    expect(sheets.tabs.get('Propositions')![0]).toContain('pairings');
    expect(sheets.records('Vins').find((v) => v.domain === 'Nouveau')).toMatchObject({ pairings: 'risotto aux champignons; gratin dauphinois' });
    expect(sheets.records('Vins').find((v) => v.domain === 'Avant')).toMatchObject({ id: 'w-old' });
    expect(sheets.records('_Meta')).toEqual([{ key: 'schema_version', value: SCHEMA_VERSION }]);
    expect((await d.repo.list('wine')).find((w) => w.id === 'w-old')?.pairings).toBeNull();
  });
});
