// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { addWineView } from '../../src/ui/views/add-wine';
import { makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });

async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-form');
  await d.repo.createFurniture('Meuble A', 1);
  const shelf = (await d.repo.list('location'))[0]!;
  const place = [{ location_id: shelf.id, quantity: 1, position_hint: null }];
  return { ctx: { repo: d.repo, db: d.db } as unknown as AppContext, repo: d.repo, place };
}

const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const setValue = (el: Element | null, value: string): void => {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));
const submit = (root: HTMLElement): void => {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};
const value = (view: HTMLElement, id: string): string => (view.querySelector(`#f-${id}`) as HTMLInputElement).value;
const options = (view: HTMLElement, listId: string): string[] =>
  [...view.querySelectorAll(`#${listId} option`)].map((o) => o.getAttribute('value') ?? '');
const dialog = (): Promise<HTMLDialogElement> =>
  waitFor(() => {
    const d = document.querySelector('dialog');
    if (!d) throw new Error('dialogue absent');
    return d;
  });

/** Renseigne les champs obligatoires (le format a une valeur par défaut). */
function fill(view: HTMLElement, over: Partial<Record<'cuvee' | 'vintage' | 'appellation' | 'color', string>> = {}): void {
  const v = { cuvee: 'Les Pierres', vintage: '2019', appellation: 'Saint-Joseph', color: 'rouge', ...over };
  for (const [k, val] of Object.entries(v)) setValue(view.querySelector(`#f-${k}`), val);
}
async function pickFirstShelf(view: HTMLElement): Promise<void> {
  click(byText(view, 'button', 'Choisir un emplacement'));
  const dlg = await waitFor(() => {
    const d = document.querySelector('dialog');
    if (!d || !d.querySelector('.shelf')) throw new Error('sélecteur absent');
    return d;
  });
  click(dlg.querySelector('.shelf'));
  await waitFor(() => expect(dlg.querySelector('[data-hint]')).not.toBeNull());
  click(byText(dlg, 'button', 'Valider'));
  await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
}
async function open(ctx: AppContext): Promise<HTMLElement> {
  const view = await addWineView(ctx);
  document.body.append(view);
  return view;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('champs obligatoires', () => {
  it('étoile et attribut « required » sur cuvée, millésime, appellation, couleur, format — et eux seuls', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    const label = (id: string): string => view.querySelector(`label[for="f-${id}"] .field__label`)?.textContent ?? '';
    for (const id of ['cuvee', 'vintage', 'appellation', 'color', 'format']) {
      expect(label(id), id).toMatch(/ \*$/);
      expect(view.querySelector(`#f-${id}`)?.hasAttribute('required'), id).toBe(true);
    }
    for (const id of ['domain', 'region', 'country', 'tannin', 'dryness', 'drink_from', 'drink_until', 'purchase_price', 'supplier', 'notes']) {
      expect(label(id), id).not.toMatch(/\*/);
      expect(view.querySelector(`#f-${id}`)?.hasAttribute('required'), id).toBe(false);
    }
  });

  it('s’enregistre sans domaine', async () => {
    const { ctx, repo } = await setup();
    const view = await open(ctx);
    fill(view);
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ domain: '', cuvee: 'Les Pierres', vintage: 2019, appellation: 'Saint-Joseph', color: 'rouge', format: '75cl' });
  });

  it('accepte « NV » comme millésime', async () => {
    const { ctx, repo } = await setup();
    const view = await open(ctx);
    fill(view, { vintage: 'NV', color: 'effervescent', cuvee: 'Brut' });
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ vintage: null });
  });
});

