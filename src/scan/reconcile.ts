// Rapprochement d'une proposition avec une fiche existante (FR-001a, FR-004a) :
// on ne propose que les champs vides ou différents, et rien n'est appliqué sans validation.
import { normalizeText } from '../domain/normalize';
import { NO_CUVEE } from '../domain/wine';
import type { Wine } from '../domain/types';
import type { ProposalData } from './proposal';

export type ReconcilableField =
  | 'cuvee'
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
  | 'notes'
  | 'tannin'
  | 'dryness';

const FIELDS: ReconcilableField[] = [
  'cuvee',
  'appellation',
  'region',
  'country',
  'color',
  'format',
  'drink_from',
  'drink_until',
  'purchase_price',
  'purchase_date',
  'supplier',
  'notes',
  'tannin',
  'dryness',
];

export interface FieldChange {
  field: ReconcilableField;
  current: unknown;
  proposed: unknown;
  /** `fill` : le champ est vide dans la fiche ; `differ` : valeur différente déjà présente. */
  kind: 'fill' | 'differ';
}

const isEmpty = (field: ReconcilableField, v: unknown): boolean =>
  v === null || v === undefined || v === '' || (field === 'cuvee' && v === NO_CUVEE);

const sameValue = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' ? normalizeText(a) === normalizeText(b) : a === b;

type Source = Partial<Pick<ProposalData, ReconcilableField>>;

export function reconcile(existing: Wine, proposed: Source): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of FIELDS) {
    const next = proposed[field];
    if (next === null || next === undefined || next === '') continue;
    const current = existing[field];
    if (isEmpty(field, current)) {
      out.push({ field, current, proposed: next, kind: 'fill' });
    } else if (field !== 'cuvee' && !sameValue(current, next)) {
      out.push({ field, current, proposed: next, kind: 'differ' });
    }
  }
  return out;
}

/** Valeurs à écrire dans la fiche : uniquement les champs explicitement acceptés. */
export function applyChanges(changes: FieldChange[], accepted: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of changes) if (accepted.has(c.field)) out[c.field] = c.proposed;
  return out;
}
