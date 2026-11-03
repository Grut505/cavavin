// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/app';
import { PrefillError, buildPrefillLink, fromBase64Url, readPrefill, toBase64Url } from '../../src/scan/prefill-link';
import { parseProposals } from '../../src/scan/proposal';
import { addWineView } from '../../src/ui/views/add-wine';
import { makeDevice, makeSheet } from '../contract/helpers';

const params = (qs: string): URLSearchParams => new URLSearchParams(qs);
const BASE = 'https://grut505.github.io/cavavin/';

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('lien de pré-remplissage', () => {
  it('base64url : aller-retour avec accents et caractères spéciaux', () => {
    const t = '{"cuvee":"La Mémé — Côtes-du-Rhône ☀"}';
    expect(fromBase64Url(toBase64Url(t))).toBe(t);
    expect(toBase64Url(t)).not.toMatch(/[+/=]/);
  });

  it('construit puis relit un lien (forme courante)', () => {
    const link = buildPrefillLink(BASE, { domain: 'Domaine Gramenon', cuvee: 'La Mémé', vintage: 2020, appellation: 'Côtes-du-Rhône', pairings: ['curry de légumes', 'gratin dauphinois'], notes: null });
    expect(link.startsWith(`${BASE}#/ajouter/saisie?`)).toBe(true);
    expect(link).not.toMatch(/\s/);
    const data = readPrefill(params(link.split('?')[1]!))!;
    expect(data).toMatchObject({ domain: 'Domaine Gramenon', cuvee: 'La Mémé', vintage: '2020', appellation: 'Côtes-du-Rhône', pairings: 'curry de légumes; gratin dauphinois' });
    expect(data).not.toHaveProperty('notes');
  });

  it('lit la forme compacte (JSON en base64url ou JSON brut)', () => {
    const obj = { domain: 'D', vintage: 2019 };
    expect(readPrefill(params(`fiche=${toBase64Url(JSON.stringify(obj))}`))).toEqual(obj);
    expect(readPrefill(params(`fiche=${encodeURIComponent(JSON.stringify([obj]))}`))).toEqual(obj);
  });

  it('refuse un lien illisible ou démesuré, ignore les paramètres inconnus', () => {
    expect(() => readPrefill(params('fiche=%%%'))).toThrow(PrefillError);
    expect(() => readPrefill(params(`fiche=${'a'.repeat(9000)}`))).toThrow(/trop long/);
    expect(() => readPrefill(params(`domain=${'x'.repeat(700)}`))).toThrow(/trop long/);
    expect(readPrefill(params('from=%2Fliste&direct=1'))).toBeNull();
    expect(readPrefill(params('evil=1&domain=Ok'))).toEqual({ domain: 'Ok' });
  });

  it('l’exemple du projet Claude se lit comme le JSON de l’exemple', () => {
    const md = readFileSync('claude-project/INSTRUCTIONS.md', 'utf-8');
    const link = md.match(/`(https:\/\/grut505\.github\.io\/cavavin\/#\/ajouter\/saisie\?domain=Domaine%20Gramenon[^`]+)`/)![1]!;
    const { proposals, warnings } = parseProposals(JSON.stringify(readPrefill(params(link.split('?')[1]!))));
    expect(warnings).toEqual([]);
    expect(proposals[0]).toMatchObject({ domain: 'Domaine Gramenon', cuvee: 'La Mémé', vintage: 2020, appellation: 'Côtes-du-Rhône', color: 'rouge', quantity: 3, tannin: 3, drink_from: 2022, drink_until: 2028 });
    expect(proposals[0]!.pairings).toContain('gratin dauphinois');
  });
});

describe('formulaire ouvert par un lien', () => {
  const open = async () => {
    const d = await makeDevice(await makeSheet(), 'dev-link');
    await d.repo.createFurniture('Meuble', 1);
    const ctx = { repo: d.repo, scheduler: { syncNow: vi.fn() } } as unknown as AppContext;
    return { d, ctx };
  };
  const val = (v: HTMLElement, id: string): string => (v.querySelector(`#f-${id}`) as HTMLInputElement).value;

  it('pré-remplit sans rien enregistrer, et écarte les valeurs invalides ou non végétariennes', async () => {
    const { d, ctx } = await open();
    window.location.hash = '#/ajouter/saisie?domain=Gramenon&vintage=2020&appellation=C%C3%B4tes-du-Rh%C3%B4ne&color=rouge&tannin=9&pairings=risotto%3B%20poulet%20r%C3%B4ti&quantity=3';
    const view = await addWineView(ctx);
    expect(val(view, 'domain')).toBe('Gramenon');
    expect(val(view, 'vintage')).toBe('2020');
    expect(val(view, 'appellation')).toBe('Côtes-du-Rhône');
    expect(val(view, 'tannin')).toBe(''); // 9 hors bornes
    expect(val(view, 'pairings')).toBe('risotto'); // poulet retiré
    expect(view.querySelector('[data-prefill]')!.textContent).toContain('lien de Claude');
    expect(view.querySelector('[data-prefill]')!.textContent).toContain('non végétariens');
    expect(await d.repo.list('wine')).toHaveLength(0);
    expect(await d.repo.list('proposal')).toHaveLength(0);
  });

  it('un lien illisible laisse le formulaire vide avec un message', async () => {
    const { ctx } = await open();
    window.location.hash = '#/ajouter/saisie?fiche=%%%';
    const view = await addWineView(ctx);
    expect(view.querySelector('.alert--error')!.textContent).toContain('illisible');
    expect(val(view, 'domain')).toBe('');
  });

  it('dans un navigateur sans cave, propose de copier ou d’envoyer à la cave', async () => {
    const d = await makeDevice(await makeSheet(), 'dev-safari'); // aucune cave : stockage vierge, comme Safari à côté de la PWA
    const ctx = { repo: d.repo, scheduler: { syncNow: vi.fn() } } as unknown as AppContext;
    window.location.hash = '#/ajouter/saisie?domain=Gramenon';
    const view = await addWineView(ctx);
    const labels = [...view.querySelectorAll('[data-prefill] button')].map((b) => b.textContent);
    expect(labels).toEqual(['Envoyer à ma cave', 'Copier pour l’appli installée']);
  });
});
