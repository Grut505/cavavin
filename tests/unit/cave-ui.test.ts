// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { caveConfigView } from '../../src/ui/views/cave-config';
import { caveView } from '../../src/ui/views/cave';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { makeDevice, makeSheet, wineData } from '../contract/helpers';

/** Marge large : les rendus jsdom ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });


async function ctxWithDevice(): Promise<{ ctx: AppContext; repo: Awaited<ReturnType<typeof makeDevice>>['repo'] }> {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-ui');
  return { ctx: { repo: d.repo } as unknown as AppContext, repo: d.repo };
}

const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('écran Cave', () => {
  it('propose de configurer une cave vide', async () => {
    const { ctx } = await ctxWithDevice();
    const el = await caveView(ctx);
    expect(el.textContent).toContain('Votre cave est vide');
    expect(el.querySelector('a[href="#/cave/config"]')).not.toBeNull();
  });

  it('affiche le schéma avec une ligne tactile par étagère, bouteilles comptées', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 3);
    await repo.createPlace('Cellier');
    const shelves = (await repo.list('location')).filter((l) => l.kind === 'shelf');
    const first = shelves.find((s) => s.name === 'Étagère 1')!;
    const wine = await repo.create('wine', wineData());
    await repo.create('stock', { wine_id: wine.id, location_id: first.id, quantity: 4, position_hint: null });

    const el = await caveView(ctx);
    const rows = el.querySelectorAll('.shelf');
    expect(rows).toHaveLength(3);
    const labels = [...rows].map((r) => r.getAttribute('aria-label'));
    expect(labels).toContain('Étagère 1, 4 bouteilles');
    expect(labels).toContain('Étagère 2, vide');
    expect(el.textContent).toContain('Cellier');
    expect(el.textContent).toContain('4 bouteilles');
    expect(el.querySelector(`[data-location-id="${first.id}"]`)!.querySelectorAll('.shelf__bottle').length).toBe(8); // 4 bouteilles × (col + corps)

    click(el.querySelector(`[data-location-id="${first.id}"]`));
    expect(window.location.hash).toBe(`#/etagere/${first.id}`);
  });
});

describe('écran Configurer la cave', () => {
  it('crée un meuble avec ses étagères et un lieu depuis les formulaires', async () => {
    const { ctx, repo } = await ctxWithDevice();
    const el = caveConfigView(ctx);
    document.body.append(el);
    await waitFor(() => expect(el.querySelectorAll('form')).toHaveLength(2));

    const [furnitureForm, placeForm] = [...el.querySelectorAll('form')];
    (furnitureForm!.querySelector('input[type=text]') as HTMLInputElement).value = 'Meuble du salon';
    (furnitureForm!.querySelector('input[type=number]') as HTMLInputElement).value = '4';
    furnitureForm!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(async () => expect((await repo.list('location')).length).toBe(4));
    await waitFor(() => expect(el.textContent).toContain('Meuble du salon'));

    (placeForm!.querySelector('input[type=text]') as HTMLInputElement).value = 'Cellier';
    placeForm!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(() => expect(el.textContent).toContain('Cellier'));
  });

  it('affiche l’erreur de règle quand le nom est déjà pris', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 2);
    const el = caveConfigView(ctx);
    document.body.append(el);
    await waitFor(() => expect(el.querySelectorAll('form')).toHaveLength(2));
    const form = el.querySelectorAll('form')[0]!;
    (form.querySelector('input[type=text]') as HTMLInputElement).value = 'meuble a';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(() => expect(el.querySelector('[role=alert]')?.textContent).toContain('existe déjà'));
    expect(await repo.list('furniture')).toHaveLength(1);
  });

  it('ajoute une étagère avec le bouton dédié', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 2);
    const el = caveConfigView(ctx);
    document.body.append(el);
    await waitFor(() => expect(el.textContent).toContain('Ajouter une étagère'));
    click([...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ajouter une étagère')));
    await waitFor(async () => expect((await repo.list('location')).length).toBe(3));
  });

  it('supprime une étagère non vide seulement après avoir choisi où ranger les bouteilles', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 2);
    const shelves = (await repo.list('location')).sort((a, b) => a.order - b.order);
    const wine = await repo.create('wine', wineData());
    await repo.create('stock', { wine_id: wine.id, location_id: shelves[0]!.id, quantity: 3, position_hint: null });

    const el = caveConfigView(ctx);
    document.body.append(el);
    await waitFor(() => expect(el.querySelector('[aria-label="Supprimer Étagère 1"]')).not.toBeNull());
    click(el.querySelector('[aria-label="Supprimer Étagère 1"]'));

    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    expect(dlg.textContent).toContain('3 bouteilles');
    // Rien n'est supprimé tant que l'utilisateur n'a pas choisi.
    expect((await repo.list('location')).length).toBe(2);

    click([...dlg.querySelectorAll('button')].find((b) => b.textContent?.includes('Déplacer puis supprimer')));
    await waitFor(async () => expect((await repo.list('location')).length).toBe(1));
    const stocks = (await repo.list('stock')).filter((s) => s.quantity > 0);
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ location_id: shelves[1]!.id, quantity: 3 });
  });
});

describe('détail d’un emplacement', () => {
  it('liste les bouteilles de l’étagère', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 1);
    const shelf = (await repo.list('location'))[0]!;
    const wine = await repo.create('wine', wineData({ domain: 'Domaine des Lys', cuvee: 'Les Pierres' }));
    await repo.create('stock', { wine_id: wine.id, location_id: shelf.id, quantity: 2, position_hint: 'gauche' });
    const el = await shelfDetailView(ctx, { id: shelf.id });
    expect(el.textContent).toContain('Étagère 1');
    expect(el.textContent).toContain('Domaine des Lys');
    expect(el.textContent).toContain('×2');
    expect(el.textContent).toContain('Position : gauche');
    expect(el.querySelector(`a[href^="#/vin/${wine.id}?from="]`)).not.toBeNull(); // lien vers la fiche, qui mémorise l'étagère d'origine
  });

  it('signale un emplacement inexistant', async () => {
    const { ctx } = await ctxWithDevice();
    const el = await shelfDetailView(ctx, { id: 'nope' });
    expect(el.textContent).toContain('introuvable');
  });
});

describe('vue graphique d’une étagère', () => {
  it('place chaque bouteille dans sa zone, sans position dans la bande dédiée', async () => {
    const { ctx, repo } = await ctxWithDevice();
    await repo.createFurniture('Meuble A', 1);
    const shelf = (await repo.list('location')).find((l) => l.kind === 'shelf')!;
    const a = await repo.create('wine', wineData());
    const b = await repo.create('wine', wineData({ cuvee: 'Autre' }));
    await repo.create('stock', { wine_id: a.id, location_id: shelf.id, quantity: 3, position_hint: 'gauche' });
    await repo.create('stock', { wine_id: b.id, location_id: shelf.id, quantity: 2, position_hint: null });

    const el = await shelfDetailView(ctx, { id: shelf.id });
    expect(el.querySelectorAll('[data-zone="gauche"] .sv__bottle')).toHaveLength(3);
    expect(el.querySelectorAll('[data-zone="droite"] .sv__bottle')).toHaveLength(0);
    expect(el.querySelectorAll('[data-zone="none"] .sv__bottle')).toHaveLength(2);
  });
});
