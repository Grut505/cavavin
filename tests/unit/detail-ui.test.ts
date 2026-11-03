// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { todayIso } from '../../src/domain/stock';
import { editWineView } from '../../src/ui/views/add-wine';
import { historyView } from '../../src/ui/views/history';
import { wineDetailView } from '../../src/ui/views/wine-detail';
import { makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });

async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-detail');
  await d.repo.createFurniture('Meuble A', 2);
  await d.repo.createFurniture('Meuble B', 1);
  const locs = await d.repo.list('location');
  const loc = (furn: string, name: string) => {
    const f = locs.find((l) => l.kind === 'shelf' && l.name === name && l.furniture_id === furn)!;
    return f;
  };
  const furnitures = await d.repo.list('furniture');
  const A = furnitures.find((f) => f.name === 'Meuble A')!.id;
  const B = furnitures.find((f) => f.name === 'Meuble B')!.id;
  return {
    ctx: { repo: d.repo, db: d.db } as unknown as AppContext,
    repo: d.repo,
    a1: loc(A, 'Étagère 1'),
    a2: loc(A, 'Étagère 2'),
    b1: loc(B, 'Étagère 1'),
  };
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
const lastDialog = (): Promise<HTMLDialogElement> =>
  waitFor(() => {
    const all = [...document.querySelectorAll('dialog')];
    if (all.length === 0) throw new Error('dialogue absent');
    return all.at(-1)!;
  });
const noDialog = (): Promise<void> => waitFor(() => expect(document.querySelector('dialog')).toBeNull());
/** Après une bouteille bue, l'avis s'ouvre : on le passe (« Plus tard »). */
const skipTasting = async (): Promise<void> => {
  const dlg = await waitFor(() => {
    const d = [...document.querySelectorAll('dialog')].find((x) => x.textContent?.includes('Votre avis'));
    if (!d) throw new Error('avis pas encore ouvert');
    return d;
  });
  click(byText(dlg, 'button', 'Plus tard'));
  await noDialog();
};

async function open(ctx: AppContext, id: string): Promise<HTMLElement> {
  const view = await wineDetailView(ctx, { id });
  document.body.append(view);
  return view;
}

