// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/app';
import type { Stock, Wine } from '../../src/domain/types';
import { urgencyCounts, waitingCount } from '../../src/domain/urgency';
import { todrinkSummary } from '../../src/ui/components/todrink-summary';
import { caveView } from '../../src/ui/views/cave';
import { contextOf, makeDevice, makeSheet, wineData, wineFields } from '../contract/helpers';

const Y = 2026;
let n = 0;
const wine = (over: Partial<Wine>): Wine => ({ ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `t${++n}` });
const stock = (w: Wine, quantity: number): Stock => ({ id: `s${++n}`, rev: 1, updated_at: '', deleted: false, wine_id: w.id, location_id: 'L', quantity, position_hint: null });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('comptage par urgence', () => {
  const late = wine({ drink_from: 2000, drink_until: 2010 });
  const finishing = wine({ drink_from: 2020, drink_until: 2027 });
  const now = wine({ drink_from: 2020, drink_until: 2040 });
  const soon = wine({ drink_from: 2027, drink_until: 2040 });
  const early = wine({ drink_from: 2035, drink_until: 2050 });
  const unknown = wine({ drink_from: null, drink_until: null });
  const all = [late, finishing, now, soon, early, unknown];

  it('compte les bouteilles de chaque catégorie, sans les stocks épuisés ni supprimés', () => {
    const stocks = [stock(late, 2), stock(finishing, 3), stock(now, 5), stock(soon, 1), stock(early, 4), stock(unknown, 1), stock(now, 0), { ...stock(late, 9), deleted: true }];
    const c = urgencyCounts(stocks, all, Y);
    expect(c).toEqual({ late: 2, finishing: 3, now: 5, soon: 1, early: 4, unknown: 1 });
    expect(waitingCount(c)).toBe(5); // « à attendre » = bientôt + trop tôt
  });
});

describe('bouton « À boire » de la Cave', () => {
  it('résume en barre et en compteurs : en retard, à finir, à point, à attendre', () => {
    const late = wine({ drink_from: 2000, drink_until: 2010 });
    const now = wine({ drink_from: 2020, drink_until: 2040 });
    const soon = wine({ drink_from: 2027, drink_until: 2040 });
    const early = wine({ drink_from: 2035, drink_until: 2050 });
    const el = todrinkSummary([stock(late, 2), stock(now, 6), stock(soon, 1), stock(early, 3)], [late, now, soon, early], Y);
    expect(el.getAttribute('href')).toBe('#/stats?go=a-boire');
    const counts = [...el.querySelectorAll('.cave-todrink__count')].map((li) => [li.querySelector('.cave-todrink__l')!.textContent, li.querySelector('.cave-todrink__n')!.textContent]);
    expect(counts).toEqual([['En retard', '2'], ['À finir', '0'], ['À point', '6'], ['À attendre', '4']]);
    expect(el.querySelectorAll('.cave-todrink__count--zero')).toHaveLength(1); // « à finir » à 0 est estompé
    // barre proportionnelle : un segment par catégorie non vide (retard, à point, bientôt, trop tôt), largeur = nombre de bouteilles
    const segs = [...el.querySelectorAll('.cave-todrink__seg')].map((s) => [s.className.match(/u-fill--(\w+)/)![1], (s as HTMLElement).style.flex.split(' ')[0]]);
    expect(segs).toEqual([['late', '2'], ['now', '6'], ['soon', '1'], ['early', '3']]);
    expect(el.getAttribute('aria-label')).toBe('À boire : 2 en retard, 0 à finir, 6 à point, 4 à attendre. Ouvrir le détail.');
  });

  it('sans bouteille : une barre neutre et « aucune bouteille » pour les lecteurs d’écran', () => {
    const el = todrinkSummary([], [], Y);
    expect(el.querySelectorAll('.cave-todrink__seg')).toHaveLength(1);
    expect(el.querySelector('.cave-todrink__seg')!.className).toContain('u-fill--unknown');
    expect(el.getAttribute('aria-label')).toContain('aucune bouteille');
  });

  it('s’affiche en tête de la Cave, avec « Quoi boire ? » à côté', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-summary');
    await d.repo.createFurniture('Armoire', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const year = new Date().getFullYear();
    await d.repo.addWine(wineFields({ drink_from: year - 10, drink_until: year - 2 }), [{ location_id: shelf.id, quantity: 2, position_hint: null }]);
    await d.repo.addWine(wineFields({ cuvee: 'B', drink_from: year - 1, drink_until: year + 9 }), [{ location_id: shelf.id, quantity: 4, position_hint: null }]);
    const el = await caveView(contextOf(d) as AppContext);
    const actions = el.querySelector('.cave-actions')!;
    expect(actions.children[0]!.classList.contains('cave-todrink')).toBe(true);
    expect(actions.children[1]!.textContent).toBe('Quoi boire ?');
    const numbers = [...actions.querySelectorAll('.cave-todrink__n')].map((e) => e.textContent);
    expect(numbers).toEqual(['2', '0', '4', '0']); // en retard, à finir, à point, à attendre
  });
});
