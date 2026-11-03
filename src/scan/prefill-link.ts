// Lien « pré-remplir le formulaire » : Claude (ou n'importe qui) donne une adresse de l'application qui ouvre le
// formulaire d'ajout déjà rempli. Le fragment (#…) n'est jamais envoyé au serveur : les données restent privées.
//
//   <appli>/#/ajouter/saisie?domain=Domaine%20X&vintage=2019&appellation=Saint-Joseph&color=rouge&…   (forme courante)
//   <appli>/#/ajouter/saisie?fiche=<JSON en base64url ou JSON brut>                                    (forme compacte)
//
// Les valeurs ne sont JAMAIS enregistrées telles quelles : elles passent par `parseProposals` (bornes, énumérations,
// mets végétariens) puis par le formulaire, que l'utilisateur doit valider.

/** Champs acceptés dans le lien (ceux du JSON de lecture d'étiquette). */
export const PREFILL_KEYS = [
  'domain', 'cuvee', 'vintage', 'appellation', 'region', 'country', 'color', 'format', 'quantity', 'tannin', 'dryness',
  'drink_from', 'drink_until', 'pairings', 'purchase_price', 'purchase_date', 'supplier', 'notes',
] as const;

/** Taille maximale d'une valeur ou de la forme compacte (au-delà, le lien est refusé). */
export const MAX_PREFILL_CHARS = 8000;
const MAX_VALUE_CHARS = 600;

export class PrefillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrefillError';
  }
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * Données portées par l'adresse, ou `null` s'il n'y en a pas.
 * Lève `PrefillError` si le lien existe mais est illisible ou démesuré.
 */
export function readPrefill(params: URLSearchParams): Record<string, unknown> | null {
  const compact = params.get('fiche');
  if (compact !== null) {
    if (compact.length > MAX_PREFILL_CHARS) throw new PrefillError('Le lien est trop long pour être lu.');
    try {
      const text = compact.trim().startsWith('{') || compact.trim().startsWith('[') ? compact : fromBase64Url(compact);
      const json: unknown = JSON.parse(text);
      const first = Array.isArray(json) ? json[0] : json;
      if (first === null || typeof first !== 'object' || Array.isArray(first)) throw new Error('forme inattendue');
      return first as Record<string, unknown>;
    } catch {
      throw new PrefillError('Lien illisible : il a peut-être été tronqué par le chat. Demandez à Claude le bloc JSON à coller.');
    }
  }
  const out: Record<string, unknown> = {};
  for (const k of PREFILL_KEYS) {
    const v = params.get(k);
    if (v === null || v.trim() === '') continue;
    if (v.length > MAX_VALUE_CHARS) throw new PrefillError(`Le champ « ${k} » du lien est trop long.`);
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Adresse complète vers le formulaire pré-rempli (forme courante). `base` : adresse de l'application. */
export function buildPrefillLink(base: string, data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of PREFILL_KEYS) {
    const raw = data[k];
    if (raw === undefined || raw === null || raw === '') continue;
    const v = Array.isArray(raw) ? raw.join('; ') : String(raw);
    parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return `${base.replace(/#.*$/, '')}#/ajouter/saisie?${parts.join('&')}`;
}

/** Vrai quand l'application tourne comme appli installée (écran d'accueil), pas dans un onglet de navigateur. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}