/** Choisit une étagère dans le sélecteur (dialogue empilé) puis valide sans position précise. */
async function pickShelf(name: string): Promise<void> {
  const dlg = await waitFor(() => {
    const d = [...document.querySelectorAll('dialog')].find((x) => x.querySelector('.shelf'));
    if (!d) throw new Error('sélecteur absent');
    return d;
  });
  click([...dlg.querySelectorAll('.shelf')].find((s) => s.getAttribute('aria-label')?.startsWith(name)));
  await waitFor(() => expect(dlg.querySelector('[data-hint]')).not.toBeNull());
  click(byText(dlg, 'button', 'Sans précision'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('fiche détaillée', () => {
  it('affiche toutes les informations renseignées', async () => {
    const { ctx, repo, a1 } = await setup();
    const marie = await repo.addPerson('Marie');
    const w = await repo.addWine(
      wineFields({
        domain: 'Domaine Fabre', cuvee: 'Les Pins', vintage: 2015, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France',
        color: 'rouge', tannin: 3, drink_from: 2025, drink_until: 2031, rating: 4, purchase_price: 12.5, purchase_date: '2024-03-05',
        supplier: 'Caviste Jean', gift: true, gift_from: marie.id, notes: 'Très bon',
      }),
      [{ location_id: a1.id, quantity: 3, position_hint: 'milieu-gauche' }],
    );
    const view = await open(ctx, w.id);
    expect(view.querySelector('.app-header h1')?.textContent).toBe('Domaine Fabre');
    expect(view.querySelector('.app-header p')?.textContent).toBe('Les Pins · 2015 · 3 bouteilles');
    const facts = view.querySelector('.facts')!.textContent!;
    for (const expected of ['Rouge', 'Saint-Joseph', 'Vallée du Rhône, France', '75cl', 'Tanin 3 / 5', '2025 – 2031', '4 / 5', '12,50 €', '05/03/2024', 'Caviste Jean', 'Offert par Marie', 'Très bon']) {
      expect(facts, expected).toContain(expected);
    }
    expect(view.querySelector('a[aria-label="Modifier la fiche"]')?.getAttribute('href')).toBe(`#/vin/${w.id}/modifier`);
  });

  it('n’affiche pas les informations absentes', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields({ color: 'blanc', dryness: 'sec' }), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    const facts = (await open(ctx, w.id)).querySelector('.facts')!.textContent!;
    expect(facts).toContain('Sucre : sec');
    for (const absent of ['Prix', 'Fournisseur', 'Cadeau', 'Notes', 'Note ', 'À boire']) expect(facts, absent).not.toContain(absent);
  });

  it('liste les emplacements avec leurs quantités et montre, pour chacun, la vue de l’étagère avec les bouteilles de la fiche en évidence', async () => {
    const { ctx, repo, a1, b1 } = await setup();
    const w = await repo.addWine(wineFields(), [
      { location_id: a1.id, quantity: 3, position_hint: 'milieu-droite' },
      { location_id: b1.id, quantity: 2, position_hint: null },
    ]);
    const view = await open(ctx, w.id);
    const rows = [...view.querySelectorAll('li[data-stock-id]')];
    expect(rows.map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Meuble A · Étagère 1'), expect.stringContaining('Meuble B · Étagère 1')]));
    expect(view.textContent).toContain('Position : Milieu · droite');
    expect(view.querySelector('li[data-stock-id] .badge')?.textContent).toMatch(/×[23]/);
    // « Où la trouver ? » reprend la vue des emplacements : une vue d'étagère par emplacement de la fiche
    const views = [...view.querySelectorAll('.where')].map((e) => e.getAttribute('data-location-id')).sort();
    expect(views).toEqual([a1.id, b1.id].sort());
    const a1View = view.querySelector(`.where[data-location-id="${a1.id}"]`)!;
    expect(a1View.querySelectorAll('.sv__bottle')).toHaveLength(3); // les 3 bouteilles dessinées
    expect(a1View.querySelector('[data-zone="milieu-droite"] .sv__bottle')).not.toBeNull(); // à la bonne position
    expect(a1View.querySelector('a.where__title')!.getAttribute('href')).toBe(`#/etagere/${a1.id}`);
    expect(view.querySelector('button[aria-label="Légende des couleurs"]')).not.toBeNull();
  });

  it('estompe les bouteilles des autres fiches sur l’étagère', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields({ cuvee: 'Celle-ci' }), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    await repo.addWine(wineFields({ cuvee: 'Une autre' }), [{ location_id: a1.id, quantity: 2, position_hint: null }]);
    const view = await open(ctx, w.id);
    const bottles = [...view.querySelectorAll(`.where[data-location-id="${a1.id}"] .sv__bottle`)];
    expect(bottles).toHaveLength(3);
    expect(bottles.filter((b) => b.classList.contains('sv__bottle--dim'))).toHaveLength(2); // les deux autres
  });

  it('ne montre que les emplacements où se trouve la fiche', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields(), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    const view = await open(ctx, w.id);
    expect(view.querySelectorAll('.where')).toHaveLength(1);
    expect(view.textContent).toContain('Meuble A');
    expect(view.textContent).not.toContain('Meuble B');
  });

  it('une fiche introuvable est signalée', async () => {
    const { ctx } = await setup();
    const view = await wineDetailView(ctx, { id: 'nope' });
    expect(view.textContent).toContain('Fiche introuvable');
    expect(view.querySelector('a[href="#/liste"]')).not.toBeNull();
  });

  it('signale une fiche « à compléter »', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields(), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    await repo.patch('wine', w.id, { needs_review: true });
    expect((await open(ctx, w.id)).textContent).toContain('Fiche à compléter');
  });
});

