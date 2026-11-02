// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { openPasteDialog } from '../../src/ui/components/paste-dialog';
import { addHubView } from '../../src/ui/views/add-hub';
import { addWineView } from '../../src/ui/views/add-wine';
import { proposalsView } from '../../src/ui/views/proposals';
import { RETRY_PROMPT } from '../../src/scan/prompt';
import { parseProposals } from '../../src/scan/proposal';
import { makeDevice, makeSheet, wineFields } from '../contract/helpers';

/** Marge large : les rendus jsdom ralentissent quand toute la suite tourne en parallèle. */
const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 25 });


async function setup() {
  const sheets = await makeSheet();
  const d = await makeDevice(sheets, 'dev-ui');
  await d.repo.createFurniture('Meuble A', 2);
  const shelves = (await d.repo.list('location')).sort((a, b) => a.order - b.order);
  return { ctx: { repo: d.repo } as unknown as AppContext, repo: d.repo, shelves };
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
/** Champs obligatoires : cuvée, millésime, appellation, couleur (le format a une valeur par défaut). */
const fillRequired = (view: HTMLElement): void => {
  setValue(view.querySelector('#f-cuvee'), 'Les Pierres');
  setValue(view.querySelector('#f-vintage'), '2019');
  setValue(view.querySelector('#f-appellation'), 'Saint-Joseph');
  setValue(view.querySelector('#f-color'), 'rouge');
};
const byText = (root: ParentNode, sel: string, text: string): Element | undefined =>
  [...root.querySelectorAll(sel)].find((e) => e.textContent?.includes(text));
const submit = (root: HTMLElement): void => {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};

/**
 * Choisit une étagère dans le sélecteur d'emplacement (schéma de la cave), puis, pour une étagère,
 * valide la position (zone `hint` si fournie, sinon sans précision).
 */
async function pickShelf(view: HTMLElement, name: string, rowIndex = 0, hint?: string): Promise<void> {
  click([...view.querySelectorAll('button')].filter((b) => /Choisir un emplacement|·/.test(b.textContent ?? ''))[rowIndex]);
  const dlg = await waitFor(() => {
    const d = document.querySelector('dialog');
    if (!d || d.querySelectorAll('.shelf, .place').length === 0) throw new Error('sélecteur absent');
    return d;
  });
  const target = [...dlg.querySelectorAll('.shelf, .place')].find(
    (s) => (s.getAttribute('aria-label') ?? s.textContent ?? '').startsWith(name),
  );
  click(target);
  if (target?.classList.contains('shelf')) {
    await waitFor(() => {
      if (!document.querySelector('dialog [data-hint]')) throw new Error('étape position absente');
    });
    if (hint) click(document.querySelector(`dialog [data-hint="${hint}"]`));
    click(byText(document.querySelector('dialog')!, 'button', 'Valider'));
  }
  await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('ajout manuel', () => {
  it('enregistre une fiche, son stock et ouvre l’étagère choisie', async () => {
    const { ctx, repo, shelves } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'Domaine des Lys');
    fillRequired(view);
    setValue(view.querySelector('#f-cuvee'), 'Les Pierres');
    setValue(view.querySelector('#f-vintage'), '2019');
    setValue(view.querySelector('#f-color'), 'rouge');
    await pickShelf(view, 'Étagère 2');
    setValue(view.querySelector('input[aria-label="Quantité"]'), '3');
    submit(view);

    // La navigation n'a lieu qu'une fois la fiche, le stock et la miniature enregistrés.
    await waitFor(() => expect(window.location.hash).toBe(`#/etagere/${shelves[1]!.id}`));
    const [wine] = await repo.list('wine');
    expect(wine).toMatchObject({ domain: 'Domaine des Lys', cuvee: 'Les Pierres', vintage: 2019, color: 'rouge', format: '75cl' });
    const stocks = await repo.list('stock');
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ quantity: 3, location_id: shelves[1]!.id });
  });

  it('affiche les erreurs des champs obligatoires sans rien enregistrer', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-vintage'), '1500');
    submit(view);
    await waitFor(() => expect(view.querySelector('#e-vintage')?.textContent).toContain('Millésime invalide'));
    expect(view.querySelector('#e-cuvee')?.textContent).toContain('obligatoire');
    expect(view.querySelector('#e-appellation')?.textContent).toContain('obligatoire');
    expect(view.querySelector('#e-color')?.textContent).toContain('obligatoire');
    // Le domaine, lui, est facultatif.
    expect(view.querySelector('#e-domain')?.textContent).toBe('');
    expect(view.querySelector('#f-cuvee')?.getAttribute('aria-invalid')).toBe('true');
    expect(await repo.list('wine')).toHaveLength(0);
  });

  it('exige au moins un emplacement', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'X');
    fillRequired(view);
    submit(view);
    await waitFor(() => expect(view.textContent).toContain('Choisissez au moins un emplacement'));
    expect(await repo.list('wine')).toHaveLength(0);
  });
});