describe('les erreurs disparaissent dès que l’on saisit', () => {
  const errorOf = (view: HTMLElement, id: string): string => view.querySelector(`#e-${id}`)?.textContent ?? '';
  const invalid = (view: HTMLElement, id: string): boolean => view.querySelector(`#f-${id}`)?.getAttribute('aria-invalid') === 'true';

  it('efface l’erreur d’un champ texte dès la première frappe, sans toucher aux autres', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    submit(view);
    await waitFor(() => expect(errorOf(view, 'cuvee')).toContain('obligatoire'));
    for (const id of ['cuvee', 'vintage', 'appellation', 'color']) {
      expect(invalid(view, id), id).toBe(true);
    }
    setValue(view.querySelector('#f-cuvee'), 'L');
    expect(errorOf(view, 'cuvee')).toBe('');
    expect(invalid(view, 'cuvee')).toBe(false);
    // Les autres champs obligatoires restent signalés tant qu'ils ne sont pas remplis.
    for (const id of ['vintage', 'appellation', 'color']) {
      expect(errorOf(view, id), id).toContain('obligatoire');
      expect(invalid(view, id), id).toBe(true);
    }
  });

  it('efface aussi l’erreur d’une liste déroulante et celle d’un millésime invalide', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    setValue(view.querySelector('#f-vintage'), '1500');
    submit(view);
    await waitFor(() => expect(errorOf(view, 'vintage')).toContain('Millésime invalide'));
    setValue(view.querySelector('#f-color'), 'blanc');
    expect(errorOf(view, 'color')).toBe('');
    setValue(view.querySelector('#f-vintage'), '1500x');
    expect(errorOf(view, 'vintage')).toBe('');
    expect(invalid(view, 'vintage')).toBe(false);
  });

  it('efface l’erreur d’emplacement quand on choisit une étagère', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    fill(view);
    submit(view);
    await waitFor(() => expect(view.textContent).toContain('Choisissez au moins un emplacement'));
    await pickFirstShelf(view);
    expect(view.textContent).not.toContain('Choisissez au moins un emplacement');
  });

  it('une erreur réapparaît si le champ est toujours invalide au prochain enregistrement', async () => {
    const { ctx } = await setup();
    const view = await open(ctx);
    submit(view);
    await waitFor(() => expect(errorOf(view, 'cuvee')).toContain('obligatoire'));
    setValue(view.querySelector('#f-cuvee'), 'abc');
    setValue(view.querySelector('#f-cuvee'), '');
    expect(errorOf(view, 'cuvee')).toBe('');
    submit(view);
    await waitFor(() => expect(errorOf(view, 'cuvee')).toContain('obligatoire'));
  });
});

