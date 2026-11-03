// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { claudeProjectUrl, normalizeProjectUrl, setClaudeProjectUrl } from '../../src/ui/claude-project';
import { claudeProjectButton, claudeProjectCard } from '../../src/ui/components/claude-project-link';
import { addHubView } from '../../src/ui/views/add-hub';
import { addWineView, editWineView } from '../../src/ui/views/add-wine';
import { wineDetailView } from '../../src/ui/views/wine-detail';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

// Pas de canvas dans happy-dom : la miniature est simulée à partir du nom du fichier.
vi.mock('../../src/scan/image', async (orig) => ({
  ...(await orig<typeof import('../../src/scan/image')>()),
  makeThumbnail: async (f: Blob) => ({ data: btoa((f as File).name), mime: 'image/jpeg' as const, width: 10, height: 10 }),
}));

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
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
const pickFile = (input: Element | null, name: string): void => {
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/jpeg' })], configurable: true });
  input!.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  window.location.hash = '';
});

async function setup() {
  const d = await makeDevice(await makeSheet(), 'dev-photos');
  await d.repo.createFurniture('Meuble A', 2);
  return { d, ctx: contextOf(d) as AppContext };
}
const fill = (view: HTMLElement): void => {
  for (const [k, v] of Object.entries({ domain: 'Domaine des Lys', cuvee: 'Les Pierres', vintage: '2019', appellation: 'Saint-Joseph', color: 'rouge', drink_from: '2024', drink_until: '2030' })) setValue(view.querySelector(`#f-${k}`), v);
};

describe('deux photos par bouteille', () => {
  it('propose l’avant et l’arrière, chacun depuis la phototèque (sans « capture ») ou l’appareil photo', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    for (const side of ['avant', 'arrière']) {
      const slot = view.querySelector(`.photos__slot[data-side="${side}"]`)!;
      const lib = slot.querySelector('input[id$="-lib"]')!;
      const cam = slot.querySelector('input[id$="-cam"]')!;
      expect(lib.getAttribute('accept')).toBe('image/*');
      expect(lib.hasAttribute('capture')).toBe(false); // phototèque : l'iPhone propose bien ses photos
      expect(cam.getAttribute('capture')).toBe('environment');
      expect([...slot.querySelectorAll('label')].map((l) => l.textContent)).toEqual(['Phototèque', 'Appareil photo']);
    }
  });

  it('enregistre les deux faces : l’avant sert de miniature, l’arrière est conservée à part', async () => {
    const { d, ctx } = await setup();
    const shelf = (await d.repo.list('location')).find((l) => l.kind === 'shelf')!;
    const view = await addWineView(ctx);
    document.body.append(view);
    fill(view);
    pickFile(view.querySelector('#f-photo-avant-lib'), 'avant.jpg');
    pickFile(view.querySelector('#f-photo-arrière-cam'), 'arriere.jpg');
    await waitFor(() => expect(view.querySelectorAll('.photos__slot img')).toHaveLength(2));
    click(view.querySelector(`[data-row="0"] [data-location-id="${shelf.id}"]`));
    view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await waitFor(async () => expect((await d.repo.list('photo')).length).toBe(2));
    const photos = await d.repo.list('photo');
    expect(photos.map((p) => p.side).sort()).toEqual(['arrière', 'avant']);
    const [wine] = await d.repo.list('wine');
    expect(wine!.thumb_ref).toBe(photos.find((p) => p.side === 'avant')!.id);
    expect((await d.repo.thumbnailUrls()).get(wine!.id)).toContain(btoa('avant.jpg')); // la liste n'affiche que l'avant
    const both = (await d.repo.photoUrls()).get(wine!.id)!;
    expect(both.front).toContain(btoa('avant.jpg'));
    expect(both.back).toContain(btoa('arriere.jpg'));
  });

  it('en modification : montre les photos existantes, et n’en remplace que la face choisie', async () => {
    const { d, ctx } = await setup();
    const w = await d.repo.addWine(wineFields({ appellation: 'Saint-Joseph', drink_from: 2024, drink_until: 2030 }), [], { mime: 'image/jpeg', width: 5, height: 5, data: btoa('front-old') });
    await d.repo.setThumbnail(w.id, { mime: 'image/jpeg', width: 5, height: 5, data: btoa('back-old') }, 'arrière');
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    expect(view.querySelectorAll('.photos__slot img')).toHaveLength(2);

    pickFile(view.querySelector('#f-photo-arrière-lib'), 'back-new.jpg');
    await waitFor(() => expect(view.querySelector('.photos__slot[data-side="arrière"] img')!.getAttribute('src')).toContain(btoa('back-new.jpg')));
    view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(async () => expect((await d.repo.photoUrls()).get(w.id)!.back).toContain(btoa('back-new.jpg')));
    const urls = (await d.repo.photoUrls()).get(w.id)!;
    expect(urls.front).toContain(btoa('front-old')); // l'avant n'a pas bougé
    expect((await d.repo.list('photo')).filter((p) => p.wine_id === w.id)).toHaveLength(2); // l'ancien arrière est supprimé
  });

  it('la fiche détaillée montre les deux faces', async () => {
    const { d, ctx } = await setup();
    const w = await d.repo.addWine(wineFields(), [], { mime: 'image/jpeg', width: 5, height: 5, data: btoa('f') });
    await d.repo.setThumbnail(w.id, { mime: 'image/jpeg', width: 5, height: 5, data: btoa('b') }, 'arrière');
    const detail = await wineDetailView(ctx, { id: w.id });
    expect(detail.querySelectorAll('.detail-hero__thumb')).toHaveLength(2);
    expect([...detail.querySelectorAll('.detail-hero__thumb')].map((i) => i.getAttribute('alt'))).toEqual(['Étiquette (avant)', 'Étiquette (arrière)']);
  });

  it('fusion : la face manquante de la fiche conservée est reprise, celle qu’elle a déjà est gardée', async () => {
    const { d } = await setup();
    const keep = await d.repo.addWine(wineFields({ cuvee: 'K' }), [], { mime: 'image/jpeg', width: 5, height: 5, data: btoa('keep-front') });
    const gone = await d.repo.addWine(wineFields({ cuvee: 'G' }), [], { mime: 'image/jpeg', width: 5, height: 5, data: btoa('gone-front') });
    await d.repo.setThumbnail(gone.id, { mime: 'image/jpeg', width: 5, height: 5, data: btoa('gone-back') }, 'arrière');
    await d.repo.mergeWines(keep.id, gone.id);
    const urls = (await d.repo.photoUrls()).get(keep.id)!;
    expect(urls.front).toContain(btoa('keep-front'));
    expect(urls.back).toContain(btoa('gone-back'));
  });
});

