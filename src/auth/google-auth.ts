// Connexion Google (Google Identity Services, « token model »).
// Le jeton d'accès dure ~1 h et n'a pas de refresh token : voir research.md §3.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORAGE_KEY = 'cavavin.auth';
const SKEW_MS = 60_000;

interface Stored {
  token: string;
  expiresAt: number;
  email?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'popup_blocked' | 'denied' | 'unavailable' | 'expired',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type Listener = () => void;

let stored: Stored | null = load();
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: AuthError) => void } | null = null;
const listeners = new Set<Listener>();

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function save(s: Stored | null): void {
  stored = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible : le jeton reste en mémoire */
  }
  listeners.forEach((l) => l());
}

export function isTokenValid(s: Stored | null, now = Date.now()): boolean {
  return !!s && s.expiresAt - SKEW_MS > now;
}

export function onAuthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Jeton valide en mémoire/stockage, sinon null (aucune interaction). */
export function currentToken(): string | null {
  return isTokenValid(stored) ? stored!.token : null;
}

export function isSignedIn(): boolean {
  return currentToken() !== null;
}

/** Compte déjà utilisé sur cet appareil (pour tenter un renouvellement silencieux). */
export function knownEmail(): string | undefined {
  return stored?.email;
}

function loadScript(): Promise<void> {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const el = existing ?? document.createElement('script');
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => reject(new AuthError('Google indisponible (hors-ligne ?)', 'unavailable')));
    if (!existing) {
      el.src = GIS_SRC;
      el.async = true;
      document.head.appendChild(el);
    }
  });
}

async function ensureClient(): Promise<google.accounts.oauth2.TokenClient> {
  if (tokenClient) return tokenClient;
  await loadScript();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new AuthError('VITE_GOOGLE_CLIENT_ID manquant (.env.local)', 'unavailable');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (resp.error || !resp.access_token) {
        p?.reject(new AuthError(resp.error_description ?? resp.error ?? 'Connexion refusée', 'denied'));
        return;
      }
      save({
        token: resp.access_token,
        expiresAt: Date.now() + Number(resp.expires_in ?? 3600) * 1000,
        email: stored?.email,
      });
      p?.resolve(resp.access_token);
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      p?.reject(
        new AuthError(
          err.type === 'popup_failed_to_open' ? 'Fenêtre de connexion bloquée' : 'Connexion annulée',
          err.type === 'popup_failed_to_open' ? 'popup_blocked' : 'denied',
        ),
      );
    },
  });
  return tokenClient;
}

async function fetchEmail(token: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

/**
 * Demande un jeton. `interactive = true` doit être appelé depuis un geste utilisateur (tap).
 * `interactive = false` tente un renouvellement silencieux (peut échouer sans fenêtre).
 */
export async function requestToken(interactive: boolean): Promise<string> {
  const client = await ensureClient();
  const token = await new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken({
      prompt: interactive ? (stored?.email ? '' : 'select_account') : '',
      hint: stored?.email,
    });
  });
  if (!stored?.email) {
    const email = await fetchEmail(token);
    if (email && stored) save({ ...stored, email });
  }
  return token;
}

/** Jeton pour l'API : valide ou erreur « expired » (l'UI affiche « Reconnecter »). */
export async function getAccessToken(): Promise<string> {
  const t = currentToken();
  if (t) return t;
  throw new AuthError('Session Google expirée', 'expired');
}

export function signOut(): void {
  const t = stored?.token;
  save(null);
  if (t && typeof google !== 'undefined' && google.accounts?.oauth2) {
    google.accounts.oauth2.revoke(t, () => undefined);
  }
}

/**
 * À l'ouverture : si un compte est connu mais que le jeton a expiré, tente un renouvellement sans
 * interaction. Échoue en silence (fenêtre bloquée, hors-ligne…) : le bandeau « Reconnecter » prend le relais.
 */
export async function tryRenewSilently(): Promise<boolean> {
  if (currentToken() || !stored?.email) return currentToken() !== null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await requestToken(false);
    return true;
  } catch {
    return false;
  }
}
