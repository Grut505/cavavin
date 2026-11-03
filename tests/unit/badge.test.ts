// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { urgentBottles } from '../../src/domain/maturity';
import type { WineRow } from '../../src/domain/query';
import { h } from '../../src/ui/dom';
import { Router } from '../../src/ui/router';
import { wineData } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
let n = 0;
const row = (over: Parameters<typeof wineData>[0], quantity = 1): WineRow => ({
  wine: { ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `b${++n}` },
  quantity,
  locations: [],
});

describe('bouteilles à boire en priorité', () => {
  it('compte les bouteilles en retard et à finir, pas les autres', () => {
    const rows = [
      row({ drink_from: 2000, drink_until: 2010 }, 2), // en retard
      row({ drink_from: 2020, drink_until: 2027 }, 3), // à finir (fin l'an prochain)
      row({ drink_from: 2020, drink_until: 2040 }, 5), // à point
      row({ drink_from: 2040, drink_until: 2050 }, 4), // trop tôt
      row({ drink_from: 2000, drink_until: 2010 }, 0), // épuisée
    ];
    expect(urgentBottles(rows, 2026)).toBe(5);
    expect(urgentBottles([], 2026)).toBe(0);
  });
});

describe('pastille sur un onglet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '#/cave';
  });
  const page = () => h('main', { class: 'view' }, 'x');

  it('s’affiche, se met à jour sur place, se retire à zéro et complète le nom lu à voix haute', async () => {
    const root = h('div');
    document.body.append(root);
    const router = new Router(
      {} as AppContext,
      [
        { path: '/cave', nav: { label: 'Cave', icon: 'cave' }, render: page },
        { path: '/stats', nav: { label: 'Stats', icon: 'stats' }, render: page },
      ],
      '/cave',
    );
    router.mount(root);
    await waitFor(() => expect(root.querySelector('nav')).not.toBeNull());
    expect(root.querySelector('.nav__badge')).toBeNull();

    router.setBadge('/cave', 3, '3 bouteilles à boire en priorité');
    const tab = root.querySelector('nav a[href="#/cave"]')!;
    expect(tab.querySelector('.nav__badge')!.textContent).toBe('3');
    expect(tab.getAttribute('aria-label')).toBe('Cave, 3 bouteilles à boire en priorité');
    expect(root.querySelector('nav a[href="#/stats"] .nav__badge')).toBeNull();

    router.setBadge('/cave', 12, '12 bouteilles à boire en priorité');
    expect(tab.querySelector('.nav__badge')!.textContent).toBe('9+');
    expect(tab.querySelectorAll('.nav__badge')).toHaveLength(1);

    router.setBadge('/cave', 0, '');
    expect(tab.querySelector('.nav__badge')).toBeNull();
    expect(tab.hasAttribute('aria-label')).toBe(false);

    // la pastille survit au changement d'écran (la barre est reconstruite)
    router.setBadge('/cave', 2, '2 bouteilles à boire en priorité');
    window.location.hash = '#/stats';
    await waitFor(() => expect(root.querySelector('nav a[href="#/stats"][aria-current="page"]')).not.toBeNull());
    expect(root.querySelector('nav a[href="#/cave"] .nav__badge')!.textContent).toBe('2');
  });
});