describe('bouton Enregistrer toujours visible', () => {
  it('« Enregistrer » est dans une barre collante en bas du formulaire', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    const bar = view.querySelector('form > .form-bar')!;
    expect(bar).not.toBeNull();
    expect(bar.querySelector('button[type="submit"]')!.textContent).toBe('Enregistrer');
    expect(view.querySelector('form')!.lastElementChild).toBe(bar);
  });
});

describe('projet Claude', () => {
  it('n’accepte que des adresses https valides', () => {
    expect(normalizeProjectUrl(' https://claude.ai/project/abc ')).toBe('https://claude.ai/project/abc');
    for (const bad of ['', 'claude.ai/project/abc', 'http://claude.ai/x', 'javascript:alert(1)', null, 42]) expect(normalizeProjectUrl(bad), String(bad)).toBeNull();
    expect(setClaudeProjectUrl('http://x')).toBe(false);
    expect(claudeProjectUrl()).toBeNull();
    expect(setClaudeProjectUrl('https://claude.ai/project/abc')).toBe(true);
    expect(claudeProjectUrl()).toBe('https://claude.ai/project/abc');
    expect(setClaudeProjectUrl('')).toBe(true);
    expect(claudeProjectUrl()).toBeNull();
  });

  it('le bouton ouvre le projet dans un nouvel onglet, ou renvoie vers Réglages tant qu’aucune adresse n’est réglée', () => {
    const before = claudeProjectButton();
    expect(before.getAttribute('href')).toBe('#/reglages');
    expect(before.textContent).toContain('Régler l’adresse');
    setClaudeProjectUrl('https://claude.ai/project/abc');
    const after = claudeProjectButton();
    expect(after.getAttribute('href')).toBe('https://claude.ai/project/abc');
    expect(after.getAttribute('target')).toBe('_blank');
    expect(after.getAttribute('rel')).toContain('noopener');
    expect(after.textContent).toContain('Ouvrir mon projet Claude');
  });

  it('se règle dans Réglages (adresse invalide refusée) et apparaît sur « Ajouter » et dans le formulaire', async () => {
    const { ctx } = await setup();
    const card = claudeProjectCard();
    document.body.append(card);
    setValue(card.querySelector('#claude-url'), 'pas une adresse');
    click(card.querySelector('button'));
    expect(card.textContent).toContain('Adresse invalide');
    expect(claudeProjectUrl()).toBeNull();
    setValue(card.querySelector('#claude-url'), 'https://claude.ai/project/01a19c15');
    click(card.querySelector('button'));
    expect(card.textContent).toContain('Adresse enregistrée');

    const hub = await addHubView(ctx);
    expect(hub.querySelector('a[href="https://claude.ai/project/01a19c15"]')).not.toBeNull();
    const form = await addWineView(ctx);
    expect(form.querySelector('a[href="https://claude.ai/project/01a19c15"]')).not.toBeNull();
  });
});
