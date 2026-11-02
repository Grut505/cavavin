/** Minuscules, sans accents, espaces compactés — pour la recherche et les clés d'unicité. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Clé d'unicité d'une fiche : domaine + cuvée + millésime (null → « nv »). */
export function wineKey(w: {
  domain: string | null | undefined;
  cuvee: string | null | undefined;
  vintage: number | null | undefined;
}): string {
  const vintage = w.vintage == null ? 'nv' : String(w.vintage);
  return [normalizeText(w.domain), normalizeText(w.cuvee), vintage].join('|');
}