describe('tanin, sucre et fenêtre de garde', () => {
  const wrap = (view: HTMLElement, id: string): Element => view.querySelector(`#f-${id}`)!.closest('label')!;

  it('montre le tanin pour les rouges et le sucre pour les autres couleurs', async () => {
    const { ctx } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    // Couleur non choisie : les deux sont proposés.
    expect(wrap(view, 'tannin').hasAttribute('hidden')).toBe(false);
    expect(wrap(view, 'dryness').hasAttribute('hidden')).toBe(false);
    setValue(view.querySelector('#f-color'), 'rouge');
    expect(wrap(view, 'tannin').hasAttribute('hidden')).toBe(false);
    expect(wrap(view, 'dryness').hasAttribute('hidden')).toBe(true);
    setValue(view.querySelector('#f-color'), 'blanc');
    expect(wrap(view, 'tannin').hasAttribute('hidden')).toBe(true);
    expect(wrap(view, 'dryness').hasAttribute('hidden')).toBe(false);
  });

  it('enregistre le tanin d’un rouge, le sucre d’un blanc et la fenêtre de garde', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'Edile');
    fillRequired(view);
    setValue(view.querySelector('#f-color'), 'rouge');
    setValue(view.querySelector('#f-tannin'), '4');
    setValue(view.querySelector('#f-drink_from'), '2025');
    setValue(view.querySelector('#f-drink_until'), '2031');
    await pickShelf(view, 'Étagère 1');
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ tannin: 4, dryness: null, drink_from: 2025, drink_until: 2031 });

    document.body.innerHTML = '';
    window.location.hash = '';
    const view2 = await addWineView(ctx);
    document.body.append(view2);
    setValue(view2.querySelector('#f-domain'), 'Blanc de Test');
    fillRequired(view2);
    setValue(view2.querySelector('#f-color'), 'blanc');
    setValue(view2.querySelector('#f-dryness'), 'demi-sec');
    await pickShelf(view2, 'Étagère 2');
    submit(view2);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(2));
    const blanc = (await repo.list('wine')).find((w) => w.domain === 'Blanc de Test');
    expect(blanc).toMatchObject({ dryness: 'demi-sec', tannin: null });
  });

  it('ignore une valeur qui ne correspond pas à la couleur choisie en dernier', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'X');
    fillRequired(view);
    setValue(view.querySelector('#f-tannin'), '5');
    setValue(view.querySelector('#f-dryness'), 'doux');
    setValue(view.querySelector('#f-color'), 'rouge'); // le sucre ne concerne pas un rouge
    await pickShelf(view, 'Étagère 1');
    submit(view);
    await waitFor(async () => expect(await repo.list('wine')).toHaveLength(1));
    expect((await repo.list('wine'))[0]).toMatchObject({ tannin: 5, dryness: null });
  });

  it('pré-remplit tanin, sucre et fenêtre de garde depuis la proposition de Claude', async () => {
    const { ctx, repo } = await setup();
    const p = parseProposals(
      JSON.stringify({ domain: 'Edile', color: 'rouge', tannin: 3, drink_from: 2025, drink_until: 2031 }),
    ).proposals[0]!;
    const prop = await repo.createProposal(p, 'paste');
    window.location.hash = `#/ajouter/saisie?proposal=${prop.id}`;
    const view = await addWineView(ctx);
    document.body.append(view);
    expect((view.querySelector('#f-tannin') as HTMLSelectElement).value).toBe('3');
    expect((view.querySelector('#f-drink_from') as HTMLInputElement).value).toBe('2025');
    expect((view.querySelector('#f-drink_until') as HTMLInputElement).value).toBe('2031');
  });
});

