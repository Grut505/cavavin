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

describe('migration vers la v6 (photos avant / arrière)', () => {
  it('ajoute la colonne side à Photos et conserve les anciennes photos comme « avant »', async () => {
    const sheets = await makeSheet();
    const rows = sheets.tabs.get('Photos')!;
    const keep = (rows[0] as string[]).map((h) => h !== 'side');
    sheets.tabs.set('Photos', rows.map((r) => r.filter((_, i) => keep[i])));
    sheets.tabs.get('_Meta')![1] = ['schema_version', 5];
    sheets.addManualRow('Photos', { id: 'p-old', rev: 1, updated_at: '2026-01-01T00:00:00Z', deleted: false, wine_id: 'w1', mime: 'image/jpeg', width: 5, height: 5, seg_0: 'AAAA' });

    const d = await makeDevice(sheets, 'dev-v5');
    const w = await d.repo.addWine(wineFields({ domain: 'Nouveau' }), []);
    await d.repo.setThumbnail(w.id, { mime: 'image/jpeg', width: 5, height: 5, data: 'BBBB' }, 'arrière');
    await d.repo.sync();

    expect(sheets.tabs.get('Photos')![0]).toContain('side');
    expect(sheets.records('Photos').find((p) => p.wine_id === w.id)).toMatchObject({ side: 'arrière' });
    const old = (await d.repo.list('photo')).find((p) => p.id === 'p-old');
    expect(old?.side ?? 'avant').toBe('avant'); // sans côté = avant
    expect((await d.repo.photoUrls()).get('w1')?.front).toContain('AAAA');
  });
});
