// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { activeFilterCount, emptyFilters, queryRows } from '../../src/domain/query';
import { NOT_SET, topSlices } from '../../src/domain/stats';
import { maturityFilter, sliceFilter } from '../../src/domain/stats-filter';
import { openFilterSheet } from '../../src/ui/components/filter-sheet';
import { homeView } from '../../src/ui/views/home';
import { wineListView } from '../../src/ui/views/wine-list';
import { contextOf, makeDevice, makeSheet, wineData } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const savedFilters = (): Record<string, unknown> => JSON.parse(localStorage.getItem('cavavin.list.filters')!);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  window.location.hash = '#/accueil';
});

describe('ligne de statistique → filtre de la Liste', () => {
  it('traduit chaque axe en filtre', () => {
    expect(sliceFilter('color', { label: 'rouge', bottles: 3, wines: 2 })).toEqual({ colors: ['rouge'] });
    expect(sliceFilter('region', { label: 'Bordeaux', bottles: 3, wines: 2 })).toEqual({ regions: ['Bordeaux'] });
    expect(sliceFilter('country', { label: 'France', bottles: 1, wines: 1 })).toEqual({ countries: ['France'] });
    expect(sliceFilter('appellation', { label: 'Pauillac', bottles: 1, wines: 1 })).toEqual({ appellations: ['Pauillac'] });
    expect(sliceFilter('vintage', { label: '2019', bottles: 1, wines: 1 })).toEqual({ vintageMin: 2019, vintageMax: 2019 });
    expect(maturityFilter('late')).toEqual({ maturity: ['late'] });
  });

  it('« Non renseigné » et « Autres » gardent la bonne sélection', () => {
    expect(sliceFilter('region', { label: NOT_SET, bottles: 1, wines: 1 })).toEqual({ regions: [''] });
    const top = topSlices([{ label: 'A', bottles: 5, wines: 1 }, { label: 'B', bottles: 4, wines: 1 }, { label: 'C', bottles: 3, wines: 1 }, { label: 'D', bottles: 2, wines: 1 }], 2);
    const autres = top.find((s) => s.label === 'Autres')!;
    expect(sliceFilter('appellation', autres)).toEqual({ appellations: ['C', 'D'] });
    expect(sliceFilter('vintage', { label: NOT_SET, bottles: 1, wines: 1 })).toEqual({ vintageNone: true });
    const years = topSlices([2015, 2016, 2017, 2018].map((y, i) => ({ label: String(y), bottles: 4 - i, wines: 1 })), 2).find((s) => s.label === 'Autres')!;
    expect(sliceFilter('vintage', years)).toEqual({ vintages: [2017, 2018] }); // exactement les années regroupées
    expect(sliceFilter('vintage', autres)).toBeNull(); // « Autres » dont les libellés ne sont pas des années
  });
});