describe('position sur l’étagère (choix graphique)', () => {
  it('enregistre la zone touchée dans le schéma de l’étagère', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'Domaine des Lys');
    fillRequired(view);
    await pickShelf(view, 'Étagère 1', 0, 'droite');
    expect(view.textContent).toContain('Meuble A · Étagère 1 · droite');
    submit(view);
    await waitFor(async () => expect((await repo.list('stock'))[0]?.position_hint).toBe('droite'));
  });

  it('une zone touchée deux fois est désélectionnée ; « Sans précision » ne mémorise rien', async () => {
    const { ctx, repo } = await setup();
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'X');
    fillRequired(view);
    click([...view.querySelectorAll('button')].find((b) => b.textContent?.includes('Choisir un emplacement')));
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d || !d.querySelector('.shelf')) throw new Error('absent');
      return d;
    });
    click([...dlg.querySelectorAll('.shelf')][0]);
    await waitFor(() => expect(dlg.querySelector('[data-hint="gauche"]')).not.toBeNull());
    click(dlg.querySelector('[data-hint="gauche"]'));
    expect(dlg.querySelector('[data-hint="gauche"]')?.getAttribute('aria-checked')).toBe('true');
    click(dlg.querySelector('[data-hint="gauche"]'));
    expect(dlg.querySelector('[data-hint="gauche"]')?.getAttribute('aria-checked')).toBe('false');
    click(dlg.querySelector('[data-hint="dessus"]'));
    click(byText(dlg, 'button', 'Sans précision'));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(view.textContent).not.toContain('dessus');
    submit(view);
    await waitFor(async () => expect((await repo.list('stock'))[0]?.position_hint).toBeNull());
  });

  it('montre les bouteilles déjà rangées dans chaque zone et permet de revenir au schéma', async () => {
    const { ctx, repo } = await setup();
    const shelf = (await repo.list('location')).find((l) => l.name === 'Étagère 1')!;
    const w = await repo.addWine(wineFields(), [
      { location_id: shelf.id, quantity: 2, position_hint: 'gauche' },
    ]);
    expect(w.id).toBeTruthy();
    const view = await addWineView(ctx);
    document.body.append(view);
    click([...view.querySelectorAll('button')].find((b) => b.textContent?.includes('Choisir un emplacement')));
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d || !d.querySelector('.shelf')) throw new Error('absent');
      return d;
    });
    click(dlg.querySelector(`[data-location-id="${shelf.id}"]`));
    await waitFor(() => expect(dlg.querySelector('[data-hint="gauche"]')).not.toBeNull());
    expect(dlg.querySelector('[data-hint="gauche"]')?.getAttribute('aria-label')).toContain('2 bouteilles déjà rangées');
    click(byText(dlg, 'button', 'Retour'));
    await waitFor(() => expect(dlg.querySelector('.shelf')).not.toBeNull());
  });

  it('un lieu (pièce) n’a pas d’étape de position', async () => {
    const { ctx, repo } = await setup();
    await repo.createPlace('Cellier');
    const view = await addWineView(ctx);
    document.body.append(view);
    setValue(view.querySelector('#f-domain'), 'X');
    fillRequired(view);
    await pickShelf(view, 'Cellier');
    expect(view.textContent).toContain('Cellier');
    submit(view);
    await waitFor(async () => expect((await repo.list('stock'))[0]?.position_hint).toBeNull());
  });
});

