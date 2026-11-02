// Propositions de fiche issues du projet Claude — voir contracts/label-proposal.md.
import { normalizeText } from '../domain/normalize';
import { joinPairings, parsePairings, splitVegetarian } from '../domain/pairing-list';
import { BOTTLE_FORMATS, WINE_COLORS } from '../domain/types';
import { MIN_YEAR, formatDateFr, parseDate, type WineDraft, emptyDraft } from '../domain/wine';

export interface ProposalData {
  target_wine_id: string | null;
  domain: string | null;
  cuvee: string | null;
  vintage: number | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  color: string | null;
  format: string | null;
  quantity: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  supplier: string | null;
  drink_from: number | null;
  drink_until: number | null;
  notes: string | null;
  tannin: number | null;
  dryness: string | null;
  /** Mets conseillés, séparés par des points-virgules. */
  pairings: string | null;
  /** Objet source tel que reçu (pour audit). */
  raw_json: string;
}

export interface ParseResult {
  proposals: ProposalData[];
  warnings: string[];
}

export class ProposalParseError extends Error {
  constructor(
    message: string,
    /** `no_json` : la réponse est du texte libre ; `unusable` : JSON sans proposition exploitable. */
    readonly code: 'no_json' | 'unusable' = 'unusable',
  ) {
    super(message);
    this.name = 'ProposalParseError';
  }
}

// --- extraction du JSON dans un texte quelconque ---

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Premier objet/tableau JSON équilibré du texte (tient compte des chaînes et des échappements). */
function scanBalanced(text: string): unknown | undefined {
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i]!;
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) {
          const parsed = tryParse(text.slice(start, i + 1));
          if (parsed !== undefined) return parsed;
          break;
        }
      }
    }
  }
  return undefined;
}

export function extractJson(text: string): unknown | undefined {
  const whole = tryParse(text.trim());
  if (whole !== undefined) return whole;
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = tryParse(m[1]!.trim()) ?? scanBalanced(m[1]!);
    if (parsed !== undefined) return parsed;
  }
  return scanBalanced(text);
}

// --- normalisation des valeurs ---

const COLOR_ALIASES: Record<string, string> = {
  rouge: 'rouge',
  red: 'rouge',
  blanc: 'blanc',
  white: 'blanc',
  rose: 'rosé',
  pink: 'rosé',
  effervescent: 'effervescent',
  sparkling: 'effervescent',
  champagne: 'effervescent',
  cremant: 'effervescent',
  petillant: 'effervescent',
  liquoreux: 'liquoreux',
  sweet: 'liquoreux',
  moelleux: 'liquoreux',
  autre: 'autre',
  other: 'autre',
};

function normColor(v: unknown): string | null | undefined {
  if (typeof v !== 'string') return undefined;
  const mapped = COLOR_ALIASES[normalizeText(v)];
  return mapped && (WINE_COLORS as readonly string[]).includes(mapped) ? mapped : undefined;
}

const DRYNESS_ALIASES: Record<string, string> = {
  sec: 'sec',
  dry: 'sec',
  brut: 'sec',
  'extra brut': 'sec',
  'brut nature': 'sec',
  'demi sec': 'demi-sec',
  'semi dry': 'demi-sec',
  moelleux: 'moelleux',
  'medium sweet': 'moelleux',
  doux: 'doux',
  sweet: 'doux',
  liquoreux: 'doux',
};

function normDryness(v: unknown): string | undefined {
  return typeof v === 'string' ? DRYNESS_ALIASES[normalizeText(v)] : undefined;
}

function normFormat(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const k = normalizeText(v).replace(/\s+/g, '');
  if ((BOTTLE_FORMATS as readonly string[]).includes(v.trim())) return v.trim();
  if (['demi', '375cl', '375', '37 5cl'].includes(k) || /^(37|0)\s?5\s?cl$/.test(k) || k === '375ml') return 'demi';
  if (/^(75cl|75|0 75l?|075l|750ml|75 cl)$/.test(k) || k === '0 75 l' || k === '0 75l') return '75cl';
  if (/^(magnum|1 5l?|15l|150cl)$/.test(k)) return 'magnum';
  if (/^(jeroboam|3l|300cl)$/.test(k)) return 'jéroboam';
  return undefined;
}

type Field = keyof Omit<ProposalData, 'raw_json'>;

