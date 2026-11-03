// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { dismissToast } from '../../src/ui/components/toast';
import { quickOutflow } from '../../src/ui/components/quick-outflow';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));
/** Dialogue ouvert dont le texte contient `text` (le dialogue de sortie se ferme avant que l'avis s'ouvre). */
const dialogWith = (text: string): Promise<HTMLDialogElement> =>
  waitFor(() => {
    const d = [...document.querySelectorAll('dialog')].find((x) => x.textContent?.includes(text));
    if (!d) throw new Error(`dialogue « ${text} » absent`);
    return d;
  });
const outflowDialog = (): Promise<HTMLDialogElement> => dialogWith('Sortir une bouteille');
const tastingDialog = (): Promise<HTMLDialogElement> => dialogWith('Votre avis');

beforeEach(() => {
  document.body.innerHTML = '';
  dismissToast();
});

async function setup(quantity = 2) {
  const d = await makeDevice(await makeSheet(), 'dev-tasting');
  await d.repo.createFurniture('Meuble A', 1);
  const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
  const wine = await d.repo.addWine(wineFields({ cuvee: 'Test', rating: null }), [{ location_id: shelf.id, quantity, position_hint: null }]);
  return { d, ctx: contextOf(d) as AppContext, wine, shelf };
}
const stockQty = async (d: Awaited<ReturnType<typeof setup>>['d']): Promise<number> => (await d.repo.list('stock')).reduce((n, s) => n + s.quantity, 0);

describe('avis après avoir bu', () => {
  it('propose note et commentaire, les enregistre sur la fiche et la sortie', async () => {
    const { d, ctx, wine } = await setup();
    const done = quickOutflow(ctx, wine);
    click(byText(await outflowDialog(), 'button', 'Sortir'));
    const tasting = await tastingDialog();
    click(tasting.querySelector('button[aria-label="4 sur 5"]'));
    (tasting.querySelector('#tasting-note') as HTMLTextAreaElement).value = 'Superbe avec un risotto';
    click(byText(tasting, 'button', 'Enregistrer'));
    await done;
    expect((await d.repo.get('wine', wine.id))?.rating).toBe(4);
    expect((await d.repo.list('outflow'))[0]?.note).toBe('Superbe avec un risotto');
  });

  it('« Plus tard » ne change rien, et une sortie « offerte » ne demande pas d’avis', async () => {
    const { d, ctx, wine } = await setup();
    const first = quickOutflow(ctx, wine);
    click(byText(await outflowDialog(), 'button', 'Sortir'));
    click(byText(await tastingDialog(), 'button', 'Plus tard'));
    await first;
    expect((await d.repo.get('wine', wine.id))?.rating).toBeNull();

    const second = quickOutflow(ctx, wine);
    const dlg = await outflowDialog();
    (dlg.querySelector('#out-reason') as HTMLSelectElement).value = 'gifted';
    click(byText(dlg, 'button', 'Sortir'));
    await second;
    expect(document.querySelector('dialog')).toBeNull();
  });
});

describe('annuler une sortie', () => {
  it('remet la bouteille et efface la sortie de l’historique', async () => {
    const { d, ctx, wine } = await setup(2);
    const done = quickOutflow(ctx, wine);
    click(byText(await outflowDialog(), 'button', 'Sortir'));
    click(byText(await tastingDialog(), 'button', 'Plus tard'));
    await done;
    expect(await stockQty(d)).toBe(1);
    expect(await d.repo.list('outflow')).toHaveLength(1);

    const toast = document.querySelector('.toast')!;
    expect(toast.textContent).toContain('Bouteille sortie.');
    click(byText(toast, 'button', 'Annuler'));
    // L'annulation remet le stock puis supprime la sortie : deux écritures successives, on attend les deux.
    await waitFor(async () => expect(await stockQty(d)).toBe(2));
    await waitFor(async () => expect(await d.repo.list('outflow')).toHaveLength(0));
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('réactive un stock épuisé (dernière bouteille)', async () => {
    const { d, ctx, wine } = await setup(1);
    const done = quickOutflow(ctx, wine);
    click(byText(await outflowDialog(), 'button', 'Sortir'));
    click(byText(await tastingDialog(), 'button', 'Plus tard'));
    await done;
    expect(await stockQty(d)).toBe(0);
    click(byText(document.querySelector('.toast')!, 'button', 'Annuler'));
    await waitFor(async () => expect(await stockQty(d)).toBe(1));
    await waitFor(async () => expect(await d.repo.list('outflow')).toHaveLength(0));
    expect((await d.repo.list('stock'))[0]?.deleted).toBe(false);
  });

  it('annule plusieurs sorties d’un coup', async () => {
    const { d, ctx, wine } = await setup(3);
    const done = quickOutflow(ctx, wine);
    const dlg = await outflowDialog();
    (dlg.querySelector('#out-quantity') as HTMLInputElement).value = '2';
    (dlg.querySelector('#out-reason') as HTMLSelectElement).value = 'gifted';
    click(byText(dlg, 'button', 'Sortir'));
    await done;
    expect(await stockQty(d)).toBe(1);
    expect(document.querySelector('.toast')!.textContent).toContain('2 bouteilles sorties.');
    click(byText(document.querySelector('.toast')!, 'button', 'Annuler'));
    await waitFor(async () => expect(await stockQty(d)).toBe(3));
  });
});
