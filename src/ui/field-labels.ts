import { formatDateFr } from '../domain/wine';
import type { ReconcilableField } from '../scan/reconcile';

export const FIELD_LABELS: Record<ReconcilableField, string> = {
  cuvee: 'Cuvée',
  appellation: 'Appellation',
  region: 'Région',
  country: 'Pays',
  color: 'Couleur',
  format: 'Format',
  drink_from: 'À boire à partir de',
  drink_until: 'À boire avant',
  purchase_price: 'Prix d’achat',
  purchase_date: 'Date d’achat',
  supplier: 'Fournisseur',
  notes: 'Notes',
  tannin: 'Tanin',
  dryness: 'Sucre',
};

export function formatFieldValue(field: ReconcilableField, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(vide)';
  if (field === 'purchase_price') return `${String(v).replace('.', ',')} €`;
  if (field === 'purchase_date') return formatDateFr(String(v));
  if (field === 'tannin') return `${v} / 5`;
  return String(v);
}
