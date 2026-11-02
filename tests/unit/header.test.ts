// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderShelfPosition } from '../../src/ui/cave-map/shelf-position';
import { pageHeader } from '../../src/ui/components/page-header';
import { addHubView } from '../../src/ui/views/add-hub';
import { addWineView, editWineView } from '../../src/ui/views/add-wine';
import { historyView } from '../../src/ui/views/history';
import { wineDetailView } from '../../src/ui/views/wine-detail';
import { caveConfigView } from '../../src/ui/views/cave-config';
import { caveView } from '../../src/ui/views/cave';
import { personsView } from '../../src/ui/views/personnes';
import { proposalsView } from '../../src/ui/views/proposals';
import { settingsView } from '../../src/ui/views/settings';
import { wineListView } from '../../src/ui/views/wine-list';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

describe('en-tête commun', () => {
  it('affiche titre, sous-titre, retour et actions', () => {
    const action = document.createElement('button');
    const el = pageHeader({ title: 'Cave', subtitle: '12 bouteilles', back: '#/x', backLabel: 'Retour', actions: [action, null] });
    expect(el.tagName).toBe('HEADER');
    expect(el.className).toBe('app-header');
    expect(el.querySelector('h1')?.textContent).toBe('Cave');
    expect(el.querySelector('p')?.textContent).toBe('12 bouteilles');
    expect(el.querySelector('a[href="#/x"]')?.getAttribute('aria-label')).toBe('Retour');
    expect(el.querySelector('.app-header__actions button')).toBe(action);
  });

  it('omet les parties absentes', () => {
    const el = pageHeader({ title: 'Réglages' });
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('p')).toBeNull();
    expect(el.querySelector('.app-header__actions')).toBeNull();
  });

  it('est le premier élément de chaque écran à onglet ou sous-écran', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-h');
    await d.repo.createFurniture('Meuble A', 1);
    const shelf = (await d.repo.list('location'))[0]!;
    const wine = await d.repo.addWine(wineFields(), [{ location_id: shelf.id, quantity: 1, position_hint: null }]);
    const ctx = contextOf(d);
    const views: [string, HTMLElement][] = [
      ['cave', await caveView(ctx)],
      ['cave vide', await caveView(contextOf(await makeDevice(await makeSheet(), 'x')))],
      ['config', caveConfigView(ctx)],
      ['étagère', await shelfDetailView(ctx, { id: shelf.id })],
      ['étagère absente', await shelfDetailView(ctx, { id: 'nope' })],
      ['réglages', await settingsView(ctx)],
      ['liste', wineListView(ctx)],
      ['personnes', personsView(ctx)],
      ['historique', await historyView(ctx)],
      ['détail', await wineDetailView(ctx, { id: wine.id })],
      ['détail absent', await wineDetailView(ctx, { id: 'nope' })],
      ['modification', await editWineView(ctx, { id: wine.id })],
      ['modification absente', await editWineView(ctx, { id: 'nope' })],
      ['ajouter', await addHubView(ctx)],
      ['saisie', await addWineView(ctx)],
      ['propositions', await proposalsView(ctx)],
    ];
    for (const [name, el] of views) {
      expect(el.firstElementChild?.classList.contains('app-header'), `en-tête de « ${name} »`).toBe(true);
      expect(el.querySelectorAll('header.app-header'), `un seul en-tête sur « ${name} »`).toHaveLength(1);
    }
  });
});

describe('feuille de style : en-tête collant', () => {
  const css = readFileSync('src/ui/styles/base.css', 'utf-8');
  it('l’en-tête est collé en haut et au-dessus du contenu', () => {
    const rule = /\.app-header\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/top:\s*0/);
    expect(rule).toMatch(/z-index:\s*\d+/);
    expect(rule).toMatch(/safe-top/); // la zone de l'encoche reste couverte
  });
  it('aucun overflow sur <body> (il neutraliserait position: sticky)', () => {
    const body = /(?:^|\n)(?:html,\s*)?body\s*\{([^}]*)\}/g;
    for (const m of css.matchAll(body)) expect(m[1]).not.toMatch(/overflow/);
  });
});

describe('choix de la position sur l’étagère', () => {
  it('sélectionne, désélectionne et notifie', () => {
    const onChange = vi.fn();
    const p = renderShelfPosition({ shelfName: 'Étagère 1', selected: null, onChange });
    const zone = (h: string): Element => p.el.querySelector(`[data-hint="${h}"]`)!;
    zone('gauche').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(p.value()).toBe('gauche');
    expect(zone('gauche').getAttribute('aria-checked')).toBe('true');
    zone('droite').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(p.value()).toBe('droite');
    expect(zone('gauche').getAttribute('aria-checked')).toBe('false');
    zone('droite').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(p.value()).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('se commande au clavier et propose les quatre zones', () => {
    const p = renderShelfPosition({ shelfName: 'E', selected: 'dessous' });
    expect([...p.el.querySelectorAll('[data-hint]')].map((e) => e.getAttribute('data-hint')).sort()).toEqual(
      ['dessous', 'dessus', 'droite', 'gauche'],
    );
    expect(p.value()).toBe('dessous');
    p.el.querySelector('[data-hint="dessus"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(p.value()).toBe('dessus');
    p.el.querySelector('[data-hint="dessus"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(p.value()).toBeNull();
  });
});
