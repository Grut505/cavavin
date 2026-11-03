// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { wineListView } from '../../src/ui/views/wine-list';
import { makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus jsdom ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });

async function setup(withWines = true) {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-list');
  await d.repo.createFurniture('Meuble A', 2);
  const shelves = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  if (withWines) {
    const add = (over: Parameters<typeof wineFields>[0], qty: number, shelf = 0) =>
      d.repo.addWine(wineFields(over), [{ location_id: shelves[shelf]!.id, quantity: qty, position_hint: null }]);
    await add({ domain: 'Fabre', cuvee: 'Les Pins', vintage: 2015, color: 'rouge', country: 'France', appellation: 'Saint-Joseph', region: 'Vallée du Rhône' }, 3);
    await add({ domain: 'Alba', cuvee: 'Vieux', vintage: 2010, color: 'rouge', country: 'France', appellation: 'Bandol', region: 'Provence' }, 12, 1);
    await add({ domain: 'Zeta', cuvee: 'Blanc', vintage: 2021, color: 'blanc', country: 'Italie', appellation: 'Soave', region: 'Vénétie' }, 1, 1);
    const spent = await add({ domain: 'Épuisé', cuvee: 'X', vintage: 2012, color: 'rouge', country: 'France', appellation: 'Zzz' }, 1);
    const stock = (await d.repo.list('stock')).find((s) => s.wine_id === spent.id)!;
    await d.repo.adjustStock(stock.id, -1);
  }
  return { ctx: { repo: d.repo } as unknown as AppContext, repo: d.repo, shelves };
}

const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
/** Domaine de chaque carte (en petit, sous l'appellation : « Domaine · Cuvée »). */
const domains = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('.wine-card')].map((c) => (c.querySelector('.wine-card__maker')?.textContent ?? '').split(' · ')[0]!);
/** Titre de chaque carte : l'appellation et le millésime. */
const headings = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('.wine-card__domain')].map((e) => e.textContent ?? '');
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));

