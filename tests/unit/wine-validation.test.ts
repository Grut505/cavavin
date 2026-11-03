import { describe, expect, it } from 'vitest';
import { emptyDraft, formatDateFr, validateWine, wineHeading, wineTitle, type WineDraft } from '../../src/domain/wine';

/** Fiche valide minimale : millésime, appellation, couleur et format sont les seuls obligatoires. */
const draft = (over: Partial<WineDraft> = {}): WineDraft => ({
  ...emptyDraft(),
  vintage: '2019',
  appellation: 'Saint-Joseph',
  color: 'rouge',
  ...over,
});
const NOW = new Date('2026-11-02T10:00:00Z');

const issues = (d: WineDraft): string[] => {
  const r = validateWine(d, NOW);
  return r.ok ? [] : r.issues.map((i) => i.field);
};

describe('champs obligatoires', () => {
  it('accepte une fiche réduite aux quatre champs obligatoires (ni domaine ni cuvée)', () => {
    const r = validateWine(draft(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        domain: '',
        cuvee: '—', // pas de cuvée : enregistrée comme « sans cuvée »
        vintage: 2019,
        appellation: 'Saint-Joseph',
        color: 'rouge',
        format: '75cl',
        region: null,
        country: null,
        drink_from: null,
        drink_until: null,
        tannin: null,
        dryness: null,
        purchase_price: null,
        rating: null,
        gift: false,
        gift_from: null,
      });
    }
  });

  it('exige millésime, appellation, couleur et format — et eux seuls', () => {
    expect(issues(emptyDraft()).sort()).toEqual(['appellation', 'color', 'vintage']);
    expect(issues(draft({ cuvee: ' ' }))).toEqual([]); // la cuvée est facultative
    expect(issues(draft({ vintage: '' }))).toEqual(['vintage']);
    expect(issues(draft({ appellation: '' }))).toEqual(['appellation']);
    expect(issues(draft({ color: '' }))).toEqual(['color']);
    expect(issues(draft({ format: '' }))).toEqual(['format']);
  });

  it('le domaine, la cuvée, la région, le pays, le tanin, le sucre et la fenêtre de garde sont facultatifs', () => {
    for (const f of ['domain', 'cuvee', 'region', 'country', 'tannin', 'dryness', 'drink_from', 'drink_until', 'supplier', 'notes'] as const) {
      expect(issues(draft({ [f]: '' })), f).toEqual([]);
    }
    expect(validateWine(draft({ domain: '  Domaine   X ' }), NOW)).toMatchObject({ ok: true, value: { domain: 'Domaine X' } });
  });
});

describe('validateWine', () => {
  it('valide le millésime (borne haute = année suivante, « NV » = non millésimé)', () => {
    expect(issues(draft({ vintage: '2019' }))).toEqual([]);
    expect(issues(draft({ vintage: '2027' }))).toEqual([]);
    expect(issues(draft({ vintage: '2028' }))).toContain('vintage');
    expect(issues(draft({ vintage: '1850' }))).toContain('vintage');
    expect(issues(draft({ vintage: 'abc' }))).toContain('vintage');
    const nv = validateWine(draft({ vintage: 'nv' }), NOW);
    expect(nv.ok && nv.value.vintage).toBe(null);
  });

  it('valide la fenêtre de garde quand elle est donnée : années plausibles, bon ordre', () => {
    expect(issues(draft({ drink_from: '2025', drink_until: '2030' }))).toEqual([]);
    expect(issues(draft({ drink_from: '2031', drink_until: '2030' }))).toContain('drink_until');
    expect(issues(draft({ drink_from: '2025' }))).toEqual([]);
    expect(issues(draft({ drink_until: '2030' }))).toEqual([]);
    expect(issues(draft({ drink_from: '12', drink_until: '2030' }))).toContain('drink_from');
    const ok = validateWine(draft({ drink_from: '2025', drink_until: '2025' }), NOW);
    expect(ok.ok && [ok.value.drink_from, ok.value.drink_until]).toEqual([2025, 2025]);
  });

  it('accepte le prix avec virgule, refuse un prix négatif', () => {
    const r = validateWine(draft({ purchase_price: '12,50' }), NOW);
    expect(r.ok && r.value.purchase_price).toBe(12.5);
    expect(issues(draft({ purchase_price: '-3' }))).toContain('purchase_price');
    expect(issues(draft({ purchase_price: 'cher' }))).toContain('purchase_price');
  });

  it('accepte la date au format jj/mm/aaaa ou ISO et la stocke en ISO', () => {
    const fr = validateWine(draft({ purchase_date: '05/03/2024' }), NOW);
    expect(fr.ok && fr.value.purchase_date).toBe('2024-03-05');
    const iso = validateWine(draft({ purchase_date: '2024-03-05' }), NOW);
    expect(iso.ok && iso.value.purchase_date).toBe('2024-03-05');
    expect(issues(draft({ purchase_date: '31/02/2024' }))).toContain('purchase_date');
    expect(formatDateFr('2024-03-05')).toBe('05/03/2024');
  });

  it('borne la note de 1 à 5', () => {
    expect(issues(draft({ rating: '4' }))).toEqual([]);
    expect(issues(draft({ rating: '0' }))).toContain('rating');
    expect(issues(draft({ rating: '6' }))).toContain('rating');
  });

  it('valide le tanin (1 à 5) et le niveau de sucre', () => {
    const t = validateWine(draft({ tannin: '3' }), NOW);
    expect(t.ok && t.value.tannin).toBe(3);
    expect(issues(draft({ tannin: '0' }))).toContain('tannin');
    expect(issues(draft({ tannin: '6' }))).toContain('tannin');
    expect(issues(draft({ tannin: '2,5' }))).toContain('tannin');
    const d = validateWine(draft({ color: 'blanc', dryness: 'demi-sec' }), NOW);
    expect(d.ok && d.value.dryness).toBe('demi-sec');
    expect(issues(draft({ dryness: 'brut' }))).toContain('dryness');
  });

  it('enregistre le cadeau et la personne qui l’a offert, seulement si « cadeau » est coché', () => {
    const g = validateWine(draft({ gift: 'true', gift_from: 'p1' }), NOW);
    expect(g.ok && [g.value.gift, g.value.gift_from]).toEqual([true, 'p1']);
    const noPerson = validateWine(draft({ gift: 'true', gift_from: '' }), NOW);
    expect(noPerson.ok && [noPerson.value.gift, noPerson.value.gift_from]).toEqual([true, null]);
    const notGift = validateWine(draft({ gift: '', gift_from: 'p1' }), NOW);
    expect(notGift.ok && [notGift.value.gift, notGift.value.gift_from]).toEqual([false, null]);
  });

  it('refuse une couleur ou un format hors liste', () => {
    expect(issues(draft({ color: 'rouge', format: 'magnum' }))).toEqual([]);
    expect(issues(draft({ color: 'bleu' }))).toContain('color');
    expect(issues(draft({ format: 'géant' }))).toContain('format');
  });
});

