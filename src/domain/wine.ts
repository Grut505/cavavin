// Fiche de vin : saisie (brouillon texte), validation et normalisation. Voir data-model.md.
import {
  BOTTLE_FORMATS,
  DRYNESS_LEVELS,
  WINE_COLORS,
  type BottleFormat,
  type Dryness,
  type Wine,
  type WineColor,
} from './types';
import { joinPairings, parsePairings, splitVegetarian } from './pairing-list';

/** Champs de la fiche modifiables par l'utilisateur (hors champs techniques). */
export type WineFields = Pick<
  Wine,
  | 'domain'
  | 'cuvee'
  | 'vintage'
  | 'appellation'
  | 'region'
  | 'country'
  | 'color'
  | 'format'
  | 'drink_from'
  | 'drink_until'
  | 'purchase_price'
  | 'purchase_date'
  | 'supplier'
  | 'rating'
  | 'notes'
  | 'tannin'
  | 'dryness'
  | 'gift'
  | 'gift_from'
  | 'pairings'
>;

/** Valeurs telles que saisies dans le formulaire (texte brut). */
export interface WineDraft {
  domain: string;
  cuvee: string;
  vintage: string;
  appellation: string;
  region: string;
  country: string;
  color: string;
  format: string;
  drink_from: string;
  drink_until: string;
  purchase_price: string;
  purchase_date: string;
  supplier: string;
  rating: string;
  notes: string;
  tannin: string;
  dryness: string;
  /** `'true'` si la bouteille est un cadeau, sinon vide. */
  gift: string;
  /** Identifiant de la personne (liste des réglages), seulement si cadeau. */
  gift_from: string;
  /** Mets conseillés (virgules ou points-virgules). */
  pairings: string;
}

export const NO_CUVEE = '—';
export const MIN_YEAR = 1900;

export function emptyDraft(): WineDraft {
  return {
    domain: '',
    cuvee: '',
    vintage: '',
    appellation: '',
    region: '',
    country: '',
    color: '',
    format: '75cl',
    drink_from: '',
    drink_until: '',
    purchase_price: '',
    purchase_date: '',
    supplier: '',
    rating: '',
    notes: '',
    tannin: '',
    dryness: '',
    gift: '',
    gift_from: '',
    pairings: '',
  };
}

export interface ValidationIssue {
  field: keyof WineDraft;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: WineFields }
  | { ok: false; issues: ValidationIssue[] };

const text = (s: string): string | null => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t === '' ? null : t;
};

/** « 05/03/2024 » ou « 2024-03-05 » → « 2024-03-05 » ; null si invalide. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (fr) [d, m, y] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function validateWine(draft: WineDraft, now: Date = new Date()): ValidationResult {
  const issues: ValidationIssue[] = [];
  const bad = (field: keyof WineDraft, message: string): void => void issues.push({ field, message });
  const maxVintage = now.getUTCFullYear() + 1;

  // Obligatoires : millésime, appellation, couleur, format. Le domaine et la cuvée (souvent introuvables) sont
  // facultatifs : une cuvée vide est enregistrée comme « sans cuvée » (—).
  const domain = text(draft.domain) ?? '';
  const cuvee = text(draft.cuvee) ?? NO_CUVEE;
  const appellation = text(draft.appellation);
  if (!appellation) bad('appellation', 'L’appellation est obligatoire.');

  let vintage: number | null = null;
  const v = draft.vintage.trim();
  if (v === '') {
    bad('vintage', 'Le millésime est obligatoire (une année, ou « NV » si non millésimé).');
  } else if (v.toUpperCase() !== 'NV') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < MIN_YEAR || n > maxVintage) {
      bad('vintage', `Millésime invalide (entre ${MIN_YEAR} et ${maxVintage}, ou « NV »).`);
    } else vintage = n;
  }

  const year = (field: 'drink_from' | 'drink_until'): number | null => {
    const s = draft[field].trim();
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < MIN_YEAR || n > 2200) {
      bad(field, 'Année invalide.');
      return null;
    }
    return n;
  };
  const drinkFrom = year('drink_from');
  const drinkUntil = year('drink_until');
  if (drinkFrom !== null && drinkUntil !== null && drinkFrom > drinkUntil) {
    bad('drink_until', '« À boire avant » doit être postérieur à « à boire à partir de ».');
  }

  let price: number | null = null;
  const p = draft.purchase_price.trim().replace(/\s/g, '').replace(',', '.');
  if (p !== '') {
    const n = Number(p);
    if (Number.isNaN(n) || n < 0) bad('purchase_price', 'Prix invalide.');
    else price = Math.round(n * 100) / 100;
  }

  let purchaseDate: string | null = null;
  if (draft.purchase_date.trim() !== '') {
    purchaseDate = parseDate(draft.purchase_date);
    if (!purchaseDate) bad('purchase_date', 'Date invalide (jj/mm/aaaa).');
  }

  let rating: number | null = null;
  if (draft.rating.trim() !== '') {
    const n = Number(draft.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) bad('rating', 'La note va de 1 à 5.');
    else rating = n;
  }

  let tannin: number | null = null;
  if (draft.tannin.trim() !== '') {
    const n = Number(draft.tannin);
    if (!Number.isInteger(n) || n < 1 || n > 5) bad('tannin', 'Le tanin se note de 1 à 5.');
    else tannin = n;
  }

  let dryness: Dryness | null = null;
  if (draft.dryness.trim() !== '') {
    if ((DRYNESS_LEVELS as readonly string[]).includes(draft.dryness)) dryness = draft.dryness as Dryness;
    else bad('dryness', 'Niveau de sucre inconnu.');
  }

  const pairings = splitVegetarian(parsePairings(draft.pairings));
  if (pairings.dropped.length > 0) {
    bad('pairings', `La cave est en mode végétarien : retirez ${pairings.dropped.map((d) => `« ${d} »`).join(', ')}.`);
  }

  let color: WineColor | null = null;
  if (draft.color.trim() === '') bad('color', 'La couleur est obligatoire.');
  else if ((WINE_COLORS as readonly string[]).includes(draft.color)) color = draft.color as WineColor;
  else bad('color', 'Couleur inconnue.');

  let format: BottleFormat = '75cl';
  if (draft.format.trim() === '') bad('format', 'Le format est obligatoire.');
  else if ((BOTTLE_FORMATS as readonly string[]).includes(draft.format)) format = draft.format as BottleFormat;
  else bad('format', 'Format inconnu.');

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      domain,
      cuvee,
      vintage,
      appellation: appellation!,
      region: text(draft.region),
      country: text(draft.country),
      color,
      format,
      drink_from: drinkFrom,
      drink_until: drinkUntil,
      purchase_price: price,
      purchase_date: purchaseDate,
      supplier: text(draft.supplier),
      rating,
      notes: text(draft.notes),
      tannin,
      dryness,
      gift: draft.gift === 'true',
      gift_from: draft.gift === 'true' ? text(draft.gift_from) : null,
      pairings: joinPairings(pairings.kept),
    },
  };
}

/**
 * Titre d'affichage d'une fiche : le domaine s'il existe, sinon la cuvée, sinon l'appellation ; le reste en sous-titre.
 */
