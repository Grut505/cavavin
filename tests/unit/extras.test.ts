// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKFILL_BATCH, buildBackfillPrompt, parseBackfill, winesWithoutPairings } from '../../src/domain/pairing-backfill';
import { rebuyList } from '../../src/domain/rebuy';
import type { WineRow } from '../../src/domain/query';
import type { Wine } from '../../src/domain/types';
import { homeView } from '../../src/ui/views/home';
import { pairingsBackfillView } from '../../src/ui/views/pairings-backfill';
import { contextOf, makeDevice, makeSheet, wineData } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

let n = 0;
const row = (over: Partial<Wine> = {}, quantity = 1): WineRow => ({
  wine: { ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `w${++n}` },
  quantity,
  locations: [],
});

describe('à racheter', () => {
  it('liste les bouteilles notées 4 ou 5, épuisées d’abord puis dernières bouteilles', () => {
    const list = rebuyList([
      row({ cuvee: 'Aimée épuisée', rating: 5 }, 0),
      row({ cuvee: 'Dernière', rating: 4 }, 1),
      row({ cuvee: 'Moyenne', rating: 3 }, 0),
      row({ cuvee: 'Sans note' }, 0),
      row({ cuvee: 'Stock ok', rating: 5 }, 6),
      row({ cuvee: 'Épuisée 4', rating: 4 }, 0),
    ]);
    expect(list.map((e) => [e.row.wine.cuvee, e.reason])).toEqual([
      ['Aimée épuisée', 'out'],
      ['Épuisée 4', 'out'],
      ['Dernière', 'last'],
    ]);
  });
});

describe('compléter les mets', () => {
  it('prépare un prompt par lots, fiches en stock d’abord, avec les ids', () => {
    const rows = [row({ cuvee: 'Épuisée' }, 0), ...Array.from({ length: 35 }, (_, i) => row({ cuvee: `V${i}` }))];
    expect(winesWithoutPairings(rows)[0]!.quantity).toBe(1);
    const p = buildBackfillPrompt(rows);
    expect(p.count).toBe(BACKFILL_BATCH);
    expect(p.remaining).toBe(6);
    expect(p.text).toContain('STRICTEMENT VÉGÉTARIENNE');
    expect(p.text).toContain(rows[1]!.wine.id);
    expect(p.text).not.toContain(rows[0]!.wine.id); // épuisée : dans le lot suivant
  });

  it('lit la réponse : ids connus, sans écraser, mets non végétariens retirés', () => {
    const a = row({ cuvee: 'A' });
    const b = row({ cuvee: 'B', pairings: 'curry' });
    const c = row({ cuvee: 'C' });
    const d = row({ cuvee: 'D' });
    const answer = JSON.stringify([
      { id: a.wine.id, pairings: ['risotto aux champignons', 'magret de canard', 'gratin dauphinois'] },
      { id: b.wine.id, pairings: ['autre'] },
      { id: c.wine.id, pairings: null },
      { id: 'inconnu', pairings: ['x'] },
      { id: d.wine.id, pairings: 'poisson grillé' },
    ]);
    const r = parseBackfill('Voilà :\n```json\n' + answer + '\n```', [a, b, c, d]);
    expect(r.updates).toEqual([{ id: a.wine.id, pairings: 'risotto aux champignons; gratin dauphinois' }]);
    const w = r.warnings.join(' | ');
    expect(w).toContain('non végétariens retirés (magret de canard)');
    expect(w).toContain('déjà des mets');
    expect(w).toContain('Identifiant inconnu');
    expect(parseBackfill('pas de json', [a]).updates).toEqual([]);
  });

  it('applique la réponse collée aux fiches sans mets, sans toucher les autres', async () => {
    document.body.innerHTML = '';
    const d = await makeDevice(await makeSheet(), 'dev-fill');
    const ctx = contextOf(d);
    const a = await d.repo.create('wine', wineData({ cuvee: 'A' }));
    const b = await d.repo.create('wine', wineData({ cuvee: 'B', pairings: 'curry' }));
    await d.repo.create('stock', { wine_id: a.id, location_id: 'L', quantity: 1, position_hint: null });

    const el = await pairingsBackfillView(ctx);
    document.body.append(el);
    expect(el.textContent).toContain('1 fiche sans mets');
    (el.querySelector('#backfill-answer') as HTMLTextAreaElement).value = JSON.stringify([
      { id: a.id, pairings: ['risotto', 'gratin'] },
      { id: b.id, pairings: ['autre'] },
    ]);
    click(byText(el, 'button', 'Appliquer'));
    await waitFor(async () => expect((await d.repo.get('wine', a.id))?.pairings).toBe('risotto; gratin'));
    expect((await d.repo.get('wine', b.id))?.pairings).toBe('curry');
    await waitFor(() => expect(el.textContent).toContain('1 fiche complétée'));
    expect(el.textContent).toContain('Rien à compléter');
  });
});

describe('Accueil : « Je la bois » et « À racheter »', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '#/accueil';
  });

  it('sort une bouteille depuis la liste À boire et affiche les rachats', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-drink');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const year = new Date().getFullYear();
    const w = await d.repo.create('wine', wineData({ cuvee: 'À boire', drink_from: year - 1, drink_until: year + 4, rating: 5, supplier: 'Cave Y', purchase_price: 12 }));
    const stock = await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    await d.repo.create('wine', wineData({ cuvee: 'Épuisée aimée', rating: 4 }));
    const ctx = contextOf(d);

    const el = await homeView(ctx);
    document.body.append(el);
    expect(el.querySelector('#h-rebuy')).not.toBeNull();
    expect(el.textContent).toContain('Dernière bouteille');
    expect(el.textContent).toContain('Plus en stock');
    expect(el.textContent).toContain('chez Cave Y');

    click(el.querySelector('.tbd--now button[aria-label^="Je la bois"]'));
    await waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    const dlg = document.querySelector('dialog')!;
    expect((dlg.querySelector('#out-reason') as HTMLSelectElement).value).toBe('drunk');
    click(byText(dlg, 'button', 'Sortir'));
    await waitFor(async () => expect((await d.repo.get('stock', stock.id))?.quantity ?? 0).toBe(0));
    expect((await d.repo.list('outflow'))[0]).toMatchObject({ wine_id: w.id, reason: 'drunk' });
  });
});
