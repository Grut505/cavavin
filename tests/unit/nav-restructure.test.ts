// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { activeFilterCount, emptyFilters, queryRows, type WineRow } from '../../src/domain/query';
import type { Wine } from '../../src/domain/types';
import { openFilterSheet } from '../../src/ui/components/filter-sheet';
import { h } from '../../src/ui/dom';
import { Router } from '../../src/ui/router';
import { wineData } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
let n = 0;
const row = (over: Partial<Wine>, quantity = 1): WineRow => ({
  wine: { ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `r${++n}` },
  quantity,
  locations: [],
});

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('ancien chemin « Accueil »', () => {
  it('renvoie vers l’écran Stats en conservant la requête', async () => {
    const root = h('div');
    document.body.append(root);
    window.location.hash = '#/accueil?go=a-boire';
    new Router(
      {} as AppContext,
      [
        { path: '/cave', nav: { label: 'Cave', icon: 'cave' }, render: () => h('main', {}, 'cave') },
        { path: '/stats', nav: { label: 'Stats', icon: 'stats' }, render: () => h('main', {}, 'stats') },
        { path: '/accueil', redirect: '/stats', render: () => h('main') },
      ],
      '/cave',
    ).mount(root);
    await waitFor(() => expect(root.textContent).toContain('stats'));
    expect(window.location.hash).toBe('#/stats?go=a-boire');
    expect([...root.querySelectorAll('nav a')].map((a) => a.getAttribute('href'))).toEqual(['#/cave', '#/stats']);
  });
});

describe('filtre « plat » de la Liste', () => {
  const rows = [
    row({ cuvee: 'A', pairings: 'risotto aux champignons; gratin', drink_from: 2020, drink_until: 2040 }),
    row({ cuvee: 'B', pairings: 'risotto', drink_from: 2000, drink_until: 2010 }), // en retard : moins bien classée
    row({ cuvee: 'C', pairings: 'curry de légumes' }),
    row({ cuvee: 'D', pairings: null }),
    row({ cuvee: 'E', pairings: 'risotto' }, 0), // épuisée : jamais proposée sans l'historique
  ];
  const names = (dish: string, extra: Partial<ReturnType<typeof emptyFilters>> = {}): string[] =>
    queryRows(rows, { ...emptyFilters(), dish, ...extra }, { key: 'domain', dir: 'asc' }, 2026).map((r) => r.wine.cuvee);

  it('retrouve les fiches dont les mets correspondent, fautes de frappe tolérées, les plus à point d’abord', () => {
    expect(names('risoto aux champignon')).toEqual(['A', 'B']); // « risotto » seul suffit (moitié des mots), correspondance complète en tête
    expect(names('risotto')).toEqual(['A', 'B']); // « à point » avant « en retard »
    expect(names('curry')).toEqual(['C']);
    expect(names('magret de canard')).toEqual([]);
    expect(names('  ')).toEqual(['A', 'B', 'C', 'D']); // plat vide : aucun filtre
    expect(names('risotto', { includeHistory: true })).toEqual(['A', 'B', 'E']);
  });

  it('compte comme un critère et se combine avec les autres filtres', () => {
    expect(activeFilterCount({ ...emptyFilters(), dish: 'risotto' })).toBe(1);
    expect(activeFilterCount({ ...emptyFilters(), dish: '   ' })).toBe(0);
    expect(names('risotto', { maturity: ['late'] })).toEqual(['B']);
  });

  it('se saisit dans la feuille de filtres', async () => {
    const result = openFilterSheet({ rows, locations: [], furniture: [], filters: emptyFilters(), sort: { key: 'domain', dir: 'asc' }, counts: new Map() });
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('absent');
      return d;
    });
    const input = dlg.querySelector('input[aria-label="Plat ou ingrédient"]') as HTMLInputElement;
    input.value = 'curry';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => expect(dlg.textContent).toContain('Afficher 1 résultat'));
    [...dlg.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Afficher'))!.click();
    expect((await result)?.dish).toBe('curry');
  });
});
