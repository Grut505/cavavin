// Schéma des onglets de la feuille — voir contracts/sheet-schema.md
import type { EntityKind } from '../domain/types';

export const SCHEMA_VERSION = 5;

export type FieldType = 'text' | 'int' | 'num' | 'bool';

export interface FieldDef {
  name: string;
  type: FieldType;
  nullable?: boolean;
}

const t = (name: string, nullable = false): FieldDef => ({ name, type: 'text', nullable });
const i = (name: string, nullable = false): FieldDef => ({ name, type: 'int', nullable });
const n = (name: string, nullable = false): FieldDef => ({ name, type: 'num', nullable });
const b = (name: string): FieldDef => ({ name, type: 'bool' });

export const COMMON_FIELDS: FieldDef[] = [t('id'), i('rev'), t('updated_at'), b('deleted')];

export const KIND_TABS: Record<EntityKind, string> = {
  wine: 'Vins',
  furniture: 'Meubles',
  location: 'Emplacements',
  stock: 'Stocks',
  outflow: 'Sorties',
  photo: 'Photos',
  proposal: 'Propositions',
  person: 'Personnes',
};

export const JOURNAL_TAB = '_Journal';
export const META_TAB = '_Meta';

export const JOURNAL_HEADERS = ['op_id', 'device_id', 'ts', 'type', 'entity_id', 'payload', 'result'];
export const META_HEADERS = ['key', 'value'];

export const PHOTO_SEGMENTS = 3;
export const PHOTO_SEGMENT_SIZE = 40000;

const wineFields: FieldDef[] = [
  t('domain'),
  t('cuvee'),
  i('vintage', true),
  t('appellation', true),
  t('region', true),
  t('country', true),
  t('color', true),
  t('format'),
  i('drink_from', true),
  i('drink_until', true),
  n('purchase_price', true),
  t('purchase_date', true),
  t('supplier', true),
  i('rating', true),
  t('notes', true),
  t('thumb_ref', true),
  t('legacy_ref', true),
  b('needs_review'),
  t('created_at'),
  // v2
  t('dryness', true),
  i('tannin', true),
  // v3
  b('gift'),
  t('gift_from', true),
  // v4
  t('pairings', true),
  // v5
  b('to_buy'),
];

const photoFields: FieldDef[] = [
  t('wine_id'),
  t('mime'),
  i('width'),
  i('height'),
  ...Array.from({ length: PHOTO_SEGMENTS }, (_, k) => t(`seg_${k}`, true)),
];

/** Champs propres à chaque type d'entité (hors champs communs). */
export const KIND_FIELDS: Record<EntityKind, FieldDef[]> = {
  wine: wineFields,
  furniture: [t('name'), i('order')],
  location: [t('kind'), t('furniture_id', true), t('name'), i('order')],
  stock: [t('wine_id'), t('location_id'), i('quantity'), t('position_hint', true)],
  outflow: [t('wine_id'), t('location_id'), t('reason'), t('date'), t('note', true)],
  photo: photoFields,
  proposal: [
    t('created_at'),
    t('status'),
    t('source'),
    t('target_wine_id', true),
    t('domain', true),
    t('cuvee', true),
    i('vintage', true),
    t('appellation', true),
    t('region', true),
    t('country', true),
    t('color', true),
    t('format', true),
    i('quantity', true),
    n('purchase_price', true),
    t('purchase_date', true),
    t('supplier', true),
    i('drink_from', true),
    i('drink_until', true),
    t('notes', true),
    t('raw_json', true),
    // v2
    i('tannin', true),
    t('dryness', true),
    // v4
    t('pairings', true),
  ],
  person: [t('name'), i('order')],
};

export function kindFields(kind: EntityKind): FieldDef[] {
  return [...COMMON_FIELDS, ...KIND_FIELDS[kind]];
}

/** En-têtes attendus pour un onglet de données. */
export function kindHeaders(kind: EntityKind): string[] {
  return kindFields(kind).map((f) => f.name);
}

/** Tous les onglets gérés par l'application, avec leurs en-têtes. */
export function allTabs(): { title: string; headers: string[] }[] {
  const data = (Object.keys(KIND_TABS) as EntityKind[]).map((k) => ({
    title: KIND_TABS[k],
    headers: kindHeaders(k),
  }));
  return [
    ...data,
    { title: JOURNAL_TAB, headers: JOURNAL_HEADERS },
    { title: META_TAB, headers: META_HEADERS },
  ];
}

export type Raw = string | number | boolean | null;

function decodeField(def: FieldDef, raw: Raw | undefined): unknown {
  const empty = raw === undefined || raw === null || raw === '';
  switch (def.type) {
    case 'text':
      if (empty) return def.nullable ? null : '';
      return String(raw);
    case 'int':
    case 'num': {
      if (empty) return def.nullable ? null : 0;
      const v = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (Number.isNaN(v)) return def.nullable ? null : 0;
      return def.type === 'int' ? Math.trunc(v) : v;
    }
    case 'bool':
      if (typeof raw === 'boolean') return raw;
      return ['true', 'vrai', '1', 'oui'].includes(String(raw ?? '').toLowerCase());
  }
}

function encodeField(def: FieldDef, value: unknown): Raw {
  if (value === undefined || value === null) return null;
  switch (def.type) {
    case 'text':
      return String(value);
    case 'int':
    case 'num':
      return typeof value === 'number' ? value : Number(value);
    case 'bool':
      return Boolean(value);
  }
}

/** Ligne de la feuille → entité (lecture par nom d'en-tête ; colonnes inconnues ignorées). */
export function rowToEntity(kind: EntityKind, header: string[], row: Raw[]): Record<string, unknown> {
  const idx = new Map(header.map((h, k) => [h, k] as const));
  const out: Record<string, unknown> = {};
  for (const def of kindFields(kind)) {
    const k = idx.get(def.name);
    out[def.name] = decodeField(def, k === undefined ? undefined : row[k]);
  }
  if (kind === 'photo') {
    let data = '';
    for (let s = 0; s < PHOTO_SEGMENTS; s++) {
      data += (out[`seg_${s}`] as string | null) ?? '';
      delete out[`seg_${s}`];
    }
    out.data = data;
  }
  return out;
}

/**
 * Entité → ligne complète de la feuille. Les colonnes inconnues de l'application gardent la
 * valeur existante (`existing`) pour ne jamais écraser d'ajout manuel de l'utilisateur.
 */
export function entityToRow(
  kind: EntityKind,
  header: string[],
  entity: Record<string, unknown>,
  existing?: Raw[],
): Raw[] {
  const values: Record<string, unknown> = { ...entity };
  if (kind === 'photo') {
    const data = String(entity.data ?? '');
    if (data.length > PHOTO_SEGMENTS * PHOTO_SEGMENT_SIZE) {
      throw new Error('Miniature trop volumineuse pour la feuille');
    }
    for (let s = 0; s < PHOTO_SEGMENTS; s++) {
      const part = data.slice(s * PHOTO_SEGMENT_SIZE, (s + 1) * PHOTO_SEGMENT_SIZE);
      values[`seg_${s}`] = part === '' ? null : part;
    }
  }
  const defs = new Map(kindFields(kind).map((d) => [d.name, d] as const));
  return header.map((h, k) => {
    const def = defs.get(h);
    if (!def) return existing?.[k] ?? null;
    return encodeField(def, values[h]);
  });
}
