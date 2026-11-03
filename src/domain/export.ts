// Export de la cave en CSV (sauvegarde personnelle, ouvrable dans Excel / Numbers / Sheets).
import type { WineRow } from './query';
import { pairingsOf } from './pairing-list';
import type { Person } from './types';
import { formatDateFr } from './wine';

/** Marque d'ordre des octets UTF-8 : Excel s'en sert pour lire correctement les accents. */
const BOM = String.fromCharCode(0xfeff);

const HEADERS = [
  'Domaine', 'Cuvée', 'Millésime', 'Appellation', 'Région', 'Pays', 'Couleur', 'Format', 'Bouteilles en stock', 'Emplacements',
  'À boire dès', 'À boire jusqu’à', 'Prix d’achat (€)', 'Date d’achat', 'Fournisseur', 'Note (1-5)', 'Mets conseillés', 'Offert par', 'Notes',
];

/**
 * Cellule CSV : guillemets doublés si besoin et protection contre l'interprétation comme formule
 * (une cellule commençant par = + - @ est préfixée d'une apostrophe).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV européen : séparateur « ; », BOM UTF-8 pour qu'Excel lise bien les accents, une ligne par fiche. */
export function cellarCsv(rows: WineRow[], persons: Person[]): string {
  const personName = new Map(persons.map((p) => [p.id, p.name] as const));
  const lines = rows
    .filter((r) => !r.wine.deleted)
    .sort((a, b) => a.wine.domain.localeCompare(b.wine.domain, 'fr', { sensitivity: 'base' }) || a.wine.cuvee.localeCompare(b.wine.cuvee, 'fr', { sensitivity: 'base' }) || (a.wine.vintage ?? 0) - (b.wine.vintage ?? 0))
    .map(({ wine: w, quantity, locations }) =>
      [
        w.domain, w.cuvee, w.vintage ?? 'NV', w.appellation, w.region, w.country, w.color, w.format, quantity, locations.map((l) => l.label).join(' + '),
        w.drink_from, w.drink_until, w.purchase_price === null ? '' : String(w.purchase_price).replace('.', ','), formatDateFr(w.purchase_date), w.supplier, w.rating,
        pairingsOf(w).join(', '), w.gift ? (w.gift_from ? (personName.get(w.gift_from) ?? 'Oui') : 'Oui') : '', w.notes,
      ]
        .map(csvCell)
        .join(';'),
    );
  return `${BOM}${[HEADERS.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`;
}

export const csvFileName = (now: Date = new Date()): string => {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `cavavin-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
};