describe('autocomplétion alimentée par la cave', () => {
  async function withCave() {
    const s = await setup();
    await s.repo.addWine(wineFields({ cuvee: 'A', vintage: 2021, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' }), s.place);
    await s.repo.addWine(wineFields({ cuvee: 'B', vintage: 2015, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' }), s.place);
    await s.repo.addWine(wineFields({ cuvee: 'C', vintage: 2015, appellation: 'Pauillac', region: 'Bordeaux', country: 'France' }), s.place);
    return s;
  }

  it('propose les valeurs déjà utilisées pour appellation, région, pays et millésime', async () => {
    const { ctx } = await withCave();
    const view = await addWineView(ctx);
    for (const [id, list] of [['vintage', 'dl-vintage'], ['appellation', 'dl-appellation'], ['region', 'dl-region'], ['country', 'dl-country']]) {
      expect(view.querySelector(`#f-${id}`)?.getAttribute('list'), id).toBe(list);
    }
    expect(options(view, 'dl-appellation')).toEqual(['Saint-Joseph', 'Pauillac']);
    expect(options(view, 'dl-vintage')).toEqual(['2021', '2015', 'NV']);
    expect(options(view, 'dl-region')).toEqual(expect.arrayContaining(['Vallée du Rhône', 'Bordeaux', 'Bourgogne']));
    expect(options(view, 'dl-country')).toEqual(expect.arrayContaining(['France', 'Italie']));
    expect(options(view, 'dl-region')[0]).toBe('Vallée du Rhône'); // les plus utilisées d’abord
  });

  it('s’enrichit au fur et à mesure : une nouvelle appellation est proposée à la saisie suivante', async () => {
    const { ctx, repo } = await setup();
    expect(options(await addWineView(ctx), 'dl-appellation')).toEqual([]);
    const view = await open(ctx);
    fill(view, { appellation: 'Chablis', color: 'blanc' });
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    document.body.innerHTML = '';
    expect(options(await addWineView(ctx), 'dl-appellation')).toEqual(['Chablis']);
  });

  it('reprend région et pays habituels d’une appellation connue, sans écraser une saisie', async () => {
    const { ctx } = await withCave();
    const view = await open(ctx);
    setValue(view.querySelector('#f-appellation'), 'saint joseph');
    expect(value(view, 'region')).toBe('Vallée du Rhône');
    expect(value(view, 'country')).toBe('France');

    const other = await open(ctx);
    setValue(other.querySelector('#f-region'), 'Ma région');
    setValue(other.querySelector('#f-appellation'), 'Saint-Joseph');
    expect(value(other, 'region')).toBe('Ma région');
    expect(value(other, 'country')).toBe('France');

    const unknown = await open(ctx);
    setValue(unknown.querySelector('#f-appellation'), 'Inconnue');
    expect(value(unknown, 'region')).toBe('');
  });
});

describe('éviter les entrées presque identiques', () => {
  async function withCave() {
    const s = await setup();
    await s.repo.addWine(wineFields({ cuvee: 'A', vintage: 2021, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' }), s.place);
    return s;
  }
  const last = async (repo: Awaited<ReturnType<typeof setup>>['repo'], cuvee: string) =>
    (await repo.list('wine')).find((w) => w.cuvee === cuvee);

  it('ramène en silence une variante de casse, d’accents ou de tiret à la graphie existante', async () => {
    const { ctx, repo } = await withCave();
    const view = await open(ctx);
    fill(view, { cuvee: 'Nouvelle', appellation: 'saint joseph' });
    setValue(view.querySelector('#f-region'), 'vallee du rhone');
    setValue(view.querySelector('#f-country'), 'FRANCE');
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await last(repo, 'Nouvelle')).toBeDefined());
    expect(await last(repo, 'Nouvelle')).toMatchObject({ appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France' });
    expect(document.querySelector('dialog')).toBeNull();
    expect(value(view, 'appellation')).toBe('Saint-Joseph');
  });

  it('une valeur proche (faute de frappe) demande confirmation : utiliser l’existante', async () => {
    const { ctx, repo } = await withCave();
    const view = await open(ctx);
    fill(view, { cuvee: 'Typo', appellation: 'Saint-Josef' });
    await pickFirstShelf(view);
    submit(view);
    const dlg = await dialog();
    expect(dlg.textContent).toContain('Valeur proche déjà utilisée');
    expect(dlg.textContent).toContain('« Saint-Josef » ressemble à « Saint-Joseph »');
    click(byText(dlg, 'button', 'Utiliser « Saint-Joseph »'));
    await waitFor(async () => expect(await last(repo, 'Typo')).toBeDefined());
    expect((await last(repo, 'Typo'))?.appellation).toBe('Saint-Joseph');
  });

  it('… ou garder la saisie telle quelle', async () => {
    const { ctx, repo } = await withCave();
    const view = await open(ctx);
    fill(view, { cuvee: 'Typo', appellation: 'Saint-Josef' });
    await pickFirstShelf(view);
    submit(view);
    click(byText(await dialog(), 'button', 'Garder « Saint-Josef »'));
    await waitFor(async () => expect(await last(repo, 'Typo')).toBeDefined());
    expect((await last(repo, 'Typo'))?.appellation).toBe('Saint-Josef');
  });

  it('… ou annuler : rien n’est enregistré et la saisie est conservée', async () => {
    const { ctx, repo } = await withCave();
    const view = await open(ctx);
    fill(view, { cuvee: 'Typo', appellation: 'Saint-Josef' });
    await pickFirstShelf(view);
    submit(view);
    click(byText(await dialog(), 'button', 'Annuler'));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(await last(repo, 'Typo')).toBeUndefined();
    expect(value(view, 'appellation')).toBe('Saint-Josef');
    expect(view.querySelector('button[type=submit]')?.hasAttribute('disabled')).toBe(false);
  });

  it('une valeur nouvelle et bien distincte est acceptée sans question', async () => {
    const { ctx, repo } = await withCave();
    const view = await open(ctx);
    fill(view, { cuvee: 'Neuve', appellation: 'Chablis', color: 'blanc' });
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await last(repo, 'Neuve')).toBeDefined());
    expect(document.querySelector('dialog')).toBeNull();
    expect((await last(repo, 'Neuve'))?.appellation).toBe('Chablis');
  });
});

describe('interrupteur « Cadeau »', () => {
  it('est un vrai interrupteur, éteint par défaut, qui fait apparaître « Offert par »', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    const sw = view.querySelector('label.switch');
    expect(sw).not.toBeNull();
    const input = sw!.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.checked).toBe(false);
    expect(sw!.querySelector('.switch__track .switch__thumb')).not.toBeNull();
    expect(sw!.textContent).toContain('Cadeau');
    const wrap = view.querySelector('#f-gift_from')!.closest('.stack')!;
    expect(wrap.hasAttribute('hidden')).toBe(true);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(wrap.hasAttribute('hidden')).toBe(false);
  });

  it('la feuille de style définit l’état actif de l’interrupteur et sa cible tactile', () => {
    const css = readFileSync('src/ui/styles/components.css', 'utf-8');
    expect(css).toMatch(/\.switch__input:checked \+ \.switch__track/);
    expect(css).toMatch(/\.switch\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
