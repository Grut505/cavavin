// Origine de navigation : une fiche ouverte depuis la cave, l'accueil, une personne… doit ramener là d'où l'on vient
// (et garder le bon onglet allumé), pas toujours à la Liste. L'origine voyage dans le hash : `#/vin/123?from=%2Fetagere%2F9`.
import { hashQuery } from './query';

export const currentPath = (): string => window.location.hash.replace(/^#/, '').split('?')[0] ?? '';

/** Lien vers une fiche qui mémorise l'écran courant comme origine (ou `from` s'il est donné). */
export function wineHref(id: string, from: string = currentPath()): string {
  return `#/vin/${id}${from ? `?from=${encodeURIComponent(from)}` : ''}`;
}

/** Origine mémorisée dans l'adresse, si elle est plausible (chemin interne, jamais une fiche). */
export function originPath(): string | null {
  const from = hashQuery().get('from');
  if (!from || !/^\/[a-z0-9/_-]*$/i.test(from) || from.startsWith('/vin/')) return null;
  return from;
}

/** Suffixe `?from=…` à recopier sur les liens qui restent dans la fiche (Modifier…). */
export function originQuery(): string {
  const from = originPath();
  return from ? `?from=${encodeURIComponent(from)}` : '';
}

const LABELS: [RegExp, string][] = [
  [/^\/accueil/, 'Retour à l’accueil'],
  [/^\/etagere\//, 'Retour à l’étagère'],
  [/^\/cave/, 'Retour à la cave'],
  [/^\/personne\//, 'Retour à la personne'],
  [/^\/historique/, 'Retour à l’historique'],
  [/^\/liste/, 'Retour à la liste'],
];

/** Destination et libellé du bouton « retour » d'une fiche. */
export function wineBack(): { href: string; label: string } {
  const from = originPath();
  if (!from) return { href: '#/liste', label: 'Retour à la liste' };
  return { href: `#${from}`, label: LABELS.find(([re]) => re.test(from))?.[1] ?? 'Retour' };
}
