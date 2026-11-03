// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { caveView } from '../../src/ui/views/cave';
import { homeView } from '../../src/ui/views/home';
import { personView } from '../../src/ui/views/person';
import { wineListView } from '../../src/ui/views/wine-list';
import { contextOf, makeDevice, makeSheet, wineData } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  window.location.hash = '#/stats';
});

async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-home');
  await d.repo.createFurniture('Meuble A', 2);
  const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
  return { d, ctx: contextOf(d) as AppContext, shelf };
}

describe('écran Stats', () => {
  it('propose d’ajouter une bouteille quand la cave est vide', async () => {
    const { ctx } = await setup();
    const el = await homeView(ctx);
    expect(el.textContent).toContain('Aucune bouteille en stock');
    expect(el.querySelector('a[href="#/ajouter"]')).not.toBeNull();
    expect(el.textContent).toContain('apparaîtront dès que la cave contiendra');
  });

  it('classe les bouteilles en catégories d’urgence repliables, avec des lignes compactes qui se déplient', async () => {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    const late = await d.repo.create('wine', wineData({ cuvee: 'Passée', appellation: 'Pauillac', drink_from: year - 10, drink_until: year - 2, purchase_price: 30, color: 'rouge', region: 'Bordeaux' }));
    const finishing = await d.repo.create('wine', wineData({ cuvee: 'Pressée', drink_from: year - 3, drink_until: year + 1, color: 'blanc' }));
    const now = await d.repo.create('wine', wineData({ cuvee: 'Prête', drink_from: year - 1, drink_until: year + 9, color: 'blanc' }));
    await d.repo.create('stock', { wine_id: late.id, location_id: shelf.id, quantity: 2, position_hint: null });
    await d.repo.create('stock', { wine_id: finishing.id, location_id: shelf.id, quantity: 1, position_hint: null });
    await d.repo.create('stock', { wine_id: now.id, location_id: shelf.id, quantity: 1, position_hint: null });

    const el = await homeView(ctx);
    document.body.append(el);
    expect([...el.querySelectorAll('.tbd__title')].map((e) => e.textContent)).toEqual(['En retard', 'À finir', 'À point']);
    const open = (u: string): boolean => (el.querySelector(`.tbd--${u}`) as HTMLDetailsElement).hasAttribute('open');
    expect([open('late'), open('finishing'), open('now')]).toEqual([true, true, false]); // seules les plus pressées sont ouvertes
    expect(el.querySelector('.tbd--late .badge')!.textContent).toBe('2'); // bouteilles, pas fiches

    const row = el.querySelector('.tbd--late .tbd__row')!;
    expect(row.querySelector('summary')!.textContent).toContain('Pauillac'); // l'appellation d'abord
    expect(row.querySelector('summary')!.textContent).toContain('Bordeaux');
    expect(row.querySelector('summary')!.textContent).toContain('×2');
    expect(row.textContent).toContain('dépassée depuis 2 ans'); // détail dans la partie dépliée
    expect(row.querySelector('a[href^="#/vin/"]')!.getAttribute('href')).toContain('?from=%2Fstats');
    expect(row.querySelector('button[aria-label^="Je la bois"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Afficher'); // tout tient dans le premier lot

    const tiles = el.querySelector('.tiles')!.textContent!;
    expect(tiles).toContain('4'); // bouteilles
    expect(tiles).toContain('60'); // 30 € × 2
    expect(tiles).toContain('2 fiches sans prix');
    expect(el.textContent).toContain('Par couleur');
    expect(el.textContent).toContain('Consommation');
    expect(el.querySelector('button[aria-label="Légende des couleurs"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Quoi boire ce soir'); // la recherche de plat est maintenant sur la Cave
  });
});

describe('écran Stats : pagination d’une catégorie', () => {
  it('n’affiche « Afficher n de plus » que s’il en reste, et le retire une fois tout affiché', async () => {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    for (let i = 0; i < 12; i++) {
      const w = await d.repo.create('wine', wineData({ cuvee: `V${i}`, drink_from: year - 1, drink_until: year + 9 }));
      await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    }
    const el = await homeView(ctx);
    document.body.append(el);
    const group = el.querySelector('.tbd--now')!;
    expect(group.querySelectorAll('.tbd__row-li')).toHaveLength(10);
    const more = [...group.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Afficher'))!;
    expect(more.textContent).toBe('Afficher 2 de plus (2 restantes)');
    click(more);
    expect(group.querySelectorAll('.tbd__row-li')).toHaveLength(12);
    expect(group.textContent).not.toContain('Afficher');
  });
});

describe('écran Stats : 50 fiches', () => {
  async function fifty() {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    for (let i = 0; i < 50; i++) {
      const w = await d.repo.create(
        'wine',
        wineData({
          domain: `Domaine ${String(50 - i).padStart(2, '0')}`,
          cuvee: `V${i}`,
          color: i % 5 === 0 ? 'blanc' : 'rouge', // 10 blancs, 40 rouges
          vintage: 2000 + i,
          drink_from: year - 3,
          drink_until: i < 6 ? year + 1 : year + 5 + (i % 7), // 6 « à finir », 44 « à point »
        }),
      );
      await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    }
    const el = await homeView(ctx);
    document.body.append(el);
    return { el, group: (u = 'now') => el.querySelector(`.tbd--${u}`)! };
  }
  const items = (g: Element): string[] => [...g.querySelectorAll('.tbd__row-li strong')].map((e) => e.textContent ?? '');

  it('sépare « À finir » et « À point » en deux catégories, pagine par 10 avec « Tout afficher »', async () => {
    const { group } = await fifty();
    expect(group('finishing').querySelector('.badge')!.textContent).toBe('6');
    expect(group('finishing').querySelectorAll('.tbd__row-li')).toHaveLength(6);
    const g = group('now');
    expect(g.querySelector('.badge')!.textContent).toBe('44');
    expect(items(g)).toHaveLength(10);
    const more = [...g.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Afficher 10 de plus'))!;
    expect(more.textContent).toBe('Afficher 10 de plus (34 restantes)');
    click(more);
    expect(items(g)).toHaveLength(20);
    click([...g.querySelectorAll('button')].find((b) => b.textContent === 'Tout afficher'));
    expect(items(g)).toHaveLength(44);
    expect([...g.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Afficher') || b.textContent === 'Tout afficher')).toBe(false);
  });

  it('filtre par couleur et change le tri, en le mémorisant', async () => {
    const { el, group } = await fifty();
    const chip = (label: string): Element | undefined => [...el.querySelectorAll('.tbd__controls .btn')].find((b) => b.textContent?.startsWith(label));
    expect(chip('Toutes')!.textContent).toBe('Toutes (50)');
    click(chip('Blanc'));
    expect(group('now').querySelector('.badge')!.textContent).toBe('8'); // 10 blancs dont 2 « à finir » (i = 0 et 5)
    expect(chip('Blanc')!.getAttribute('aria-pressed')).toBe('true');

    const select = el.querySelector('#drink-sort') as HTMLSelectElement;
    select.value = 'domain';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(items(group('now'))).toEqual([...items(group('now'))].sort((a, b) => a.localeCompare(b)));
    expect(el.textContent).toContain('ordre alphabétique de domaine');
    expect(JSON.parse(localStorage.getItem('cavavin.home.drink')!)).toEqual({ color: 'blanc', sort: 'domain' });
  });

  it('reprend les réglages mémorisés, et n’affiche aucun contrôle quand il y a peu de fiches', async () => {
    localStorage.setItem('cavavin.home.drink', JSON.stringify({ color: 'blanc', sort: 'vintage' }));
    const { el, group } = await fifty();
    expect(group('now').querySelector('.badge')!.textContent).toBe('8');
    expect((el.querySelector('#drink-sort') as HTMLSelectElement).value).toBe('vintage');

    document.body.innerHTML = '';
    const { d, ctx, shelf } = await setup();
    const w = await d.repo.create('wine', wineData({ drink_from: 2020, drink_until: 2099 }));
    await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    expect((await homeView(ctx)).querySelector('.tbd__controls')).toBeNull();
  });
});

describe('Cave : « À boire » et « Quoi boire »', () => {
  async function withPairings() {
    const { d, ctx, shelf } = await setup();
    const year = new Date().getFullYear();
    const risotto = await d.repo.create('wine', wineData({ cuvee: 'Risotto', pairings: 'risotto aux champignons; gratin dauphinois', drink_from: year - 1, drink_until: year + 5 }));
    const tarte = await d.repo.create('wine', wineData({ cuvee: 'Tarte', color: 'blanc', pairings: 'tarte aux poireaux', drink_from: year - 1, drink_until: year + 5 }));
    const bare = await d.repo.create('wine', wineData({ cuvee: 'Sans mets' }));
    for (const w of [risotto, tarte, bare]) await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    return { d, ctx };
  }

  it('« À boire » renvoie vers l’écran Stats', async () => {
    const { ctx } = await withPairings();
    const el = await caveView(ctx);
    expect(el.querySelector('.cave-actions__dish')!.textContent).toBe('Quoi boire ?');
    expect(el.querySelector('.cave-actions a.cave-todrink')!.getAttribute('href')).toBe('#/stats?go=a-boire');
    expect(el.querySelector('.cave-todrink')!.getAttribute('aria-label')).toContain('À boire');
  });

  it('« Quoi boire » ouvre une fenêtre de saisie qui envoie sur la Liste filtrée, fautes de frappe tolérées', async () => {
    const { ctx } = await withPairings();
    const el = await caveView(ctx);
    document.body.append(el);
    click([...el.querySelectorAll('.cave-actions button')].find((b) => b.textContent === 'Quoi boire ?'));
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('fenêtre absente');
      return d;
    });
    expect([...dlg.querySelectorAll('.chips .btn')].map((b) => b.textContent)).toContain('risotto aux champignons');
    const input = dlg.querySelector('#dish-input') as HTMLInputElement;
    input.value = 'un risoto aux champignon pour 4 personnes';
    click([...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Chercher'));
    expect(window.location.hash).toBe('#/liste?plat=un%20risoto%20aux%20champignon%20pour%204%20personnes');
    expect(document.querySelector('dialog')).toBeNull();

    // La Liste s'ouvre filtrée sur ce plat (une seule fois), la bonne bouteille seule
    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card')).toHaveLength(1));
    expect(list.textContent).toContain('Risotto');
    expect(list.textContent).toContain('1 filtre');
    expect(window.location.hash).toBe('#/liste'); // la requête est consommée
    expect(JSON.parse(localStorage.getItem('cavavin.list.filters')!)).toMatchObject({ dish: 'un risoto aux champignon pour 4 personnes' });
  });

  it('une saisie vide ne ferme pas la fenêtre ; un met de la cave se touche directement', async () => {
    const { ctx } = await withPairings();
    const el = await caveView(ctx);
    document.body.append(el);
    click([...el.querySelectorAll('.cave-actions button')].find((b) => b.textContent === 'Quoi boire ?'));
    const dlg = await waitFor(() => document.querySelector('dialog')!);
    click([...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Chercher'));
    expect(document.querySelector('dialog')).not.toBeNull();
    click([...dlg.querySelectorAll('.chips .btn')].find((b) => b.textContent === 'tarte aux poireaux'));
    expect(window.location.hash).toBe('#/liste?plat=tarte%20aux%20poireaux');
  });

  it('un plat avec viande ou sans correspondance ne ramène aucune bouteille', async () => {
    const { ctx } = await withPairings();
    window.location.hash = '#/liste?plat=magret%20de%20canard';
    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.textContent).toContain('1 filtre'));
    expect(list.querySelectorAll('.wine-card')).toHaveLength(0);
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