describe('sortir une bouteille', () => {
  async function withWine() {
    const s = await setup();
    const w = await s.repo.addWine(wineFields({ domain: 'Fabre' }), [
      { location_id: s.a1.id, quantity: 3, position_hint: null },
      { location_id: s.b1.id, quantity: 2, position_hint: null },
    ]);
    const view = await open(s.ctx, w.id);
    return { ...s, w, view };
  }
  const rowOf = (view: HTMLElement, label: string): Element => byText(view, 'li[data-stock-id]', label)!;

  it('propose le motif « bue », la quantité 1 et la date du jour, et décrémente le stock choisi', async () => {
    const { repo, view, a1, w } = await withWine();
    click(byText(rowOf(view, 'Meuble A · Étagère 1'), 'button', 'Sortir'));
    const dlg = await lastDialog();
    expect((dlg.querySelector('#out-reason') as HTMLSelectElement).value).toBe('drunk');
    expect((dlg.querySelector('#out-quantity') as HTMLInputElement).value).toBe('1');
    expect((dlg.querySelector('#out-date') as HTMLInputElement).value).toBe(todayIso());
    expect((dlg.querySelector('#out-stock') as HTMLSelectElement).selectedOptions[0]?.textContent).toContain('Meuble A · Étagère 1');
    setValue(dlg.querySelector('#out-note'), 'Avec des amis');
    click(byText(dlg, 'button', 'Sortir'));
    await skipTasting();

    const stock = (await repo.list('stock')).find((s) => s.location_id === a1.id)!;
    expect(stock.quantity).toBe(2);
    const [o] = await repo.list('outflow');
    expect(o).toMatchObject({ wine_id: w.id, location_id: a1.id, reason: 'drunk', date: todayIso(), note: 'Avec des amis' });
    // La fiche se rafraîchit : total, quantités et historique.
    await waitFor(() => expect(view.querySelector('.app-header p')?.textContent).toContain('4 bouteilles'));
    expect(view.textContent).toContain('Bue');
  });

  it('sort plusieurs bouteilles avec un autre motif et une date passée', async () => {
    const { repo, view } = await withWine();
    click(byText(rowOf(view, 'Meuble A · Étagère 1'), 'button', 'Sortir'));
    const dlg = await lastDialog();
    setValue(dlg.querySelector('#out-quantity'), '2');
    setValue(dlg.querySelector('#out-reason'), 'gifted');
    setValue(dlg.querySelector('#out-date'), '2026-10-01');
    click(byText(dlg, 'button', 'Sortir'));
    await noDialog();
    const outflows = await repo.list('outflow');
    expect(outflows).toHaveLength(2);
    expect(outflows.every((o) => o.reason === 'gifted' && o.date === '2026-10-01')).toBe(true);
  });

  it('refuse une quantité trop grande ou une date future, et efface l’erreur dès la saisie', async () => {
    const { repo, view } = await withWine();
    click(byText(rowOf(view, 'Meuble A · Étagère 1'), 'button', 'Sortir'));
    const dlg = await lastDialog();
    setValue(dlg.querySelector('#out-quantity'), '9');
    setValue(dlg.querySelector('#out-date'), '2999-01-01');
    click(byText(dlg, 'button', 'Sortir'));
    const alerts = (): string => [...dlg.querySelectorAll('.field__error')].map((e) => e.textContent).join(' ');
    await waitFor(() => expect(alerts()).toContain('3 bouteilles'));
    expect(alerts()).toContain('futur');
    setValue(dlg.querySelector('#out-quantity'), '2');
    expect(alerts()).not.toContain('3 bouteilles');
    expect(alerts()).toContain('futur');
    expect(await repo.list('outflow')).toHaveLength(0);
    click(byText(dlg, 'button', 'Annuler'));
    await noDialog();
  });

  it('permet de choisir l’emplacement quand la fiche est à plusieurs endroits, et borne la quantité', async () => {
    const { repo, view, b1 } = await withWine();
    click(view.querySelector('li[data-stock-id] button'));
    const dlg = await lastDialog();
    const select = dlg.querySelector('#out-stock') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    const bStock = (await repo.list('stock')).find((s) => s.location_id === b1.id)!;
    setValue(select, bStock.id);
    expect(dlg.querySelector('#out-quantity')?.getAttribute('max')).toBe('2');
  });

  it('sortir la dernière bouteille la fait passer en « épuisée » et conserve l’historique', async () => {
    const s = await setup();
    const w = await s.repo.addWine(wineFields(), [{ location_id: s.a1.id, quantity: 1, position_hint: null }]);
    const view = await open(s.ctx, w.id);
    click(byText(view, 'li[data-stock-id] button', 'Sortir'));
    click(byText(await lastDialog(), 'button', 'Sortir'));
    await skipTasting();
    await waitFor(() => expect(view.querySelector('.app-header p')?.textContent).toContain('épuisée'));
    expect(view.textContent).toContain('Plus aucune bouteille en stock');
    expect(view.querySelector('li[data-stock-id]')).toBeNull();
    expect(view.textContent).toContain('Bue');
    expect(await s.repo.list('wine')).toHaveLength(1);
  });
});

