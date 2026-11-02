// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { mergeCandidates, mergePatch } from '../../src/domain/merge';
import type { Wine } from '../../src/domain/types';
import { openMergeDialog } from '../../src/ui/components/merge-dialog';
import { contextOf, makeDevice, makeSheet, wineData, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

let n = 0;
const wine = (over: Partial<Wine> = {}): Wine => ({ ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `m${++n}` });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fusion : champs', () => {
  it('ne comble que les champs vides, réunit les mets et les notes, reprend cadeau et liste de courses', () => {
    const keep = wine({ appellation: 'Pauillac', region: null, supplier: null, rating: 3, pairings: 'risotto', notes: 'Bon', gift: false, to_buy: false });
    const other = wine({ appellation: 'Autre', region: 'Bordeaux', supplier: 'Cave Y', rating: 5, pairings: 'Risotto; gratin', notes: 'Très bon', gift: true, gift_from: 'P1', to_buy: true });
    expect(mergePatch(keep, other)).toEqual({
      region: 'Bordeaux',
      supplier: 'Cave Y', // appellation et note gardent la valeur de la fiche conservée
      notes: 'Bon\nTrès bon',
      pairings: 'risotto; gratin',
      gift: true,
      gift_from: 'P1',
      to_buy: true,
    });
    expect(mergePatch(keep, { ...other, notes: ' bon ' }).notes).toBeUndefined(); // même note : rien à ajouter
  });

  it('propose d’abord les doublons probables, puis filtre par recherche', () => {
    const target = wine({ domain: 'Gramenon', cuvee: 'La Mémé', vintage: 2020 });
    const exact = wine({ domain: 'gramenon', cuvee: 'la meme', vintage: 2020 });
    const sameDomain = wine({ domain: 'Gramenon', cuvee: 'Autre', vintage: 2019 });
    const other = wine({ domain: 'Zed', cuvee: 'Z' });
    expect(mergeCandidates([other, target, sameDomain, exact], target).map((w) => w.id)).toEqual([exact.id, sameDomain.id, other.id]);
    expect(mergeCandidates([other, target, sameDomain, exact], target, 'zed').map((w) => w.id)).toEqual([other.id]);
    expect(mergeCandidates([{ ...exact, deleted: true }], target)).toEqual([]);
  });
});

