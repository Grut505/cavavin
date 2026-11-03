// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { LIST_PAGE_SIZE, wineListView } from '../../src/ui/views/wine-list';
import { makeDevice, makeSheet, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 8000, interval: 25 });
const cards = (root: HTMLElement): number => root.querySelectorAll('.wine-card').length;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Liste : chargement progressif', () => {
  it('affiche 100 fiches, puis 100 de plus au bouton, sans reconstruire les premières', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-paging');
    await d.repo.createFurniture('Meuble', 1);
    const shelf = (await d.repo.list('location'))[0]!;
    for (let i = 0; i < 250; i++) {
      await d.repo.addWine(wineFields({ domain: `D${i}`, cuvee: 'C', appellation: `A${String(i).padStart(3, '0')}` }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    }
    const view = wineListView({ repo: d.repo } as unknown as AppContext);
    document.body.append(view);

    await waitFor(() => expect(cards(view)).toBe(LIST_PAGE_SIZE));
    expect(view.textContent).toContain('250 fiches'); // le total reste affiché
    const labels = [...view.querySelector('.swipe')!.querySelectorAll('.swipe__action')].map((b) => b.textContent);
    expect(labels).toEqual(['Modifier', 'Sortir']); // actions révélées par un balayage
    const first = view.querySelector('.wine-card');
    const more = view.querySelector<HTMLButtonElement>('.list__more')!;
    expect(more.textContent).toBe('Afficher les 100 suivantes (150 restantes)');

    more.click();
    expect(cards(view)).toBe(200);
    expect(view.querySelector(".wine-card")).toBe(first); // cartes déjà affichées conservées

    view.querySelector<HTMLButtonElement>('.list__more')!.click();
    expect(cards(view)).toBe(250);
    expect(view.querySelector('.list__more')).toBeNull();

    // une recherche repart de la première page
    const input = view.querySelector<HTMLInputElement>('#wine-search')!;
    input.value = 'D1';
    input.dispatchEvent(new Event('input'));
    await waitFor(() => expect(view.textContent).toContain('111 résultats')); // D1, D10-D19, D100-D199
    expect(cards(view)).toBe(LIST_PAGE_SIZE);
    expect(view.querySelector('.list__more')!.textContent).toBe('Afficher les 11 suivantes (11 restantes)');
  }, 60_000);
});