async function open(ctx: AppContext) {
  const view = wineListView(ctx);
  document.body.append(view);
  return view;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('liste des fiches', () => {
  it('affiche d’abord un état de chargement puis les fiches triées par appellation', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    expect(view.querySelector('.skeleton')).not.toBeNull();
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']);
    expect(view.querySelector('.skeleton')).toBeNull();
  });

  it('met l’appellation en valeur (avec le millésime et la région), le domaine et la cuvée en petit', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    expect(headings(view)).toEqual(['Bandol · 2010', 'Saint-Joseph · 2015', 'Soave · 2021']);
    const fabre = [...view.querySelectorAll('.wine-card')].find((c) => c.textContent?.includes('Fabre'))!;
    expect(fabre.querySelector('.wine-card__domain')!.textContent).toBe('Saint-Joseph · 2015');
    expect(fabre.querySelector('.wine-card__title')!.textContent).toBe('Vallée du Rhône · France');
    expect(fabre.querySelector('.wine-card__maker')!.textContent).toBe('Fabre · Les Pins');
    expect(fabre.textContent).toContain('Rouge');
    expect(fabre.textContent).toContain('Meuble A · Étagère 1');
    expect(fabre.querySelector('.badge')?.textContent).toBe('×3');
  });

  it('affiche le tanin des rouges et le sucre des blancs sur la carte', async () => {
    const { ctx, repo, shelves } = await setup(false);
    const loc = [{ location_id: shelves[0]!.id, quantity: 1, position_hint: null }];
    await repo.addWine(wineFields({ domain: 'Rouge R', color: 'rouge', tannin: 3 }), loc);
    await repo.addWine(wineFields({ domain: 'Blanc B', color: 'blanc', dryness: 'demi-sec' }), loc);
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(2));
    expect(byText(view, '.wine-card', 'Rouge R')?.textContent).toContain('Rouge · Tanin 3/5');
    expect(byText(view, '.wine-card', 'Blanc B')?.textContent).toContain('Blanc · Demi-sec');
  });

  it('chaque carte mène à la fiche détaillée', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    const hrefs = [...view.querySelectorAll('a.wine-card')].map((a) => a.getAttribute('href'));
    expect(hrefs).toHaveLength(3);
    expect(hrefs.every((h) => /^#\/vin\/.+/.test(h ?? ''))).toBe(true);
  });

  it('annonce le nombre de fiches et de bouteilles dans l’en-tête', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(view.querySelector('.app-header p')?.textContent).toBe('3 fiches · 16 bouteilles'));
  });

  it('change le tri et son sens, et les mémorise', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    const select = view.querySelector('select[aria-label="Trier par"]') as HTMLSelectElement;
    select.value = 'vintage';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']); // 2010, 2015, 2021
    select.value = 'quantity';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(domains(view)).toEqual(['Zeta', 'Fabre', 'Alba']);
    click(view.querySelector('button[aria-label^="Ordre"]'));
    expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']);
    expect(JSON.parse(localStorage.getItem('cavavin.list.sort')!)).toEqual({ key: 'quantity', dir: 'desc' });

    // Une nouvelle ouverture retrouve le tri choisi.
    document.body.innerHTML = '';
    const again = await open(ctx);
    await waitFor(() => expect(domains(again)).toHaveLength(3));
    expect(domains(again)).toEqual(['Alba', 'Fabre', 'Zeta']);
    expect((again.querySelector('select[aria-label="Trier par"]') as HTMLSelectElement).value).toBe('quantity');
  });

  it('filtre par couleur depuis la feuille de filtres, avec compteur en direct, puis réinitialise', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));

    click(byText(view, 'button', 'Filtres'));
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('feuille absente');
      return d;
    });
    expect(byText(dlg, 'button', 'Afficher')?.textContent).toBe('Afficher 3 résultats');

    const blanc = byText(dlg, '.chip__label', 'Blanc')!.parentElement!.querySelector('input')!;
    blanc.checked = true;
    blanc.dispatchEvent(new Event('change', { bubbles: true }));
    expect(byText(dlg, 'button', 'Afficher')?.textContent).toBe('Afficher 1 résultat');
    click(byText(dlg, 'button', 'Afficher'));

    await waitFor(() => expect(domains(view)).toEqual(['Zeta']));
    expect(view.querySelector('.toolbar .badge')?.textContent).toBe('1');
    expect(view.textContent).toContain('1 résultat avec 1 filtre');
    const reset = byText(view, 'button', 'Réinitialiser les filtres') as HTMLElement;
    expect(reset.hasAttribute('hidden')).toBe(false);
    click(reset);
    expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']);
    expect(view.querySelector('.toolbar .badge')).toBeNull();
  });

  it('combine plusieurs filtres (couleur + quantité minimale)', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    click(byText(view, 'button', 'Filtres'));
    const dlg = await waitFor(() => document.querySelector('dialog')!);
    const rouge = byText(dlg, '.chip__label', 'Rouge')!.parentElement!.querySelector('input')!;
    rouge.checked = true;
    rouge.dispatchEvent(new Event('change', { bubbles: true }));
    const min = dlg.querySelector('input[aria-label="Au moins"]') as HTMLInputElement;
    min.value = '5';
    min.dispatchEvent(new Event('input', { bubbles: true }));
    click(byText(dlg, 'button', 'Afficher'));
    await waitFor(() => expect(domains(view)).toEqual(['Alba']));
    expect(view.querySelector('.toolbar .badge')?.textContent).toBe('2');
  });

  it('inclut l’historique à la demande', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    click(byText(view, 'button', 'Filtres'));
    const dlg = await waitFor(() => document.querySelector('dialog')!);
    const hist = byText(dlg, '.chip__label', 'Inclure les fiches sans bouteille')!.parentElement!.querySelector('input')!;
    hist.checked = true;
    hist.dispatchEvent(new Event('change', { bubbles: true }));
    click(byText(dlg, 'button', 'Afficher'));
    await waitFor(() => expect(domains(view)).toContain('Épuisé'));
    expect(byText(view, '.wine-card', 'Épuisé')?.textContent).toContain('Épuisé');
    expect(view.querySelector('.wine-card--history')).not.toBeNull();
  });

  it('filtre par emplacement (étagère)', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    click(byText(view, 'button', 'Filtres'));
    const dlg = await waitFor(() => document.querySelector('dialog')!);
    const shelf2 = byText(dlg, '.chip__label', 'Étagère 2')!.parentElement!.querySelector('input')!;
    shelf2.checked = true;
    shelf2.dispatchEvent(new Event('change', { bubbles: true }));
    click(byText(dlg, 'button', 'Afficher'));
    await waitFor(() => expect(domains(view)).toEqual(['Alba', 'Zeta']));
  });

  it('affiche « Aucun résultat » avec un moyen de réinitialiser quand aucun filtre ne convient', async () => {
    const { ctx } = await setup();
    localStorage.setItem('cavavin.list.filters', JSON.stringify({ colors: ['liquoreux'] }));
    const view = await open(ctx);
    await waitFor(() => expect(view.textContent).toContain('Aucun résultat'));
    click(byText(view, '.empty button', 'Réinitialiser les filtres'));
    expect(domains(view)).toHaveLength(3);
  });

  it('propose d’ajouter une première bouteille quand la cave est vide', async () => {
    const { ctx } = await setup(false);
    const view = await open(ctx);
    await waitFor(() => expect(view.textContent).toContain('Aucune bouteille'));
    expect(view.querySelector('a[href="#/ajouter"]')).not.toBeNull();
    expect(view.querySelector('.app-header p')).toBeNull();
  });

  it('ignore des préférences enregistrées corrompues', async () => {
    const { ctx } = await setup();
    localStorage.setItem('cavavin.list.sort', '{"key":"nope","dir":"up"}');
    localStorage.setItem('cavavin.list.filters', 'pas du json');
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']));
  });
});