describe('fusion : données', () => {
  async function setup() {
    const d = await makeDevice(await makeSheet(), 'dev-merge');
    await d.repo.createFurniture('Meuble A', 2);
    const [a1, a2] = (await d.repo.list('location')).filter((l) => l.kind === 'shelf');
    return { d, ctx: contextOf(d) as AppContext, a1: a1!, a2: a2! };
  }

  it('additionne les bouteilles d’un même emplacement, déplace les autres, rattache l’historique et supprime la fiche absorbée', async () => {
    const { d, a1, a2 } = await setup();
    const keep = await d.repo.addWine(wineFields({ cuvee: 'Garde', region: null }), [{ location_id: a1.id, quantity: 2, position_hint: null }]);
    const gone = await d.repo.addWine(wineFields({ cuvee: 'Doublon', region: 'Rhône' }), [
      { location_id: a1.id, quantity: 1, position_hint: null },
      { location_id: a2.id, quantity: 3, position_hint: 'gauche' },
    ]);
    // une sortie sur la fiche absorbée
    const goneStock = (await d.repo.list('stock')).find((s) => s.wine_id === gone.id && s.location_id === a2.id)!;
    await d.repo.recordOutflow(goneStock.id, { reason: 'drunk', date: '', note: 'Bue' });

    await d.repo.mergeWines(keep.id, gone.id);

    const stocks = (await d.repo.list('stock')).filter((s) => s.wine_id === keep.id);
    expect(stocks.find((s) => s.location_id === a1.id)?.quantity).toBe(3); // 2 + 1 sur l'étagère 1
    expect(stocks.find((s) => s.location_id === a2.id)?.quantity).toBe(2); // 3 - 1 bue, déplacées vers la fiche conservée
    expect((await d.repo.list('stock')).filter((s) => s.wine_id === gone.id)).toEqual([]);
    expect((await d.repo.list('outflow')).every((o) => o.wine_id === keep.id)).toBe(true);
    expect((await d.repo.list('outflow'))).toHaveLength(1); // la sortie « bue » n'est pas dupliquée ni perdue
    expect((await d.repo.get('wine', keep.id))?.region).toBe('Rhône');
    expect((await d.repo.list('wine')).map((w) => w.id)).toEqual([keep.id]); // absorbée supprimée (liste hors supprimées)
    expect(await d.repo.pendingCount()).toBeGreaterThan(0);
  });

  it('reprend la miniature quand la fiche conservée n’en a pas, et refuse une fusion invalide', async () => {
    const { d } = await setup();
    const keep = await d.repo.addWine(wineFields({ cuvee: 'K' }), []);
    const gone = await d.repo.addWine(wineFields({ cuvee: 'G' }), [], { mime: 'image/jpeg', width: 10, height: 10, data: 'AAAA' });
    expect((await d.repo.thumbnailUrls()).has(gone.id)).toBe(true);
    await d.repo.mergeWines(keep.id, gone.id);
    expect((await d.repo.thumbnailUrls()).has(keep.id)).toBe(true);
    expect((await d.repo.get('wine', keep.id))?.thumb_ref).not.toBeNull();
    await expect(d.repo.mergeWines(keep.id, keep.id)).rejects.toThrow(/deux fiches différentes/);
    await expect(d.repo.mergeWines(keep.id, 'nope')).rejects.toThrow(/introuvable/);
  });

  it('la fusion se synchronise vers la feuille', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-merge-sync');
    await d.repo.createFurniture('M', 1);
    const shelf = (await d.repo.list('location'))[0]!;
    const keep = await d.repo.addWine(wineFields({ domain: 'Garde' }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    const gone = await d.repo.addWine(wineFields({ domain: 'Doublon' }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    await d.repo.sync();
    await d.repo.mergeWines(keep.id, gone.id);
    await d.repo.sync();
    expect(await d.repo.pendingCount()).toBe(0);
    expect(sheets.records('Vins').find((w) => w.id === gone.id)).toMatchObject({ deleted: true });
    expect(sheets.records('Stocks').filter((s) => s.wine_id === keep.id && !s.deleted).reduce((n, s) => n + Number(s.quantity), 0)).toBe(2);
  });
});

describe('fusion : dialogue', () => {
  it('liste les doublons probables, demande confirmation puis fusionne', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-merge-ui');
    const keep = await d.repo.addWine(wineFields({ domain: 'Gramenon', cuvee: 'La Mémé' }), []);
    const dup = await d.repo.addWine(wineFields({ domain: 'Gramenon', cuvee: 'La Meme', vintage: 2021 }), []);
    await d.repo.addWine(wineFields({ domain: 'Zed', cuvee: 'Z' }), []);
    const ctx = contextOf(d) as AppContext;

    const done = openMergeDialog(ctx, { wine: keep });
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    const buttons = [...dlg.querySelectorAll('button[data-wine-id]')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('data-wine-id')).toBe(dup.id); // même domaine en tête

    click(buttons[0]);
    const confirm = await waitFor(() => {
      const c = [...document.querySelectorAll('dialog')].find((x) => x.textContent?.includes('Fusionner ces deux fiches'));
      if (!c) throw new Error('confirmation absente');
      return c;
    });
    expect(confirm.textContent).toContain('Cette action ne s’annule pas');
    click(byText(confirm, 'button', 'Fusionner'));
    expect(await done).toBe(true);
    expect((await d.repo.list('wine')).map((w) => w.id)).not.toContain(dup.id);
  });
});
