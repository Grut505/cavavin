// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { countDiffs, parseCount } from '../../src/domain/inventory';
import type { Stock } from '../../src/domain/types';
import { dismissToast } from '../../src/ui/components/toast';
import { inventoryView } from '../../src/ui/views/inventory';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  dismissToast();
});

describe('pointage (domaine)', () => {
  const st = (id: string, quantity: number, deleted = false): Stock => ({ id, rev: 1, updated_at: '', deleted, wine_id: `w${id}`, location_id: 'L', quantity, position_hint: null });

  it('ne garde que les écarts', () => {
    const stocks = [st('a', 3), st('b', 2), st('c', 4), st('d', 0, true)];
    const diffs = countDiffs(stocks, new Map([['a', 3], ['b', 1], ['c', 6], ['d', 5]]));
    expect(diffs.map((d) => [d.stockId, d.delta])).toEqual([['b', -1], ['c', 2]]);
    expect(countDiffs(stocks, new Map())).toEqual([]);
  });

  it('lit un nombre de bouteilles valide', () => {
    expect(parseCount('3')).toBe(3);
    expect(parseCount(' 0 ')).toBe(0);
    for (const bad of ['', '-1', '2,5', 'abc', '1000']) expect(parseCount(bad), bad).toBeNull();
  });
});

describe('pointage (écran)', () => {
  async function setup() {
    const d = await makeDevice(await makeSheet(), 'dev-inv');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const a = await d.repo.addWine(wineFields({ domain: 'Alpha' }), [{ location_id: shelf.id, quantity: 3, position_hint: null }]);
    const b = await d.repo.addWine(wineFields({ domain: 'Bravo' }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    return { d, ctx: contextOf(d) as AppContext, shelf, a, b };
  }
  const qty = async (d: Awaited<ReturnType<typeof setup>>['d'], wineId: string): Promise<number> =>
    (await d.repo.list('stock')).filter((s) => s.wine_id === wineId).reduce((n, s) => n + s.quantity, 0);

  it('corrige uniquement les écarts, sans créer de sortie, après confirmation', async () => {
    const { d, ctx, shelf, a, b } = await setup();
    window.location.hash = `#/pointage/${shelf.id}`;
    const el = await inventoryView(ctx, { id: shelf.id });
    document.body.append(el);
    expect(el.textContent).toContain('Aucun écart');

    const rowA = [...el.querySelectorAll('li[data-stock-id]')].find((r) => r.textContent?.includes('Alpha'))!;
    click(byText(rowA, 'button', '−')); // Alpha : 3 → 2
    const rowB = [...el.querySelectorAll('li[data-stock-id]')].find((r) => r.textContent?.includes('Bravo'))!;
    const input = rowB.querySelector('input')!;
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true })); // Bravo : 1 → 4
    expect(el.textContent).toContain('2 écarts à corriger');
    expect(rowB.classList.contains('inv__row--diff')).toBe(true);

    click(byText(el, 'button', 'Valider le pointage'));
    const confirm = await waitFor(() => {
      const c = [...document.querySelectorAll('dialog')].find((x) => x.textContent?.includes('Corriger le stock'));
      if (!c) throw new Error('confirmation absente');
      return c;
    });
    expect(confirm.textContent).toContain('Alpha : 3 → 2 (-1)');
    expect(confirm.textContent).toContain('Bravo : 1 → 4 (+3)');
    expect(confirm.textContent).toContain('pas comptées comme des bouteilles bues');
    click(byText(confirm, 'button', 'Corriger'));

    // Les corrections s'appliquent l'une après l'autre, puis l'écran revient à l'étagère : on attend la fin.
    await waitFor(() => expect(window.location.hash).toBe(`#/etagere/${shelf.id}`));
    expect(await qty(d, a.id)).toBe(2);
    expect(await qty(d, b.id)).toBe(4);
    expect(await d.repo.list('outflow')).toHaveLength(0); // une correction n'est pas une consommation
  });

  it('un pointage sans écart ne touche à rien', async () => {
    const { d, ctx, shelf, a } = await setup();
    const el = await inventoryView(ctx, { id: shelf.id });
    document.body.append(el);
    const before = await d.repo.pendingCount();
    click(byText(el, 'button', 'Valider le pointage'));
    await waitFor(() => expect(window.location.hash).toBe(`#/etagere/${shelf.id}`));
    expect(await d.repo.pendingCount()).toBe(before);
    expect(await qty(d, a.id)).toBe(3);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('descendre à zéro épuise la fiche, et un emplacement absent est signalé', async () => {
    const { d, ctx, shelf, b } = await setup();
    const el = await inventoryView(ctx, { id: shelf.id });
    document.body.append(el);
    const rowB = [...el.querySelectorAll('li[data-stock-id]')].find((r) => r.textContent?.includes('Bravo'))!;
    click(byText(rowB, 'button', '−'));
    click(byText(el, 'button', 'Valider le pointage'));
    await waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    click(byText(document.querySelector('dialog')!, 'button', 'Corriger'));
    await waitFor(async () => expect(await qty(d, b.id)).toBe(0));
    expect((await inventoryView(ctx, { id: 'nope' })).textContent).toContain('introuvable');
  });

  it('le lien « Pointer cette étagère » apparaît sur la page de l’étagère', async () => {
    const { ctx, shelf } = await setup();
    const view = await shelfDetailView(ctx, { id: shelf.id });
    expect(view.querySelector(`a[href="#/pointage/${shelf.id}"]`)).not.toBeNull();
  });
});
