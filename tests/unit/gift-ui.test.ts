// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addWineView } from '../../src/ui/views/add-wine';
import { personsView } from '../../src/ui/views/personnes';
import { settingsView } from '../../src/ui/views/settings';
import { wineListView } from '../../src/ui/views/wine-list';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });

async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-gift');
  await d.repo.createFurniture('Meuble A', 1);
  const shelf = (await d.repo.list('location'))[0]!;
  return { ctx: contextOf(d), repo: d.repo, shelf };
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
const check = (el: Element | null, on = true): void => {
  const box = el as HTMLInputElement;
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));
const submit = (root: HTMLElement): void => {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};
/** Renseigne les champs obligatoires (le domaine et la fenêtre de garde sont facultatifs). */
const fill = (view: HTMLElement, over: Partial<Record<'domain' | 'cuvee' | 'vintage' | 'appellation' | 'color', string>> = {}): void => {
  const v = { domain: 'Edile', cuvee: 'Rouge Edile', vintage: '2021', appellation: 'Saint-Joseph', color: 'rouge', ...over };
  for (const [k, val] of Object.entries(v)) setValue(view.querySelector(`#f-${k}`), val);
};
const dialog = (): Promise<HTMLDialogElement> =>
  waitFor(() => {
    const d = document.querySelector('dialog');
    if (!d) throw new Error('dialogue absent');
    return d;
  });

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

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('fenêtre de garde : partie haute, facultative', () => {
  it('« à boire à partir de / avant » sont dans la fiche principale, pas dans « Plus d’informations »', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    const top = view.querySelector('#f-cuvee')!.closest('section')!;
    expect(top.querySelector('#f-drink_from')).not.toBeNull();
    expect(top.querySelector('#f-drink_until')).not.toBeNull();
    expect(view.querySelector('details #f-drink_from')).toBeNull();
    expect(view.querySelector('details #f-drink_until')).toBeNull();
    expect(view.querySelector('label[for="f-drink_from"] .field__label')?.textContent).toBe('À boire à partir de');
    expect(view.querySelector('label[for="f-drink_until"] .field__label')?.textContent).toBe('À boire avant');
  });

  it('s’enregistre sans fenêtre de garde, et avec si elle est donnée', async () => {
    const { ctx, repo } = await setup();
    const a = await addWineView(ctx);
    document.body.append(a);
    fill(a);
    await pickFirstShelf(a);
    submit(a);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ drink_from: null, drink_until: null });

    document.body.innerHTML = '';
    window.location.hash = '';
    const b = await addWineView(ctx);
    document.body.append(b);
    fill(b, { cuvee: 'Autre' });
    setValue(b.querySelector('#f-drink_from'), '2025');
    setValue(b.querySelector('#f-drink_until'), '2031');
    await pickFirstShelf(b);
    submit(b);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(2));
    expect((await repo.list('wine')).find((w) => w.cuvee === 'Autre')).toMatchObject({ drink_from: 2025, drink_until: 2031 });
  });

  it('refuse une fenêtre incohérente', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    fill(view);
    setValue(view.querySelector('#f-drink_from'), '2031');
    setValue(view.querySelector('#f-drink_until'), '2025');
    await pickFirstShelf(view);
    submit(view);
    await waitFor(() => expect(view.querySelector('#e-drink_until')?.textContent).toContain('postérieur'));
    expect(await repo.list('wine')).toHaveLength(0);
  });

  it('libellés : « Sucre (autres) » et « Tanin (rouges) »', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    expect(view.querySelector('label[for="f-dryness"] .field__label')?.textContent).toBe('Sucre (autres)');
    expect(view.querySelector('label[for="f-tannin"] .field__label')?.textContent).toBe('Tanin (rouges)');
  });
});

describe('cadeau', () => {
  const giftWrap = (view: HTMLElement): Element => view.querySelector('#f-gift_from')!.closest('.stack')!;

  it('est dans « Plus d’informations » et ne montre la liste des personnes qu’une fois coché', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    expect(view.querySelector('details #f-gift')).not.toBeNull();
    expect(giftWrap(view).hasAttribute('hidden')).toBe(true);
    check(view.querySelector('#f-gift'));
    expect(giftWrap(view).hasAttribute('hidden')).toBe(false);
    expect(view.querySelector('#f-gift_from option')?.textContent).toContain('liste vide');
    check(view.querySelector('#f-gift'), false);
    expect(giftWrap(view).hasAttribute('hidden')).toBe(true);
  });

  it('enregistre la bouteille comme cadeau offert par la personne choisie dans la liste', async () => {
    const { ctx, repo } = await setup();
    const marie = await repo.addPerson('Marie');
    await repo.addPerson('Alice');
    const view = await addWineView(ctx);
    document.body.append(view);
    fill(view);
    check(view.querySelector('#f-gift'));
    expect([...view.querySelectorAll('#f-gift_from option')].map((o) => o.textContent)).toEqual(['—', 'Alice', 'Marie']);
    setValue(view.querySelector('#f-gift_from'), marie.id);
    await pickFirstShelf(view);
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ gift: true, gift_from: marie.id });
  });

  it('un cadeau sans nom est accepté ; décocher « cadeau » oublie la personne choisie', async () => {
    const { ctx, repo } = await setup();
    const marie = await repo.addPerson('Marie');
    const a = await addWineView(ctx);
    document.body.append(a);
    fill(a);
    check(a.querySelector('#f-gift'));
    await pickFirstShelf(a);
    submit(a);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ gift: true, gift_from: null });

    document.body.innerHTML = '';
    window.location.hash = '';
    const b = await addWineView(ctx);
    document.body.append(b);
    fill(b, { domain: 'Autre' });
    check(b.querySelector('#f-gift'));
    setValue(b.querySelector('#f-gift_from'), marie.id);
    check(b.querySelector('#f-gift'), false);
    await pickFirstShelf(b);
    submit(b);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(2));
    expect((await repo.list('wine')).find((w) => w.domain === 'Autre')).toMatchObject({ gift: false, gift_from: null });
  });

  it('permet d’ajouter une personne à la volée, qui est aussitôt sélectionnée', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    check(view.querySelector('#f-gift'));
    click(byText(view, 'button', 'Nouvelle personne'));
    const dlg = await dialog();
    setValue(dlg.querySelector('input'), 'Jean');
    click(byText(dlg, 'button', 'Ajouter'));
    await waitFor(() => expect((view.querySelector('#f-gift_from') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Jean'));
    expect((await repo.persons()).map((p) => p.name)).toEqual(['Jean']);
  });

  it('signale un doublon lors de l’ajout à la volée', async () => {
    const { ctx, repo } = await setup();
    await repo.addPerson('Jean');
    const view = await addWineView(ctx);
    document.body.append(view);
    check(view.querySelector('#f-gift'));
    click(byText(view, 'button', 'Nouvelle personne'));
    const dlg = await dialog();
    setValue(dlg.querySelector('input'), 'jean');
    click(byText(dlg, 'button', 'Ajouter'));
    const alerts = (): string => [...view.querySelectorAll('[role=alert]')].map((e) => e.textContent).join(' ');
    await waitFor(() => expect(alerts()).toContain('déjà dans la liste'));
    expect(await repo.persons()).toHaveLength(1);
  });
});