describe('filtres appellation et maturité', () => {
  const row = (over: Parameters<typeof wineData>[0], quantity = 1) => ({
    wine: { ...wineData(over), rev: 1, updated_at: '', deleted: false, id: Math.random().toString(36) },
    quantity,
    locations: [],
  });
  const rows = [
    row({ cuvee: 'A', appellation: 'Pauillac', drink_from: 2020, drink_until: 2040 }),
    row({ cuvee: 'B', appellation: 'pauillac', drink_from: 2000, drink_until: 2010 }),
    row({ cuvee: 'C', appellation: null, drink_from: 2020, drink_until: 2040 }),
  ];
  const names = (f: Partial<ReturnType<typeof emptyFilters>>): string[] =>
    queryRows(rows, { ...emptyFilters(), ...f }, { key: 'domain', dir: 'asc' }, 2026).map((r) => r.wine.cuvee).sort();

  it('filtre par appellation (casse ignorée) et « non renseigné »', () => {
    expect(names({ appellations: ['Pauillac'] })).toEqual(['A', 'B']);
    expect(names({ appellations: [''] })).toEqual(['C']);
  });

  it('filtre les non millésimés, seuls ou en plus d’une plage', () => {
    const vr = [
      row({ cuvee: 'V2015', vintage: 2015 }),
      row({ cuvee: 'V2020', vintage: 2020 }),
      row({ cuvee: 'NV', vintage: null }),
    ];
    const q = (f: Partial<ReturnType<typeof emptyFilters>>): string[] =>
      queryRows(vr, { ...emptyFilters(), ...f }, { key: 'domain', dir: 'asc' }, 2026).map((r) => r.wine.cuvee).sort();
    expect(q({ vintageNone: true })).toEqual(['NV']);
    expect(q({ vintageMin: 2018 })).toEqual(['V2020']); // une plage seule exclut toujours les NV
    expect(q({ vintageMin: 2018, vintageNone: true })).toEqual(['NV', 'V2020']);
    expect(q({ vintageMin: 2010, vintageMax: 2016, vintageNone: true })).toEqual(['NV', 'V2015']);
    expect(q({ vintages: [2020] })).toEqual(['V2020']);
    expect(q({ vintages: [2015], vintageNone: true })).toEqual(['NV', 'V2015']);
    expect(activeFilterCount({ ...emptyFilters(), vintages: [2015] })).toBe(1);
    expect(activeFilterCount({ ...emptyFilters(), vintageNone: true })).toBe(1);
    expect(activeFilterCount({ ...emptyFilters(), vintageMin: 2000, vintageNone: true })).toBe(1); // un seul critère « millésime »
  });

  it('filtre par maturité selon l’année', () => {
    expect(names({ maturity: ['late'] })).toEqual(['B']);
    expect(names({ maturity: ['now'] })).toEqual(['A', 'C']);
    expect(names({ maturity: ['late', 'now'], appellations: ['Pauillac'] })).toEqual(['A', 'B']);
    expect(activeFilterCount({ ...emptyFilters(), appellations: ['x'], maturity: ['now'] })).toBe(2);
  });
});

describe('Accueil : toucher une ligne ouvre la Liste préfiltrée', () => {
  async function setup() {
    const d = await makeDevice(await makeSheet(), 'dev-stats-click');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const year = new Date().getFullYear();
    const add = async (over: Parameters<typeof wineData>[0]) => {
      const w = await d.repo.create('wine', wineData({ drink_from: year - 1, drink_until: year + 5, ...over }));
      await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    };
    await add({ cuvee: 'Rouge bordelais', color: 'rouge', region: 'Bordeaux', appellation: 'Pauillac' });
    await add({ cuvee: 'Rouge rhodanien', color: 'rouge', region: 'Rhône', appellation: 'Saint-Joseph' });
    await add({ cuvee: 'Blanc sans région', color: 'blanc', region: null });
    await add({ cuvee: 'Passé', color: 'rouge', region: 'Bordeaux', drink_from: 2000, drink_until: 2010 });
    return { ctx: contextOf(d) as AppContext };
  }
  /** Ligne cliquable `label`, dans la carte de titre `card` si donnée (plusieurs cartes ont « Non renseigné »). */
  const row = (el: Element, label: string, card?: string): Element | undefined => {
    const scope = card ? [...el.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === card) ?? el : el;
    return [...scope.querySelectorAll('.bars__btn')].find((b) => b.getAttribute('data-stat') === label);
  };
  const listed = (el: Element): string => [...el.querySelectorAll('.wine-card')].map((c) => c.textContent).join(' | ');

  it('couleur : la Liste n’affiche que les rouges, et le filtre est actif', async () => {
    const { ctx } = await setup();
    const home = await homeView(ctx);
    document.body.append(home);
    click(row(home, 'Rouge'));
    expect(window.location.hash).toBe('#/liste');
    expect(savedFilters()).toMatchObject({ colors: ['rouge'], regions: [], includeHistory: false });

    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card').length).toBe(3));
    expect(listed(list)).not.toContain('Blanc sans région');
    expect(list.textContent).toContain('1 filtre');
  });

  it('région « Non renseigné » et maturité « En retard » retrouvent les bonnes fiches', async () => {
    const { ctx } = await setup();
    const home = await homeView(ctx);
    document.body.append(home);
    click(row(home, 'Non renseigné', 'Par région'));
    expect(savedFilters()).toMatchObject({ regions: [''] });
    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card').length).toBe(1));
    expect(listed(list)).toContain('Blanc sans région');

    window.location.hash = '#/accueil';
    click(row(home, 'En retard'));
    expect(savedFilters()).toMatchObject({ maturity: ['late'], regions: [] }); // remplace les filtres précédents
    document.body.innerHTML = '';
    const list2 = wineListView(ctx);
    document.body.append(list2);
    await waitFor(() => expect(list2.querySelectorAll('.wine-card').length).toBe(1));
    expect(listed(list2)).toContain('Passé');
  });

  it('millésime non renseigné : ouvre la Liste sur les non millésimés', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-nv');
    const shelf = (await (async () => { await d.repo.createFurniture('M', 1); return (await d.repo.list('location'))[0]!; })());
    const w = await d.repo.create('wine', wineData({ vintage: null }));
    await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    const home = await homeView(contextOf(d) as AppContext);
    const vintageCard = [...home.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === 'Par millésime')!;
    expect(vintageCard.textContent).toContain(NOT_SET);
    click(vintageCard.querySelector(`.bars__btn[data-stat="${NOT_SET}"]`));
    expect(window.location.hash).toBe('#/liste');
    expect(savedFilters()).toMatchObject({ vintageNone: true, vintageMin: null, vintageMax: null });
    const list = wineListView(contextOf(d) as AppContext);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card').length).toBe(1));
  });
});