describe('déplacer des bouteilles', () => {
  async function withWine() {
    const s = await setup();
    const w = await s.repo.addWine(wineFields(), [{ location_id: s.a1.id, quantity: 3, position_hint: null }]);
    const view = await open(s.ctx, w.id);
    return { ...s, w, view };
  }

  it('déplace une partie vers une autre étagère choisie dans le schéma, avec sa position', async () => {
    const { repo, view, a1, b1 } = await withWine();
    click(byText(view, 'li[data-stock-id] button', 'Déplacer'));
    const dlg = await lastDialog();
    expect((dlg.querySelector('#mv-quantity') as HTMLInputElement).value).toBe('3');
    setValue(dlg.querySelector('#mv-quantity'), '1');
    click(dlg.querySelector('#mv-dest'));
    // Choix de la destination (étagère 1 du meuble B), puis de la zone « droite ».
    const picker = await waitFor(() => {
      const d = [...document.querySelectorAll('dialog')].find((x) => x.querySelector('.shelf'));
      if (!d) throw new Error('sélecteur absent');
      return d;
    });
    click(picker.querySelector(`[data-location-id="${b1.id}"]`));
    await waitFor(() => expect(picker.querySelector('[data-hint]')).not.toBeNull());
    click(picker.querySelector('[data-hint="milieu-droite"]'));
    click(byText(picker, 'button', 'Valider'));
    await waitFor(() => expect(dlg.querySelector('#mv-dest')?.textContent).toContain('Meuble B · Étagère 1 · Milieu · droite'));
    click(byText(dlg, 'button', 'Déplacer'));
    await noDialog();

    const stocks = await repo.list('stock');
    expect(stocks.find((s) => s.location_id === a1.id)?.quantity).toBe(2);
    expect(stocks.find((s) => s.location_id === b1.id)).toMatchObject({ quantity: 1, position_hint: 'milieu-droite' });
    await waitFor(() => expect(view.querySelectorAll('li[data-stock-id]')).toHaveLength(2));
  });

  it('exige une destination, refuse l’emplacement actuel et une quantité trop grande', async () => {
    const { repo, view, a1 } = await withWine();
    click(byText(view, 'li[data-stock-id] button', 'Déplacer'));
    const dlg = await lastDialog();
    click(byText(dlg, 'button', 'Déplacer'));
    await waitFor(() => expect(dlg.textContent).toContain('Choisissez la destination'));
    // Même emplacement que l'actuel.
    click(dlg.querySelector('#mv-dest'));
    await pickShelf('Étagère 1');
    await waitFor(() => expect(dlg.querySelector('#mv-dest')?.textContent).toContain('Meuble A · Étagère 1'));
    click(byText(dlg, 'button', 'Déplacer'));
    await waitFor(() => expect(dlg.textContent).toContain('déjà l’emplacement actuel'));
    // Quantité trop grande.
    setValue(dlg.querySelector('#mv-quantity'), '9');
    click(byText(dlg, 'button', 'Déplacer'));
    await waitFor(() => expect(dlg.textContent).toContain('3 bouteilles'));
    expect((await repo.list('stock')).find((s) => s.location_id === a1.id)?.quantity).toBe(3);
  });
});