describe('Réglages › Personnes', () => {
  it('ajoute, renomme et supprime des personnes', async () => {
    const { ctx, repo } = await setup();
    const view = personsView(ctx);
    document.body.append(view);
    await waitFor(() => expect(view.querySelector('form')).not.toBeNull());
    expect(view.textContent).toContain('Aucune personne');

    setValue(view.querySelector('form input'), 'Marie');
    submit(view);
    await waitFor(() => expect(view.querySelector('.list__item')?.textContent).toContain('Marie'));

    click(view.querySelector('[aria-label="Renommer Marie"]'));
    const rename = await dialog();
    setValue(rename.querySelector('input'), 'Marie-Claire');
    click(byText(rename, 'button', 'Enregistrer'));
    await waitFor(() => expect(view.querySelector('.list__item')?.textContent).toContain('Marie-Claire'));

    click(view.querySelector('[aria-label="Supprimer Marie-Claire"]'));
    const del = await dialog();
    click(byText(del, 'button', 'Supprimer'));
    await waitFor(() => expect(view.textContent).toContain('Aucune personne'));
    expect(await repo.persons()).toHaveLength(0);
  });

  it('refuse un doublon et affiche l’erreur', async () => {
    const { ctx, repo } = await setup();
    await repo.addPerson('Marie');
    const view = personsView(ctx);
    document.body.append(view);
    await waitFor(() => expect(view.querySelector('form')).not.toBeNull());
    setValue(view.querySelector('form input'), 'marie');
    submit(view);
    await waitFor(() => expect(view.querySelector('[role=alert]')?.textContent).toContain('déjà dans la liste'));
  });

  it('prévient quand des bouteilles ont été offertes par la personne supprimée', async () => {
    const { ctx, repo } = await setup();
    const marie = await repo.addPerson('Marie');
    await repo.addWine(wineFields({ gift: true, gift_from: marie.id }), []);
    const view = personsView(ctx);
    document.body.append(view);
    await waitFor(() => expect(view.querySelector('[aria-label="Supprimer Marie"]')).not.toBeNull());
    expect(view.querySelector('.badge')?.textContent).toBe('1');
    click(view.querySelector('[aria-label="Supprimer Marie"]'));
    const dlg = await dialog();
    expect(dlg.textContent).toContain('1 bouteille est marquée comme offerte par Marie');
  });

  it('est accessible depuis les réglages', async () => {
    const { ctx } = await setup();
    const view = await settingsView(ctx);
    expect(view.querySelector('a[href="#/personnes"]')).not.toBeNull();
    expect(personsView(ctx).firstElementChild?.classList.contains('app-header')).toBe(true);
  });
});

describe('liste : cadeau', () => {
  it('affiche « Offert par … » sur la carte, même si la personne a été retirée de la liste', async () => {
    const { ctx, repo, shelf } = await setup();
    const marie = await repo.addPerson('Marie');
    const loc = [{ location_id: shelf.id, quantity: 1, position_hint: null }];
    await repo.addWine(wineFields({ domain: 'Avec Don', gift: true, gift_from: marie.id }), loc);
    await repo.addWine(wineFields({ domain: 'Sans Nom', cuvee: 'B', gift: true }), loc);
    await repo.addWine(wineFields({ domain: 'Acheté', cuvee: 'C' }), loc);
    await repo.removePerson(marie.id);
    const view = wineListView(ctx);
    document.body.append(view);
    await waitFor(() => expect(view.querySelectorAll('.wine-card')).toHaveLength(3));
    expect(byText(view, '.wine-card', 'Avec Don')?.textContent).toContain('Offert par Marie');
    expect(byText(view, '.wine-card', 'Sans Nom')?.textContent).toMatch(/Cadeau/);
    expect(byText(view, '.wine-card', 'Acheté')?.textContent).not.toMatch(/Cadeau|Offert/);
  });
});
