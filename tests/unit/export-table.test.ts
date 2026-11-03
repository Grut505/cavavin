// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { cellarCsv, csvCell, csvFileName } from '../../src/domain/export';
import type { WineRow } from '../../src/domain/query';
import type { Person, Wine } from '../../src/domain/types';
import { exportCard } from '../../src/ui/components/export-card';
import { homeView } from '../../src/ui/views/home';
import { wineDetailView } from '../../src/ui/views/wine-detail';
import { contextOf, makeDevice, makeSheet, wineData, wineFields } from '../contract/helpers';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

let n = 0;
const wine = (over: Partial<Wine> = {}): Wine => ({ ...wineData(over), rev: 1, updated_at: '', deleted: false, id: `e${++n}` });
const row = (w: Wine, quantity = 1): WineRow => ({ wine: w, quantity, locations: [{ id: 'L', label: 'Armoire · Étagère 1', order: 1 }] });

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('export CSV', () => {
  it('protège les cellules : guillemets, point-virgule, retour à la ligne et formules', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvCell('=SOMME(A1)')).toBe("'=SOMME(A1)"); // jamais interprété comme formule
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5')).toBe('-5'); // un vrai nombre reste un nombre
    expect(csvCell(null)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('une ligne par fiche, en-têtes, BOM et séparateur « ; », prix à la française', () => {
    const persons = [{ id: 'P1', name: 'Marie' } as Person];
    const csv = cellarCsv(
      [
        row(wine({ domain: 'Zed', cuvee: 'Z', vintage: null, purchase_price: 12.5, gift: true, gift_from: 'P1', pairings: 'risotto; gratin' }), 3),
        row(wine({ domain: 'Alpha', cuvee: 'A', notes: 'dit "bien"' }), 0),
        row({ ...wine({ domain: 'Supprimée' }), deleted: true }),
      ],
      persons,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3); // en-têtes + 2 fiches (la supprimée est exclue)
    expect(lines[0]).toContain('Domaine;Cuvée;Millésime');
    expect(lines[1]!.startsWith('Alpha;A;2019')).toBe(true); // tri par domaine
    expect(lines[1]).toContain('"dit ""bien"""');
    expect(lines[2]).toContain('Zed;Z;NV');
    expect(lines[2]).toContain(';3;Armoire · Étagère 1;');
    expect(lines[2]).toContain(';12,5;');
    expect(lines[2]).toContain('risotto, gratin;Marie;');
    expect(csvFileName(new Date(2026, 10, 3))).toBe('cavavin-2026-11-03.csv');
  });

  it('la carte des Réglages télécharge le fichier et indique le nombre de fiches', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-export');
    await d.repo.addWine(wineFields({ domain: 'Alpha' }), []);
    await d.repo.addWine(wineFields({ domain: 'Bravo' }), []);
    const download = vi.fn();
    const card = exportCard(contextOf(d) as AppContext, download);
    document.body.append(card);
    click(card.querySelector('button'));
    await waitFor(() => expect(card.textContent).toContain('2 fiches exportées'));
    expect(download).toHaveBeenCalledTimes(1);
    const [name, csv] = download.mock.calls[0] as unknown as [string, string];
    expect(name).toMatch(/^cavavin-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv).toContain('Alpha');
    expect(csv).toContain('Bravo');
  });
});

describe('mets cliquables', () => {
  it('la fiche propose « À table » et chaque met ouvre la recherche préremplie', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-table');
    const w = await d.repo.addWine(wineFields({ pairings: 'risotto aux champignons; gratin dauphinois' }), []);
    const ctx = contextOf(d) as AppContext;
    const detail = await wineDetailView(ctx, { id: w.id });
    const chip = [...detail.querySelectorAll('section[aria-label="À table"] a')].find((a) => a.textContent === 'risotto aux champignons')!;
    expect(chip.getAttribute('href')).toBe('#/accueil?plat=risotto%20aux%20champignons');

    window.location.hash = chip.getAttribute('href')!;
    const home = await homeView(ctx);
    expect((home.querySelector('#dish') as HTMLInputElement).value).toBe('risotto aux champignons');
  });
});