describe('ajouter des bouteilles à une fiche', () => {
  it('ajoute au stock d’un emplacement choisi dans le schéma, puis rafraîchit', async () => {
    const { ctx, repo, a1, a2 } = await setup();
    const w = await repo.addWine(wineFields(), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    const view = await open(ctx, w.id);
    click(byText(view, 'button', 'Ajouter des bouteilles'));
    const dlg = await lastDialog();
    click(byText(dlg, 'button', 'Ajouter'));
    await waitFor(() => expect(dlg.textContent).toContain('Choisissez un emplacement'));
    click(dlg.querySelector('#add-dest'));
    await pickShelf('Étagère 2');
    await waitFor(() => expect(dlg.querySelector('#add-dest')?.textContent).toContain('Meuble A · Étagère 2'));
    setValue(dlg.querySelector('#add-quantity'), '4');
    click(byText(dlg, 'button', 'Ajouter'));
    await noDialog();
    expect((await repo.list('stock')).find((s) => s.location_id === a2.id)?.quantity).toBe(4);
    await waitFor(() => expect(view.querySelector('.app-header p')?.textContent).toContain('5 bouteilles'));
  });
});

describe('modifier une fiche', () => {
  async function withWine() {
    const s = await setup();
    const w = await s.repo.addWine(
      wineFields({ domain: 'Fabre', cuvee: 'Les Pins', vintage: 2015, appellation: 'Saint-Joseph', color: 'rouge' }),
      [{ location_id: s.a1.id, quantity: 3, position_hint: null }],
    );
    return { ...s, w };
  }
  const submit = (v: HTMLElement): void => void v.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  const val = (v: HTMLElement, id: string): string => (v.querySelector(`#f-${id}`) as HTMLInputElement).value;

  it('pré-remplit le formulaire, sans la partie emplacements', async () => {
    const { ctx, w } = await withWine();
    const view = await editWineView(ctx, { id: w.id });
    expect(view.querySelector('.app-header h1')?.textContent).toBe('Modifier la fiche');
    expect(view.querySelector('.app-header a')?.getAttribute('href')).toBe(`#/vin/${w.id}`);
    expect(val(view, 'domain')).toBe('Fabre');
    expect(val(view, 'cuvee')).toBe('Les Pins');
    expect(val(view, 'vintage')).toBe('2015');
    expect(val(view, 'appellation')).toBe('Saint-Joseph');
    expect(val(view, 'color')).toBe('rouge');
    expect(view.textContent).not.toContain('Où la ranger');
    expect(view.querySelector('button[type=submit]')?.textContent).toBe('Enregistrer les modifications');
  });

  it('enregistre les modifications sans toucher au stock et revient à la fiche', async () => {
    const { ctx, repo, w } = await withWine();
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    setValue(view.querySelector('#f-appellation'), 'Crozes-Hermitage');
    setValue(view.querySelector('#f-tannin'), '4');
    setValue(view.querySelector('#f-notes'), 'À regarder');
    submit(view);
    await waitFor(() => expect(window.location.hash).toBe(`#/vin/${w.id}`));
    expect(await repo.get('wine', w.id)).toMatchObject({ appellation: 'Crozes-Hermitage', tannin: 4, notes: 'À regarder', domain: 'Fabre' });
    expect((await repo.list('stock'))[0]?.quantity).toBe(3);
    expect(await repo.list('wine')).toHaveLength(1);
  });

  it('applique les mêmes champs obligatoires et efface les erreurs dès la saisie', async () => {
    const { ctx, repo, w } = await withWine();
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    setValue(view.querySelector('#f-appellation'), '');
    submit(view);
    await waitFor(() => expect(view.querySelector('#e-appellation')?.textContent).toContain('obligatoire'));
    expect((await repo.get('wine', w.id))?.cuvee).toBe('Les Pins'); // rien n'est enregistré tant que la fiche est invalide
    setValue(view.querySelector('#f-appellation'), 'Saint-Joseph');
    expect(view.querySelector('#e-appellation')?.textContent).toBe('');
  });

  it('une cuvée effacée est enregistrée « sans cuvée » (facultative)', async () => {
    const { ctx, repo, w } = await withWine();
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    setValue(view.querySelector('#f-cuvee'), '');
    submit(view);
    await waitFor(async () => expect((await repo.get('wine', w.id))?.cuvee).toBe('—'));
    expect(view.querySelector('#e-cuvee')?.textContent).toBe('');
  });

  it('refuse de prendre l’identité (domaine, cuvée, millésime) d’une autre fiche', async () => {
    const { ctx, repo, w, a2 } = await withWine();
    await repo.addWine(wineFields({ domain: 'Autre', cuvee: 'X', vintage: 2020, appellation: 'Pauillac' }), [{ location_id: a2.id, quantity: 1, position_hint: null }]);
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'autre');
    setValue(view.querySelector('#f-cuvee'), 'x');
    setValue(view.querySelector('#f-vintage'), '2020');
    submit(view);
    await waitFor(() => expect(view.textContent).toContain('Une autre fiche a déjà cette identité'));
    expect((await repo.get('wine', w.id))?.domain).toBe('Fabre');
  });

  it('lève le marquage « à compléter » à l’enregistrement', async () => {
    const { ctx, repo, w } = await withWine();
    await repo.patch('wine', w.id, { needs_review: true });
    const view = await editWineView(ctx, { id: w.id });
    document.body.append(view);
    setValue(view.querySelector('#f-notes'), 'Complétée');
    submit(view);
    await waitFor(() => expect(window.location.hash).toBe(`#/vin/${w.id}`));
    expect((await repo.get('wine', w.id))?.needs_review).toBe(false);
  });

  it('une fiche introuvable est signalée', async () => {
    const { ctx } = await setup();
    expect((await editWineView(ctx, { id: 'nope' })).textContent).toContain('Fiche introuvable');
  });
});