describe('wineTitle', () => {
  it('met le domaine en titre quand il existe', () => {
    expect(wineTitle({ domain: 'Fabre', cuvee: 'Les Pins', vintage: 2015 })).toEqual({ primary: 'Fabre', secondary: 'Les Pins · 2015' });
  });
  it('met la cuvée en titre quand le domaine est absent', () => {
    expect(wineTitle({ domain: '', cuvee: 'Rouge Edile', vintage: 2021 })).toEqual({ primary: 'Rouge Edile', secondary: '2021' });
    expect(wineTitle({ domain: '', cuvee: 'Brut', vintage: null })).toEqual({ primary: 'Brut', secondary: 'NV' });
  });
  it('ignore la cuvée « — » des anciennes fiches', () => {
    expect(wineTitle({ domain: 'Fabre', cuvee: '—', vintage: 2015 })).toEqual({ primary: 'Fabre', secondary: '2015' });
    expect(wineTitle({ domain: '', cuvee: '—', vintage: null })).toEqual({ primary: 'Sans nom', secondary: 'NV' });
  });
});

describe('titres sans domaine ni cuvée', () => {
  it('retombe sur l’appellation', () => {
    expect(wineTitle({ domain: '', cuvee: '—', vintage: 2019, appellation: 'Saint-Joseph' })).toEqual({ primary: 'Saint-Joseph', secondary: '2019' });
    expect(wineTitle({ domain: '', cuvee: '—', vintage: null })).toEqual({ primary: 'Sans nom', secondary: 'NV' });
    expect(wineTitle({ domain: 'Gramenon', cuvee: 'La Mémé', vintage: 2020, appellation: 'Côtes-du-Rhône' })).toEqual({ primary: 'Gramenon', secondary: 'La Mémé · 2020' });
  });

  it('titre des listes : appellation et millésime d’abord, région ensuite, domaine et cuvée en petit', () => {
    expect(wineHeading({ domain: 'Gramenon', cuvee: 'La Mémé', vintage: 2020, appellation: 'Côtes-du-Rhône', region: 'Vallée du Rhône', country: 'France' })).toEqual({
      primary: 'Côtes-du-Rhône · 2020',
      region: 'Vallée du Rhône · France',
      maker: 'Gramenon · La Mémé',
    });
    expect(wineHeading({ domain: '', cuvee: '—', vintage: null, appellation: 'Champagne', region: null, country: null })).toEqual({ primary: 'Champagne · NV', region: '', maker: '' });
    // sans appellation : le domaine (ou la cuvée) fait le titre
    expect(wineHeading({ domain: 'Gramenon', cuvee: 'La Mémé', vintage: 2020, appellation: null, region: null, country: null })).toEqual({ primary: 'Gramenon · 2020', region: '', maker: 'La Mémé' });
    expect(wineHeading({ domain: '', cuvee: 'La Mémé', vintage: 2020, appellation: null, region: null, country: null }).primary).toBe('La Mémé · 2020');
  });
});