describe('doublons', () => {
  async function withExisting() {
    const s = await setup();
    const wine = await s.repo.addWine(
      wineFields({ domain: 'Domaine des Lys', cuvee: 'Les Pierres', vintage: 2019 }),
      [{ location_id: s.shelves[0]!.id, quantity: 2, position_hint: null }],
    );
    return { ...s, wine };
  }
  const fillSame = (view: HTMLElement, extra: Record<string, string> = {}): void => {
    setValue(view.querySelector('#f-domain'), 'domaine des lys');
    fillRequired(view);
    setValue(view.querySelector('#f-cuvee'), 'les pierres');
    setValue(view.querySelector('#f-vintage'), '2019');
    for (const [id, v] of Object.entries(extra)) setValue(view.querySelector(`#f-${id}`), v);
  };

  it('« Ajouter une bouteille » augmente la quantité sans créer de doublon', async () => {
    const { ctx, repo, shelves, wine } = await withExisting();
    const view = await addWineView(ctx);
    document.body.append(view);
    fillSame(view);
    await pickShelf(view, 'Étagère 2');
    submit(view);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    expect(dlg.textContent).toContain('Cette fiche existe déjà');
    expect(dlg.textContent).toContain('2 bouteilles en stock');
    click(byText(dlg, 'button', 'Ajouter une bouteille'));
    await waitFor(async () => expect((await repo.list('stock')).length).toBe(2));
    expect(await repo.list('wine')).toHaveLength(1);
    const added = (await repo.list('stock')).find((s) => s.location_id === shelves[1]!.id);
    expect(added).toMatchObject({ wine_id: wine.id, quantity: 1 });
  });

  it('« Compléter la fiche » applique seulement les champs cochés et ne change aucune quantité', async () => {
    const { ctx, repo, wine } = await withExisting();
    await repo.patch('wine', wine.id, { appellation: 'Saint-Joseph' });
    const view = await addWineView(ctx);
    document.body.append(view);
    fillSame(view, { region: 'Rhône', appellation: 'Crozes-Hermitage' });
    submit(view);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    // Région (vide) cochée par défaut, appellation (différente) décochée.
    expect((dlg.querySelector('#chg-region') as HTMLInputElement).checked).toBe(true);
    expect((dlg.querySelector('#chg-appellation') as HTMLInputElement).checked).toBe(false);
    click(byText(dlg, 'button', 'Compléter la fiche existante'));
    await waitFor(async () => expect((await repo.get('wine', wine.id))?.region).toBe('Rhône'));
    const updated = await repo.get('wine', wine.id);
    expect(updated?.appellation).toBe('Saint-Joseph');
    expect((await repo.list('stock'))[0]?.quantity).toBe(2);
    expect(await repo.list('wine')).toHaveLength(1);
  });

  it('annuler le dialogue ne modifie rien', async () => {
    const { ctx, repo } = await withExisting();
    const view = await addWineView(ctx);
    document.body.append(view);
    fillSame(view);
    await pickShelf(view, 'Étagère 2');
    submit(view);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    click(byText(dlg, 'button', 'Annuler'));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect((await repo.list('stock')).length).toBe(1);
  });
});

