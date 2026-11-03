import { describe, expect, it } from 'vitest';
import { parseProposals } from '../../src/scan/proposal';
import { makeDevice, makeSheet, wineFields } from './helpers';

const thumb = { data: 'QUJD', mime: 'image/jpeg' as const, width: 10, height: 20 };

async function cave() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-A');
  await d.repo.createFurniture('Meuble A', 2);
  const [s1, s2] = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  return { sheets, d, s1: s1!, s2: s2! };
}

describe('fiches et stocks', () => {
  it('crée une fiche avec ses stocks et sa miniature, synchronisés', async () => {
    const { sheets, d, s1, s2 } = await cave();
    const fields = wineFields();
    const wine = await d.repo.addWine(
      fields,
      [
        { location_id: s1.id, quantity: 3, position_hint: 'milieu-gauche' },
        { location_id: s2.id, quantity: 1, position_hint: null },
      ],
      thumb,
    );
    await d.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ domain: 'Domaine X', thumb_ref: expect.any(String) });
    expect(sheets.records('Stocks').filter((s) => !s.deleted).map((s) => s.quantity).sort()).toEqual([1, 3]);
    expect(sheets.records('Photos')[0]).toMatchObject({ wine_id: wine.id, seg_0: 'QUJD', width: 10 });
    expect((await d.repo.thumbnailUrls()).get(wine.id)).toBe('data:image/jpeg;base64,QUJD');
  });

  it('enregistre tanin, sucre et fenêtre de garde de la fiche', async () => {
    const { sheets, d, s1 } = await cave();
    await d.repo.addWine(
      wineFields({ color: 'rouge', tannin: 3, drink_from: 2025, drink_until: 2031 }),
      [{ location_id: s1.id, quantity: 1, position_hint: null }],
    );
    await d.repo.addWine(
      wineFields({ domain: 'Blanc', cuvee: 'B', color: 'blanc', dryness: 'sec' }),
      [{ location_id: s1.id, quantity: 1, position_hint: null }],
    );
    await d.repo.sync();
    const vins = sheets.records('Vins');
    expect(vins.find((v) => v.color === 'rouge')).toMatchObject({ tannin: 3, drink_from: 2025, drink_until: 2031 });
    expect(vins.find((v) => v.color === 'blanc')).toMatchObject({ dryness: 'sec', tannin: null });
  });

  it('fusionne avec un stock existant et réactive un stock à zéro', async () => {
    const { sheets, d, s1 } = await cave();
    const fields = wineFields();
    const wine = await d.repo.addWine(fields, [{ location_id: s1.id, quantity: 2, position_hint: null }]);
    await d.repo.sync();
    await d.repo.addStock(wine.id, { location_id: s1.id, quantity: 3, position_hint: 'dessus-centre' });
    await d.repo.sync();
    let stocks = sheets.records('Stocks');
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ quantity: 5, position_hint: 'dessus-centre' });

    const stockId = stocks[0]!.id as string;
    await d.repo.adjustStock(stockId, -5);
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]).toMatchObject({ quantity: 0, deleted: true });
    await d.repo.addStock(wine.id, { location_id: s1.id, quantity: 1, position_hint: null });
    await d.repo.sync();
    stocks = sheets.records('Stocks');
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ quantity: 1, deleted: false });
  });

  it('refuse une quantité invalide', async () => {
    const { d, s1 } = await cave();
    const fields = wineFields();
    const wine = await d.repo.addWine(fields, []);
    await expect(d.repo.addStock(wine.id, { location_id: s1.id, quantity: 0, position_hint: null })).rejects.toThrow();
    await expect(d.repo.addStock(wine.id, { location_id: s1.id, quantity: 1.5, position_hint: null })).rejects.toThrow();
  });

  it('complète une fiche sans toucher aux quantités et lève « à compléter »', async () => {
    const { sheets, d, s1 } = await cave();
    const fields = wineFields();
    const wine = await d.repo.addWine(fields, [{ location_id: s1.id, quantity: 2, position_hint: null }]);
    await d.repo.patch('wine', wine.id, { needs_review: true });
    await d.repo.completeWine(wine.id, { region: 'Rhône' });
    await d.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ region: 'Rhône', needs_review: false });
    expect(sheets.records('Stocks')[0]?.quantity).toBe(2);
  });

  it('remplace la miniature (l’ancienne est supprimée)', async () => {
    const { sheets, d } = await cave();
    const fields = wineFields();
    const wine = await d.repo.addWine(fields, [], thumb);
    await d.repo.setThumbnail(wine.id, { ...thumb, data: 'WFla' });
    await d.repo.sync();
    const photos = sheets.records('Photos');
    expect(photos.filter((p) => !p.deleted)).toHaveLength(1);
    expect(photos.find((p) => !p.deleted)?.seg_0).toBe('WFla');
    expect((await d.repo.thumbnailUrls()).get(wine.id)).toContain('WFla');
  });
});

describe('propositions du projet Claude', () => {
  it('enregistre une proposition collée, synchronisée dans l’onglet Propositions', async () => {
    const { sheets, d } = await cave();
    const p = parseProposals(JSON.stringify({ domain: 'Domaine X', vintage: 2019, color: 'rouge' })).proposals[0]!;
    await d.repo.createProposal(p, 'paste');
    await d.repo.sync();
    expect(sheets.records('Propositions')[0]).toMatchObject({
      status: 'nouvelle',
      source: 'paste',
      domain: 'Domaine X',
      vintage: 2019,
    });
    expect(await d.repo.pendingProposals()).toHaveLength(1);
  });

  it('récupère une ligne déposée dans la feuille par Claude (canal 1) comme proposition nouvelle', async () => {
    const { sheets, d } = await cave();
    sheets.addManualRow('Propositions', { domain: 'Château Z', cuvee: 'Grande Cuvée', vintage: 2015, quantity: 2 });
    const report = await d.repo.sync();
    expect(report.healed).toBe(1);
    const [p] = await d.repo.pendingProposals();
    expect(p).toMatchObject({ domain: 'Château Z', status: 'nouvelle', source: 'claude', quantity: 2 });
    expect(p!.created_at).toBeTruthy();
  });

  it('marque une proposition importée ou écartée', async () => {
    const { sheets, d } = await cave();
    const p = parseProposals(JSON.stringify({ domain: 'A' })).proposals[0]!;
    const a = await d.repo.createProposal(p, 'paste');
    const b = await d.repo.createProposal(p, 'paste');
    await d.repo.resolveProposal(a.id, 'importée');
    await d.repo.resolveProposal(b.id, 'écartée');
    await d.repo.sync();
    expect(await d.repo.pendingProposals()).toHaveLength(0);
    expect(sheets.records('Propositions').map((r) => r.status).sort()).toEqual(['importée', 'écartée']);
  });
});