describe('Accueil : « Autres » des millésimes', () => {
  it('ouvre la Liste sur exactement les années regroupées', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-autres');
    await d.repo.createFurniture('M', 1);
    const shelf = (await d.repo.list('location'))[0]!;
    const years = Array.from({ length: 10 }, (_, i) => 2010 + i); // 10 années à 1 bouteille : 8 en tête, 2 dans « Autres »
    for (const y of years) {
      const w = await d.repo.create('wine', wineData({ cuvee: `V${y}`, vintage: y }));
      await d.repo.create('stock', { wine_id: w.id, location_id: shelf.id, quantity: 1, position_hint: null });
    }
    const ctx = contextOf(d) as AppContext;
    const home = await homeView(ctx);
    const card = [...home.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === 'Par millésime')!;
    const others = card.querySelector('.bars__btn[data-stat="Autres"]')!;
    expect(others).not.toBeNull();
    click(others);
    expect(window.location.hash).toBe('#/liste');
    const saved = savedFilters() as { vintages: number[] };
    expect(saved.vintages).toHaveLength(2);

    const list = wineListView(ctx);
    document.body.append(list);
    await waitFor(() => expect(list.querySelectorAll('.wine-card').length).toBe(2));
    expect(list.textContent).toContain('1 filtre');
    for (const y of saved.vintages) expect(list.textContent).toContain(String(y));
  });
});

describe('feuille de filtres : « Non millésimés (NV) »', () => {
  it('se coche à la main et renvoie vintageNone', async () => {
    const mk = (vintage: number | null) => ({ wine: { ...wineData({ vintage }), rev: 1, updated_at: '', deleted: false, id: `w${vintage}` }, quantity: 1, locations: [] });
    const rows = [mk(2019), mk(null)];
    const result = openFilterSheet({ rows, locations: [], furniture: [], filters: emptyFilters(), sort: { key: 'domain', dir: 'asc' }, counts: new Map() });
    const dlg = await waitFor(() => document.querySelector('dialog')!);
    const chip = [...dlg.querySelectorAll('label.chip')].find((l) => l.textContent?.includes('Non millésimés'))!;
    const box = chip.querySelector('input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => expect(dlg.textContent).toContain('Afficher 1 résultat'));
    click([...dlg.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Afficher')));
    expect((await result)?.vintageNone).toBe(true);
  });
});