describe('propositions du projet Claude', () => {
  it('pré-remplit le formulaire depuis une proposition puis la marque importée', async () => {
    const { ctx, repo, shelves } = await setup();
    const p = parseProposals(
      JSON.stringify({ domain: 'Château Z', cuvee: 'Grande Cuvée', vintage: 2015, appellation: 'Pauillac', color: 'rouge', quantity: 2 }),
    ).proposals[0]!;
    const prop = await repo.createProposal(p, 'paste');
    window.location.hash = `#/ajouter/saisie?proposal=${prop.id}`;

    const view = await addWineView(ctx);
    document.body.append(view);
    expect((view.querySelector('#f-domain') as HTMLInputElement).value).toBe('Château Z');
    expect((view.querySelector('#f-vintage') as HTMLInputElement).value).toBe('2015');
    expect((view.querySelector('#f-color') as HTMLSelectElement).value).toBe('rouge');
    expect((view.querySelector('input[aria-label="Quantité"]') as HTMLInputElement).value).toBe('2');
    expect(view.textContent).toContain('proposition de Claude');
    fillRequired(view); // couleur et appellation complétées par l'utilisateur

    await pickShelf(view, 'Étagère 1');
    submit(view);
    await waitFor(async () => expect(await repo.pendingProposals()).toHaveLength(0));
    expect((await repo.list('stock'))[0]).toMatchObject({ quantity: 2, location_id: shelves[0]!.id });
    expect((await repo.get('proposal', prop.id))?.status).toBe('importée');
  });

  it('liste les propositions en attente et permet de les écarter', async () => {
    const { ctx, repo } = await setup();
    const p = parseProposals(JSON.stringify({ domain: 'A', vintage: 2020 })).proposals[0]!;
    await repo.createProposal(p, 'paste');
    const view = await proposalsView(ctx);
    document.body.append(view);
    expect(view.textContent).toContain('Collée');
    click(view.querySelector('button[aria-label^="Écarter"]'));
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    click(byText(dlg, 'button', 'Écarter'));
    await waitFor(() => expect(view.textContent).toContain('Aucune proposition en attente'));
    expect(await repo.pendingProposals()).toHaveLength(0);
  });

  it('le hub affiche le nombre de propositions en attente', async () => {
    const { ctx, repo } = await setup();
    const p = parseProposals(JSON.stringify({ domain: 'A' })).proposals[0]!;
    await repo.createProposal(p, 'paste');
    await repo.createProposal(p, 'claude');
    const view = await addHubView(ctx);
    expect(view.querySelector('a[href="#/propositions"] .badge')?.textContent).toBe('2');
    expect(view.querySelector('a[href="#/ajouter/saisie"]')).not.toBeNull();
  });
});

describe('coller depuis Claude', () => {
  it('importe un JSON valide en proposition', async () => {
    const { ctx, repo } = await setup();
    const done = openPasteDialog(ctx);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    setValue(dlg.querySelector('textarea[aria-label="JSON de la proposition"]'), 'Voici :\n```json\n{"domain":"Domaine X","vintage":2019}\n```');
    click(byText(dlg, 'button', 'Importer'));
    const ids = await done;
    expect(ids).toHaveLength(1);
    expect((await repo.pendingProposals())[0]).toMatchObject({ domain: 'Domaine X', source: 'paste' });
  });

  it('refuse un texte sans JSON, sans rien créer, et reste ouvert', async () => {
    const { ctx, repo } = await setup();
    void openPasteDialog(ctx);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    setValue(dlg.querySelector('textarea[aria-label="JSON de la proposition"]'), 'bonjour');
    click(byText(dlg, 'button', 'Importer'));
    await waitFor(() => expect(dlg.textContent).toContain('ne contient pas de JSON'));
    expect(document.querySelector('dialog')).not.toBeNull();
    expect(await repo.pendingProposals()).toHaveLength(0);
  });

  it('quand Claude répond en texte libre : explique et propose de copier la consigne de relance', async () => {
    const { ctx, repo } = await setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    void openPasteDialog(ctx);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    setValue(
      dlg.querySelector('textarea[aria-label="JSON de la proposition"]'),
      'Rouge Edile, Saint-Joseph 2021. Tanins moyens, année optimale de dégustation de 2025 à 2031.',
    );
    click(byText(dlg, 'button', 'Importer'));
    await waitFor(() => expect(dlg.textContent).toContain('a répondu en texte libre'));
    click(byText(dlg, 'button', 'Copier la consigne de relance'));
    await waitFor(() => expect(dlg.textContent).toContain('Consigne de relance copiée'));
    expect(writeText).toHaveBeenCalledWith(RETRY_PROMPT);
    expect(await repo.pendingProposals()).toHaveLength(0);
    expect(document.querySelector('dialog')).not.toBeNull();
  });

  it('signale les avertissements avant de continuer', async () => {
    const { ctx } = await setup();
    const done = openPasteDialog(ctx);
    const dlg = await waitFor(() => {
      const d = document.querySelector('dialog');
      if (!d) throw new Error('dialogue absent');
      return d;
    });
    setValue(dlg.querySelector('textarea[aria-label="JSON de la proposition"]'), '{"domain":"X","vintage":3000}');
    click(byText(dlg, 'button', 'Importer'));
    await waitFor(() => expect(dlg.textContent).toContain('avertissements'));
    click(byText(dlg, 'button', 'Continuer'));
    expect(await done).toHaveLength(1);
  });
});
