// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeView } from '../../src/ui/views/home';
import { personView } from '../../src/ui/views/person';
import { contextOf, makeDevice, makeSheet, wineData } from '../contract/helpers';

const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = '';
});

async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-home');
  await d.repo.createFurniture('Meuble A', 2);
  const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
  return { d, ctx: contextOf(d), shelf };
}

describe('Accueil', () => {
  it('propose d’ajouter une bouteille quand la cave est vide', async () => {
    const { ctx } = await setup();
    const el = await homeView(ctx);
    expect(el.textContent).toContain('Aucune bouteille en stock');
    expect(el.querySelector('a[href="#/ajouter"]')).not.toBeNull();
    expect(el.textContent).toContain('apparaîtront dès que la cave contiendra');
  });

  it('classe les bouteilles, calcule les stats et prépare le prompt', async () => {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    const late = await d.repo.create('wine', wineData({ cuvee: 'Passée', drink_from: year - 10, drink_until: year - 2, purchase_price: 30, color: 'rouge', region: 'Bordeaux' }));
    const now = await d.repo.create('wine', wineData({ cuvee: 'Prête', drink_from: year - 1, drink_until: year + 5, color: 'blanc' }));
    await d.repo.create('stock', { wine_id: late.id, location_id: shelf.id, quantity: 2, position_hint: null });
    await d.repo.create('stock', { wine_id: now.id, location_id: shelf.id, quantity: 1, position_hint: null });

    const el = await homeView(ctx);
    document.body.append(el);
    const groups = [...el.querySelectorAll('.tbd__title')].map((e) => e.textContent);
    expect(groups).toEqual(['En retard', 'À boire maintenant']);
    expect(el.querySelector('.tbd--late')!.textContent).toContain('Passée');
    expect(el.querySelector('.tbd--late a[href^="#/vin/"]')).not.toBeNull();
    expect(el.textContent).toContain('dépassée depuis 2 ans');
    expect(el.textContent).not.toContain('Afficher'); // pas de « fiches restantes » quand tout tient dans le premier lot

    const tiles = el.querySelector('.tiles')!.textContent!;
    expect(tiles).toContain('3'); // bouteilles
    expect(tiles).toContain('60'); // 30 € × 2
    expect(tiles).toContain('1 fiche sans prix');
    expect(el.textContent).toContain('Par couleur');
    expect(el.textContent).toContain('Consommation');
  });

  it('« Quoi boire ce soir » cherche dans les mets des fiches, avec fautes de frappe', async () => {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    const duck = await d.repo.create('wine', wineData({ cuvee: 'Canard', pairings: 'risotto aux champignons; gratin dauphinois', drink_from: year - 1, drink_until: year + 5 }));
    const fish = await d.repo.create('wine', wineData({ cuvee: 'Poireaux', color: 'blanc', pairings: 'tarte aux poireaux', drink_from: year - 1, drink_until: year + 5 }));
    const bare = await d.repo.create('wine', wineData({ cuvee: 'Sans mets' }));
    for (const w of [duck, fish, bare]) await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });

    const el = await homeView(ctx);
    document.body.append(el);
    expect(el.textContent).toContain('Tapez un plat ou un ingrédient');
    expect([...el.querySelectorAll('.chips .btn')].map((b) => b.textContent)).toContain('risotto aux champignons');

    const input = el.querySelector('#dish') as HTMLInputElement;
    input.value = 'un risoto aux champignon pour 4 personnes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(el.querySelectorAll('.dish__results .wine-card')).toHaveLength(1));
    expect(el.querySelector('.dish__results')!.textContent).toContain('Canard');
    expect(el.querySelector('.dish__results')!.textContent).toContain('Accord : risotto aux champignons');

    input.value = 'magret de canard';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(el.textContent).toContain('Les mets de la cave sont végétariens'));

    input.value = 'sushi';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(el.textContent).toContain('Aucune bouteille ne correspond à « sushi »'));
    expect(el.textContent).toContain('1 fiche n’a aucun mets renseigné');
  });
});

describe('Accueil : pagination d’« À boire »', () => {
  it('n’affiche « Afficher n fiches restantes » que s’il en reste, et le retire une fois tout affiché', async () => {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    for (let i = 0; i < 12; i++) {
      const w = await d.repo.create('wine', wineData({ cuvee: `V${i}`, drink_from: year - 1, drink_until: year + 9 }));
      await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    }
    const el = await homeView(ctx);
    document.body.append(el);
    const group = el.querySelector('.tbd--now')!;
    expect(group.querySelectorAll('.tbd__item')).toHaveLength(10);
    const more = [...group.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Afficher'))!;
    expect(more.textContent).toBe('Afficher 2 fiches restantes');
    click(more);
    expect(group.querySelectorAll('.tbd__item')).toHaveLength(12);
    expect(group.textContent).not.toContain('Afficher');
  });
});

describe('fiche personne', () => {
  it('liste les cadeaux en stock et déjà sortis', async () => {
    const { d, ctx, shelf } = await setup();
    const p = await d.repo.addPerson('Marie');
    const w1 = await d.repo.create('wine', wineData({ cuvee: 'En stock', gift: true, gift_from: p.id }));
    const w2 = await d.repo.create('wine', wineData({ cuvee: 'Bue', gift: true, gift_from: p.id }));
    await d.repo.create('stock', { wine_id: w1.id, location_id: shelf.id, quantity: 1, position_hint: null });
    const s2 = await d.repo.create('stock', { wine_id: w2.id, location_id: shelf.id, quantity: 1, position_hint: null });
    await d.repo.recordOutflow(s2.id, { reason: 'drunk', date: '', note: null });

    const el = await personView(ctx, { id: p.id });
    expect(el.textContent).toContain('Marie');
    expect(el.textContent).toContain('En stock');
    expect(el.textContent).toContain('Déjà sorties');
    expect(el.textContent).toContain('Bue');
    expect(el.querySelectorAll('.wine-card')).toHaveLength(1);
  });

  it('gère une personne absente ou sans cadeau', async () => {
    const { d, ctx } = await setup();
    expect((await personView(ctx, { id: 'nope' })).textContent).toContain('introuvable');
    const p = await d.repo.addPerson('Paul');
    expect((await personView(ctx, { id: p.id })).textContent).toContain('Aucune bouteille n’est marquée');
  });
});