describe('recherche', () => {
  /** La recherche est temporisée (~120 ms) : on laisse passer le délai avant de vérifier. */
  const type = async (view: HTMLElement, text: string): Promise<void> => {
    const input = view.querySelector('#wine-search') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  };

  it('filtre en direct pendant la frappe, sans tenir compte des accents ni de la casse', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    await type(view, 'ALB');
    expect(domains(view)).toEqual(['Alba']);
    await type(view, 'zeta');
    expect(domains(view)).toEqual(['Zeta']);
    await type(view, '');
    expect(domains(view)).toEqual(['Alba', 'Fabre', 'Zeta']);
  });

  it('annonce le nombre de résultats pour la requête', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    await type(view, 'rouge');
    expect(view.querySelector('[role=status][aria-live=polite]')?.textContent).toBe('2 résultats pour « rouge »');
  });

  it('trouve par emplacement et par millésime, et met en tête la meilleure correspondance', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    await type(view, 'etagere 2');
    expect(domains(view).sort()).toEqual(['Alba', 'Zeta']);
    await type(view, '2015');
    expect(domains(view)).toEqual(['Fabre']);
  });

  it('se combine avec les filtres et le tri', async () => {
    const { ctx } = await setup();
    localStorage.setItem('cavavin.list.filters', JSON.stringify({ colors: ['rouge'] }));
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toEqual(['Alba', 'Fabre']));
    await type(view, 'a');
    expect(domains(view).sort()).toEqual(['Alba', 'Fabre']);
    await type(view, 'zeta');
    expect(domains(view)).toEqual([]);
    expect(view.textContent).toContain('Aucun résultat');
  });

  it('propose d’effacer la recherche quand rien ne correspond', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    await waitFor(() => expect(domains(view)).toHaveLength(3));
    await type(view, 'introuvable');
    expect(view.textContent).toContain('Aucune fiche ne correspond à « introuvable »');
    click(byText(view, '.empty button', 'Effacer la recherche'));
    expect((view.querySelector('#wine-search') as HTMLInputElement).value).toBe('');
    expect(domains(view)).toHaveLength(3);
  });
});

