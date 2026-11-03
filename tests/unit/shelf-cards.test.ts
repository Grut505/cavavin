// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/app';
import { openUrgencyLegend } from '../../src/ui/components/urgency-legend';
import { addWineView } from '../../src/ui/views/add-wine';
import { shelfDetailView } from '../../src/ui/views/shelf-detail';
import { contextOf, makeDevice, makeSheet, wineFields } from '../contract/helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('étagère : mêmes cartes que la Liste', () => {
  it('affiche appellation, région, couleur, domaine/cuvée, position et la quantité de CET emplacement', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-shelf-cards');
    await d.repo.createFurniture('Armoire', 2);
    const [s1, s2] = (await d.repo.list('location')).filter((l) => l.kind === 'shelf');
    const w = await d.repo.addWine(
      wineFields({ domain: 'Fabre', cuvee: 'Les Pins', vintage: 2015, appellation: 'Saint-Joseph', region: 'Vallée du Rhône', country: 'France', color: 'rouge', tannin: 3 }),
      [{ location_id: s1!.id, quantity: 2, position_hint: 'milieu-droite' }, { location_id: s2!.id, quantity: 5, position_hint: null }],
    );
    const view = await shelfDetailView(contextOf(d) as AppContext, { id: s1!.id });
    const card = view.querySelector('a.wine-card')!;
    expect(card.querySelector('.wine-card__domain')!.textContent).toBe('Saint-Joseph · 2015'); // l'appellation d'abord
    expect(card.querySelector('.wine-card__title')!.textContent).toBe('Vallée du Rhône · France');
    expect(card.querySelector('.wine-card__maker')!.textContent).toBe('Fabre · Les Pins');
    expect(card.textContent).toContain('Rouge');
    expect(card.textContent).toContain('Tanin 3/5');
    expect(card.textContent).toContain('Position : Milieu · droite');
    expect(card.textContent).not.toContain('Sans emplacement'); // l'emplacement est évident ici : pas de ligne trompeuse
    expect(card.querySelector('.badge')!.textContent).toBe('×2'); // sur cette étagère, pas le total de la fiche
    expect(card.getAttribute('href')).toContain(`#/vin/${w.id}?from=`);
  });
});

describe('barre « Enregistrer » collante', () => {
  it('ne « remonte » pas tout en bas : le formulaire déborde de la marge basse de la page', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-bar');
    const view = await addWineView(contextOf(d) as AppContext);
    expect(view.querySelector('form')!.classList.contains('form--with-bar')).toBe(true);

    const css = readFileSync('src/ui/styles/components.css', 'utf-8');
    const bar = /\.form-bar \{([^}]*)\}/.exec(css)![1]!;
    expect(bar).toMatch(/position:\s*sticky/);
    expect(bar).toMatch(/bottom:\s*calc\(var\(--nav-h\) \+ var\(--safe-bottom\)\)/);
    // même valeur que le padding-bas de .view (space-5) : la position naturelle rejoint la position collée
    expect(/\.form--with-bar \{([^}]*)\}/.exec(css)![1]).toMatch(/margin-bottom:\s*calc\(-1 \* var\(--space-5\)\)/);
    expect(/\.view \{([^}]*)\}/.exec(readFileSync('src/ui/styles/base.css', 'utf-8'))![1]).toMatch(/padding:[^;]*calc\(var\(--nav-h\) \+ var\(--safe-bottom\) \+ var\(--space-5\)\)/);
  });
});

describe('pastille de l’onglet Cave', () => {
  it('la légende des couleurs explique ce qu’elle compte', () => {
    openUrgencyLegend();
    expect(document.querySelector('dialog')!.textContent).toContain('La pastille rouge sur l’onglet Cave compte les bouteilles en retard ou à finir');
  });
});