export function wineTitle(w: Pick<Wine, 'domain' | 'cuvee' | 'vintage'> & { appellation?: string | null }): { primary: string; secondary: string } {
  const cuvee = w.cuvee && w.cuvee !== NO_CUVEE ? w.cuvee : '';
  const vintage = w.vintage ?? 'NV';
  if (w.domain) return { primary: w.domain, secondary: [cuvee, vintage].filter((x) => x !== '').join(' · ') };
  if (cuvee) return { primary: cuvee, secondary: String(vintage) };
  return { primary: w.appellation || 'Sans nom', secondary: String(vintage) };
}

/**
 * Titre des listes : l'appellation d'abord (c'est ce qu'on regarde le plus), avec le millésime ; la région en
 * deuxième ligne ; domaine et cuvée en petit. Sans appellation, on retombe sur le titre habituel.
 */
export function wineHeading(w: Pick<Wine, 'domain' | 'cuvee' | 'vintage' | 'appellation' | 'region' | 'country'>): { primary: string; region: string; maker: string } {
  const cuvee = w.cuvee && w.cuvee !== NO_CUVEE ? w.cuvee : '';
  const maker = [w.domain, cuvee].filter(Boolean).join(' · ');
  if (!w.appellation) {
    // Sans appellation : le domaine (ou la cuvée) fait le titre, la cuvée reste visible en petit.
    const primary = w.domain || cuvee || 'Sans nom';
    return { primary: `${primary} · ${w.vintage ?? 'NV'}`, region: [w.region, w.country].filter(Boolean).join(' · '), maker: w.domain ? cuvee : '' };
  }
  return { primary: `${w.appellation} · ${w.vintage ?? 'NV'}`, region: [w.region, w.country].filter(Boolean).join(' · '), maker };
}

/** Fiche existante → brouillon de formulaire (pour la modification). */
export function draftFromWine(w: Wine): WineDraft {
  const s = (v: string | number | null): string => (v === null ? '' : String(v));
  return {
    domain: w.domain,
    cuvee: w.cuvee === NO_CUVEE ? '' : w.cuvee,
    vintage: w.vintage === null ? 'NV' : String(w.vintage),
    appellation: s(w.appellation),
    region: s(w.region),
    country: s(w.country),
    color: s(w.color),
    format: w.format,
    drink_from: s(w.drink_from),
    drink_until: s(w.drink_until),
    purchase_price: w.purchase_price === null ? '' : String(w.purchase_price).replace('.', ','),
    purchase_date: formatDateFr(w.purchase_date),
    supplier: s(w.supplier),
    rating: s(w.rating),
    notes: s(w.notes),
    tannin: s(w.tannin),
    dryness: s(w.dryness),
    gift: w.gift ? 'true' : '',
    gift_from: s(w.gift_from),
    pairings: parsePairings(w.pairings ?? null).join(', '),
  };
}