describe('historique des sorties', () => {
  it('liste les sorties, les plus récentes d’abord, avec motif, date, emplacement et lien vers la fiche', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields({ domain: 'Fabre' }), [{ location_id: a1.id, quantity: 5, position_hint: null }]);
    const stock = (await repo.list('stock'))[0]!;
    await repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-09-01', note: null });
    await repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-10-15', note: 'Pour Marie' });
    await repo.recordOutflow(stock.id, { reason: 'broken', date: '2026-08-01', note: null });
    const view = await historyView(ctx);
    expect(view.querySelector('.app-header p')?.textContent).toBe('3 bouteilles sorties');
    const items = [...view.querySelectorAll('li.list__item')];
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Offerte · 15/10/2026'),
      expect.stringContaining('Bue · 01/09/2026'),
      expect.stringContaining('Cassée / bouchonnée · 01/08/2026'),
    ]);
    expect(items[0]!.textContent).toContain('Pour Marie');
    expect(items[0]!.textContent).toContain('Meuble A · Étagère 1');
    expect(items[0]!.querySelector('a')?.getAttribute('href')).toBe(`#/vin/${w.id}?from=%2Fhistorique`); // retour à l'historique
    const chips = [...view.querySelectorAll('.chips .chip__label')].map((c) => c.textContent);
    expect(chips).toEqual(['Bue · 1', 'Offerte · 1', 'Cassée / bouchonnée · 1']);
  });

  it('affiche un état vide', async () => {
    const { ctx } = await setup();
    const view = await historyView(ctx);
    expect(view.textContent).toContain('Aucune sortie');
    expect(view.querySelector('.app-header p')).toBeNull();
  });

  it('conserve l’historique d’une fiche supprimée : badge et lien vers la fiche, qui l’indique', async () => {
    const { ctx, repo, a1 } = await setup();
    const w = await repo.addWine(wineFields(), [{ location_id: a1.id, quantity: 1, position_hint: null }]);
    await repo.recordOutflow((await repo.list('stock'))[0]!.id, { reason: 'drunk', date: '2026-10-01', note: null });
    await repo.remove('wine', w.id);
    const view = await historyView(ctx);
    expect(view.textContent).toContain('Bue');
    expect(view.querySelector('.badge')?.textContent).toBe('Fiche supprimée');
    expect(view.querySelector('li a')?.getAttribute('href')).toBe(`#/vin/${w.id}?from=%2Fhistorique`);
    const detail = await wineDetailView(ctx, { id: w.id });
    expect(detail.querySelector('.alert')?.textContent).toContain('supprimée');
    expect(detail.querySelector('a[aria-label="Modifier la fiche"]')).toBeNull();
    expect(detail.querySelector('[aria-label="Emplacements"]')).toBeNull();
    expect(detail.textContent).toContain('Historique');
  });

  it('supprime une sortie de l’historique après confirmation', async () => {
    const { ctx, repo, a1 } = await setup();
    await repo.addWine(wineFields(), [{ location_id: a1.id, quantity: 3, position_hint: null }]);
    const stock = (await repo.list('stock'))[0]!;
    await repo.recordOutflow(stock.id, { reason: 'drunk', date: '2026-10-01', note: null });
    await repo.recordOutflow(stock.id, { reason: 'gifted', date: '2026-10-02', note: null });
    const view = await historyView(ctx);
    document.body.append(view);
    const del = () => view.querySelector<HTMLButtonElement>('.swipe__inline button')!;
    del().click();
    const dialog = await vi.waitFor(() => document.querySelector('dialog')!);
    expect(dialog.textContent).toContain('ne revient pas en stock');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Annuler')!.click(); // annulé : rien ne bouge
    await new Promise((r) => setTimeout(r, 50));
    expect(view.querySelectorAll('li.list__item')).toHaveLength(2);
    del().click();
    const dlg2 = await vi.waitFor(() => [...document.querySelectorAll('dialog')].find((d) => d.textContent?.includes('Supprimer cette sortie'))!);
    [...dlg2.querySelectorAll('button')].find((b) => b.textContent === 'Supprimer')!.click();
    await vi.waitFor(() => expect(view.querySelectorAll('li.list__item')).toHaveLength(1));
    expect((await repo.list('outflow')).filter((o) => !o.deleted)).toHaveLength(1);
  });
});
