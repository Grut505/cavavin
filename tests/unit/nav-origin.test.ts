// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { originPath, originQuery, wineBack, wineHref } from '../../src/ui/nav-origin';
import { Router } from '../../src/ui/router';
import { h } from '../../src/ui/dom';
import { homeView } from '../../src/ui/views/home';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { wineDetailView } from '../../src/ui/views/wine-detail';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('origine de navigation', () => {
  it('mémorise l’écran courant dans le lien vers une fiche, et le relit', () => {
    window.location.hash = '#/etagere/abc';
    expect(wineHref('w1')).toBe('#/vin/w1?from=%2Fetagere%2Fabc');
    window.location.hash = '#/vin/w1?from=%2Fetagere%2Fabc';
    expect(originPath()).toBe('/etagere/abc');
    expect(originQuery()).toBe('?from=%2Fetagere%2Fabc');
    expect(wineBack()).toEqual({ href: '#/etagere/abc', label: 'Retour à l’étagère' });
  });

  it('sans origine, ou avec une origine invalide, retombe sur la Liste', () => {
    window.location.hash = '#/vin/w1';
    expect(wineBack()).toEqual({ href: '#/liste', label: 'Retour à la liste' });
    for (const bad of ['%2Fvin%2Fw2', 'http%3A%2F%2Fevil.example', '..%2F..', '%2F%3Cscript%3E']) {
      window.location.hash = `#/vin/w1?from=${bad}`;
      expect(originPath(), bad).toBeNull();
    }
  });

  it('libellés selon l’origine', () => {
    const label = (from: string): string => {
      window.location.hash = `#/vin/w1?from=${encodeURIComponent(from)}`;
      return wineBack().label;
    };
    expect(label('/stats')).toBe('Retour aux stats');
    expect(label('/accueil')).toBe('Retour aux stats'); // ancien nom
    expect(label('/cave')).toBe('Retour à la cave');
    expect(label('/personne/p1')).toBe('Retour à la personne');
    expect(label('/historique')).toBe('Retour à l’historique');
    expect(label('/liste')).toBe('Retour à la liste');
  });

  it('une fiche ouverte depuis une étagère ramène à l’étagère', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-nav');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const wine = await d.repo.addWine(wineFields(), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    const ctx = contextOf(d) as AppContext;

    window.location.hash = `#/etagere/${shelf.id}`;
    const shelfView = await shelfDetailView(ctx, { id: shelf.id });
    const link = shelfView.querySelector('a.wine-card')!.getAttribute('href')!;
    expect(link).toBe(`#/vin/${wine.id}?from=${encodeURIComponent(`/etagere/${shelf.id}`)}`);

    window.location.hash = link;
    const detail = await wineDetailView(ctx, { id: wine.id });
    const back = detail.querySelector('.app-header a.icon-btn')!;
    expect(back.getAttribute('href')).toBe(`#/etagere/${shelf.id}`);
    expect(back.getAttribute('aria-label')).toBe('Retour à l’étagère');
    // « Modifier » conserve l’origine pour que le retour reste cohérent
    expect(detail.querySelector('a[aria-label="Modifier la fiche"]')!.getAttribute('href')).toBe(`#/vin/${wine.id}/modifier${originQuery()}`);

    // sans origine : retour à la Liste comme avant
    window.location.hash = `#/vin/${wine.id}`;
    const plain = await wineDetailView(ctx, { id: wine.id });
    expect(plain.querySelector('.app-header a.icon-btn')!.getAttribute('href')).toBe('#/liste');
  });

  it('toucher une bouteille du schéma graphique de l’étagère garde aussi l’origine', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-nav-graph');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const wine = await d.repo.addWine(wineFields(), [{ location_id: shelf.id, quantity: 1, position_hint: 'milieu-gauche' }]);
    window.location.hash = `#/etagere/${shelf.id}`;
    const view = await shelfDetailView(contextOf(d) as AppContext, { id: shelf.id });
    document.body.append(view);
    view.querySelector('.sv__bottle')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe(`#/vin/${wine.id}?from=${encodeURIComponent(`/etagere/${shelf.id}`)}`);
    expect(wineBack().href).toBe(`#/etagere/${shelf.id}`);
  });

  it('l’écran Stats envoie vers la fiche avec son origine', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-home-nav');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const year = new Date().getFullYear();
    const wine = await d.repo.addWine(wineFields({ drink_from: year - 1, drink_until: year + 3 }), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    window.location.hash = '#/stats';
    const el = await homeView(contextOf(d) as AppContext);
    expect(el.querySelector('.tbd a.btn')!.getAttribute('href')).toBe(`#/vin/${wine.id}?from=%2Fstats`);
  });

  it('l’onglet allumé est celui de l’origine, pas toujours la Liste', async () => {
    const root = h('div');
    document.body.append(root);
    const page = (label: string) => () => h('main', { class: 'view' }, label);
    window.location.hash = '#/vin/w1?from=%2Fetagere%2F9';
    new Router(
      {} as AppContext,
      [
        { path: '/stats', nav: { label: 'Stats', icon: 'stats' }, render: page('a') },
        { path: '/cave', nav: { label: 'Cave', icon: 'cave' }, render: page('c') },
        { path: '/etagere/:id', parent: '/cave', render: page('e') },
        { path: '/liste', nav: { label: 'Liste', icon: 'list' }, render: page('l') },
        { path: '/vin/:id', parent: '/liste', followsOrigin: true, render: page('v') },
      ],
      '/stats',
    ).mount(root);
    await waitFor(() => expect(root.querySelector('nav [aria-current="page"]')).not.toBeNull());
    expect(root.querySelector('nav [aria-current="page"]')!.textContent).toContain('Cave');

    window.location.hash = '#/vin/w1';
    await waitFor(() => expect(root.querySelector('nav [aria-current="page"]')!.textContent).toContain('Liste'));
  });
});
