// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { shoppingList, shoppingText } from '../../src/domain/shopping';
import type { WineRow } from '../../src/domain/query';
import type { Wine } from '../../src/domain/types';
import { homeView } from '../../src/ui/views/home';
import { shoppingView } from '../../src/ui/views/shopping';
import { contextOf, makeDevice, makeSheet, wineData, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

let n = 0;
const row = (over: Partial<Wine>, quantity = 1): WineRow => ({
  wine: { ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `s${++n}` },
  quantity,
  locations: [],
});

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '#/accueil';
});

describe('liste de courses (domaine)', () => {
  it('ne garde que les fiches marquées, épuisées d’abord, et fabrique un texte à partager', () => {
    const rows = [
      row({ domain: 'Zed', cuvee: 'Z', to_buy: true, supplier: 'Cave Y', purchase_price: 12.5 }, 2),
      row({ domain: 'Alpha', cuvee: 'A', to_buy: true }, 0),
      row({ domain: 'Autre', to_buy: false }),
      row({ domain: 'Absent' }, 1),
    ];
    const list = shoppingList(rows);
    expect(list.map((e) => e.row.wine.domain)).toEqual(['Alpha', 'Zed']);
    const text = shoppingText(list);
    expect(text).toContain('Liste de courses (cave) :');
    expect(text).toContain('- Alpha — A · 2019');
    expect(text).toContain('- Zed — Z · 2019 (Cave Y, 12,50 €)');
  });
});

describe('liste de courses (écrans)', () => {
  async function setup() {
    const d = await makeDevice(await makeSheet(), 'dev-shop');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const liked = await d.repo.addWine(wineFields({ cuvee: 'Aimé', rating: 5, supplier: 'Cave Y', purchase_price: 15 }), []);
    return { d, ctx: contextOf(d) as AppContext, liked, shelf };
  }

  it('« Ajouter à ma liste » depuis À racheter, puis la liste s’affiche, se partage et se vide', async () => {
    const { d, ctx, liked } = await setup();
    const home = await homeView(ctx);
    document.body.append(home);
    expect(home.textContent).toContain('Ma liste de courses (0)');
    click(byText(home, 'button', 'Ajouter à ma liste'));
    await waitFor(async () => expect((await d.repo.get('wine', liked.id))?.to_buy).toBe(true));

    const list = await shoppingView(ctx);
    document.body.append(list);
    expect(list.textContent).toContain('Aimé');
    expect(list.textContent).toContain('Plus en stock');
    expect(list.textContent).toContain('chez Cave Y');
    expect(list.querySelector('a.list__link')!.getAttribute('href')).toContain('?from=%2Fcourses');

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    click(byText(list, 'button', 'Partager'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toContain('Aimé');

    click(byText(list, 'button', 'Retirer'));
    await waitFor(() => expect(list.textContent).toContain('Rien à racheter'));
    expect((await d.repo.get('wine', liked.id))?.to_buy).toBe(false);
  });

  it('une fiche sans « à racheter » mais dans la liste fait apparaître le bloc', async () => {
    const { d, ctx } = await setup();
    const w = await d.repo.addWine(wineFields({ cuvee: 'Envie', rating: 2 }), []);
    await d.repo.setToBuy(w.id, true);
    const home = await homeView(ctx);
    expect(home.querySelector('#h-rebuy')).not.toBeNull();
    expect(home.textContent).toContain('Ma liste de courses (1)');
  });
});

describe('migration vers la v5 (liste de courses)', () => {
  it('ajoute la colonne to_buy à Vins sans rien perdre', async () => {
    const sheets = await makeSheet();
    const rows = sheets.tabs.get('Vins')!;
    const keep = (rows[0] as string[]).map((h) => h !== 'to_buy');
    sheets.tabs.set('Vins', rows.map((r) => r.filter((_, i) => keep[i])));
    sheets.tabs.get('_Meta')![1] = ['schema_version', 4];
    const d = await makeDevice(sheets, 'dev-v4');
    const w = await d.repo.addWine(wineFields({ domain: 'Nouveau' }), []);
    await d.repo.setToBuy(w.id, true);
    await d.repo.sync();
    expect(sheets.tabs.get('Vins')![0]).toContain('to_buy');
    expect(sheets.records('Vins').find((v) => v.domain === 'Nouveau')).toMatchObject({ to_buy: true });
  });
});
