import { describe, expect, it } from 'vitest';
import { makeDevice, makeSheet, wineFields } from './helpers';

async function seeded() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-A');
  await d.repo.createFurniture('Meuble A', 2);
  const [s1, s2] = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  const wine = await d.repo.addWine(wineFields({ notes: 'Avant' }), [{ location_id: s1!.id, quantity: 5, position_hint: null }]);
  await d.repo.sync();
  const stock = (await d.repo.list('stock'))[0]!;
  return { sheets, d, s1: s1!, s2: s2!, wine, stock };
}

/** Index de colonne dans l'en-tête d'un onglet. */
const col = (sheets: Awaited<ReturnType<typeof seeded>>['sheets'], tab: string, name: string): number =>
  (sheets.tabs.get(tab)![0] as string[]).indexOf(name);

describe('modifications faites directement dans la feuille', () => {
  it('une cellule modifiée à la main est reprise à la synchronisation suivante', async () => {
    const { sheets, d, wine } = await seeded();
    sheets.tabs.get('Vins')![1]![col(sheets, 'Vins', 'notes')] = 'Modifiée dans la feuille';
    await d.repo.sync();
    expect((await d.repo.get('wine', wine.id))?.notes).toBe('Modifiée dans la feuille');
  });

  it('une quantité corrigée à la main est reprise, et les sorties s’appliquent par-dessus', async () => {
    const { sheets, d, stock } = await seeded();
    sheets.tabs.get('Stocks')![1]![col(sheets, 'Stocks', 'quantity')] = 8;
    await d.repo.sync();
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(8);
    await d.repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-11-01', note: null });
    await d.repo.sync();
    expect(sheets.records('Stocks')[0]?.quantity).toBe(7);
  });

  it('un nombre saisi comme texte dans la feuille est lu comme un nombre', async () => {
    const { sheets, d, stock } = await seeded();
    sheets.tabs.get('Stocks')![1]![col(sheets, 'Stocks', 'quantity')] = '3';
    await d.repo.sync();
    expect((await d.repo.get('stock', stock.id))?.quantity).toBe(3);
  });

  it('une ligne ajoutée à la main (sans identifiant) devient une fiche synchronisée', async () => {
    const { sheets, d } = await seeded();
    sheets.addManualRow('Vins', { domain: 'Ajoutée à la main', cuvee: 'X', vintage: 2018, format: '75cl' });
    const report = await d.repo.sync();
    expect(report.healed).toBe(1);
    const added = (await d.repo.list('wine')).find((w) => w.domain === 'Ajoutée à la main');
    expect(added).toMatchObject({ cuvee: 'X', vintage: 2018, rev: 1 });
    expect(sheets.records('Vins').every((r) => r.id)).toBe(true);
  });

  it('une ligne entièrement vide ne crée rien', async () => {
    const { sheets, d } = await seeded();
    sheets.tabs.get('Vins')!.push([]);
    sheets.tabs.get('Vins')!.push(['', '', '', '']);
    const report = await d.repo.sync();
    expect(report.healed).toBe(0);
    expect(await d.repo.list('wine')).toHaveLength(1);
  });

  it('une ligne supprimée dans la feuille disparaît de l’appareil ; une modification en attente sur elle est ignorée', async () => {
    const { sheets, d, wine } = await seeded();
    await d.repo.updateWine(wine.id, { notes: 'Locale' });
    sheets.tabs.get('Vins')!.splice(1, 1);
    await d.repo.sync();
    expect(await d.repo.list('wine', true)).toHaveLength(0);
    expect(await d.repo.pendingCount()).toBe(0);
    expect(sheets.records('Vins')).toHaveLength(0);
  });

  it('« deleted » passé à VRAI à la main masque la fiche', async () => {
    const { sheets, d, wine } = await seeded();
    sheets.tabs.get('Vins')![1]![col(sheets, 'Vins', 'deleted')] = true;
    await d.repo.sync();
    expect(await d.repo.get('wine', wine.id)).toBeUndefined();
    expect(await d.repo.list('wine')).toHaveLength(0);
  });
});

describe('structure de la feuille modifiée à la main', () => {
  it('une colonne ajoutée par l’utilisateur n’est jamais écrasée par l’application', async () => {
    const { sheets, d, wine } = await seeded();
    const vins = sheets.tabs.get('Vins')!;
    (vins[0] as string[]).push('Ma colonne');
    vins[1]!.push('Précieux commentaire');
    await d.repo.updateWine(wine.id, { notes: 'Changée par l’application' });
    await d.repo.sync();
    const rec = sheets.records('Vins')[0]!;
    expect(rec.notes).toBe('Changée par l’application');
    expect(rec['Ma colonne']).toBe('Précieux commentaire');
  });

  it('des colonnes réordonnées sont lues et écrites par leur nom', async () => {
    const { sheets, d, wine } = await seeded();
    const vins = sheets.tabs.get('Vins')!;
    const header = vins[0] as string[];
    const a = header.indexOf('domain');
    const b = header.indexOf('notes');
    for (const row of vins) {
      const tmp = row[a] ?? null;
      row[a] = row[b] ?? null;
      row[b] = tmp;
    }
    await d.repo.sync();
    expect(await d.repo.get('wine', wine.id)).toMatchObject({ domain: wine.domain, notes: 'Avant' });
    await d.repo.updateWine(wine.id, { notes: 'Nouvelle' });
    await d.repo.sync();
    expect(sheets.records('Vins')[0]).toMatchObject({ notes: 'Nouvelle', domain: wine.domain });
  });

  it('un autre appareil voit la correction faite dans la feuille', async () => {
    const { sheets, d, wine } = await seeded();
    sheets.tabs.get('Vins')![1]![col(sheets, 'Vins', 'cuvee')] = 'Corrigée';
    const other = await makeDevice(sheets, 'dev-B');
    await other.repo.sync();
    expect((await other.repo.get('wine', wine.id))?.cuvee).toBe('Corrigée');
    await d.repo.sync();
    expect((await d.repo.get('wine', wine.id))?.cuvee).toBe('Corrigée');
  });
});