function parseOne(raw: Record<string, unknown>, label: string, warnings: string[]): ProposalData | null {
  const warn = (field: string): void =>
    void warnings.push(`${label}champ « ${field} » ignoré (valeur invalide).`);

  const str = (f: Field): string | null => {
    const v = raw[f];
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v.trim() === '' ? null : v.trim().replace(/\s+/g, ' ');
    if (typeof v === 'number') return String(v);
    warn(f);
    return null;
  };
  const int = (f: Field, min: number, max: number): number | null => {
    const v = raw[f];
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'string' && v.trim().toUpperCase() === 'NV' && f === 'vintage') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n < min || n > max) {
      warn(f);
      return null;
    }
    return n;
  };

  const maxYear = new Date().getUTCFullYear() + 1;
  let price: number | null = null;
  if (raw.purchase_price !== undefined && raw.purchase_price !== null && raw.purchase_price !== '') {
    const n = typeof raw.purchase_price === 'number' ? raw.purchase_price : Number(String(raw.purchase_price).replace(',', '.'));
    if (Number.isNaN(n) || n < 0) warn('purchase_price');
    else price = n;
  }
  let date: string | null = null;
  if (typeof raw.purchase_date === 'string' && raw.purchase_date.trim() !== '') {
    date = parseDate(raw.purchase_date);
    if (!date) warn('purchase_date');
  }
  let color: string | null = null;
  if (raw.color !== undefined && raw.color !== null && raw.color !== '') {
    color = normColor(raw.color) ?? null;
    if (!color) warn('color');
  }
  let format: string | null = null;
  if (raw.format !== undefined && raw.format !== null && raw.format !== '') {
    format = normFormat(raw.format) ?? null;
    if (!format) warn('format');
  }

  /** Liste de chaînes (attendu) ou texte « a; b » (colonne de la feuille). */
  const pairings = (): string | null => {
    const v = raw.pairings;
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) {
      const { kept, dropped } = splitVegetarian(parsePairings(v as string | string[]));
      if (dropped.length > 0) warnings.push(`${label}mets non végétariens retirés : ${dropped.join(', ')}.`);
      return joinPairings(kept);
    }
    warn('pairings');
    return null;
  };

  let dryness: string | null = null;
  if (raw.dryness !== undefined && raw.dryness !== null && raw.dryness !== '') {
    dryness = normDryness(raw.dryness) ?? null;
    if (!dryness) warn('dryness');
  }

  const data: ProposalData = {
    target_wine_id: str('target_wine_id'),
    domain: str('domain'),
    cuvee: str('cuvee'),
    vintage: int('vintage', MIN_YEAR, maxYear),
    appellation: str('appellation'),
    region: str('region'),
    country: str('country'),
    color,
    format,
    quantity: int('quantity', 1, 999),
    purchase_price: price,
    purchase_date: date,
    supplier: str('supplier'),
    drink_from: int('drink_from', MIN_YEAR, 2200),
    drink_until: int('drink_until', MIN_YEAR, 2200),
    notes: str('notes'),
    tannin: int('tannin', 1, 5),
    dryness,
    pairings: pairings(),
    raw_json: JSON.stringify(raw),
  };
  if (!data.domain && !data.cuvee && !data.appellation) {
    warnings.push(`${label}ignorée : ni domaine, ni cuvée, ni appellation.`);
    return null;
  }
  return data;
}

/** Analyse le texte collé (ou lu dans la feuille) et retourne les propositions valides. */
export function parseProposals(text: string): ParseResult {
  const json = extractJson(text);
  if (json === undefined) {
    throw new ProposalParseError('Aucun JSON valide trouvé dans le texte collé.', 'no_json');
  }
  const items = Array.isArray(json) ? json : [json];
  const warnings: string[] = [];
  const proposals: ProposalData[] = [];
  items.forEach((item, k) => {
    const label = items.length > 1 ? `Proposition ${k + 1} : ` : '';
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`${label}ignorée (ce n’est pas un objet).`);
      return;
    }
    const p = parseOne(item as Record<string, unknown>, label, warnings);
    if (p) proposals.push(p);
  });
  if (proposals.length === 0) {
    throw new ProposalParseError(
      warnings.length > 0 ? warnings.join(' ') : 'Aucune proposition exploitable dans le texte collé.',
    );
  }
  return { proposals, warnings };
}

/** Proposition → brouillon de formulaire (texte brut). */
export function proposalToDraft(p: Pick<ProposalData, Exclude<Field, 'quantity' | 'target_wine_id'>>): WineDraft {
  const d = emptyDraft();
  const s = (v: string | number | null): string => (v === null ? '' : String(v));
  return {
    ...d,
    domain: s(p.domain),
    cuvee: s(p.cuvee),
    vintage: s(p.vintage),
    appellation: s(p.appellation),
    region: s(p.region),
    country: s(p.country),
    color: s(p.color),
    format: p.format ?? d.format,
    drink_from: s(p.drink_from),
    drink_until: s(p.drink_until),
    purchase_price: p.purchase_price === null ? '' : String(p.purchase_price).replace('.', ','),
    purchase_date: formatDateFr(p.purchase_date),
    supplier: s(p.supplier),
    notes: s(p.notes),
    tannin: s(p.tannin),
    dryness: s(p.dryness),
    pairings: splitVegetarian(parsePairings(p.pairings)).kept.join(', '),
  };
}
