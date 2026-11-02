// Verrou de l'application par Face ID / Touch ID / code de l'appareil (WebAuthn, authentificateur de la plateforme).
// C'est un verrou de confort local : il écarte une personne qui prend le téléphone déverrouillé, il ne chiffre pas
// les données (la sécurité des données reste le partage de la feuille Google et le verrouillage du téléphone).
const KEY = 'cavavin.lock';

/** Délai en arrière-plan au-delà duquel l'application se reverrouille. */
export const LOCK_IDLE_MS = 60_000;

export interface PasskeyApi {
  /** Un authentificateur biométrique / à code est-il disponible ? */
  available(): Promise<boolean>;
  create(options: PublicKeyCredentialCreationOptions): Promise<Credential | null>;
  get(options: PublicKeyCredentialRequestOptions): Promise<Credential | null>;
}

/** API du navigateur, ou `null` si WebAuthn n'existe pas (anciens navigateurs, contexte non sécurisé). */
export function browserPasskeyApi(): PasskeyApi | null {
  if (typeof navigator === 'undefined' || !navigator.credentials || typeof PublicKeyCredential === 'undefined') return null;
  return {
    available: async () => {
      try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        return false;
      }
    },
    create: (publicKey) => navigator.credentials.create({ publicKey }),
    get: (publicKey) => navigator.credentials.get({ publicKey }),
  };
}

const b64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
};
const random = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

function stored(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    const id = raw ? (JSON.parse(raw) as { credentialId?: unknown }).credentialId : null;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

export const isLockEnabled = (): boolean => stored() !== null;

export async function isLockSupported(api: PasskeyApi | null = browserPasskeyApi()): Promise<boolean> {
  return api !== null && (await api.available());
}

/** Crée la clé de l'appareil (Face ID demandé) et active le verrou. Lève une erreur si refusé. */
export async function enableLock(api: PasskeyApi | null = browserPasskeyApi()): Promise<void> {
  if (!api || !(await api.available())) throw new Error('Face ID, Touch ID ou le code de l’appareil ne sont pas disponibles ici.');
  const cred = (await api.create({
    challenge: random(32),
    rp: { name: 'Cavavin' },
    user: { id: random(16), name: 'cavavin', displayName: 'Cavavin' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    timeout: 60_000,
    attestation: 'none',
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Activation annulée.');
  localStorage.setItem(KEY, JSON.stringify({ credentialId: b64(cred.rawId) }));
}

export function disableLock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Demande Face ID (ou le code) ; `true` si l'utilisateur est reconnu. Doit être appelé depuis un tap. */
export async function unlock(api: PasskeyApi | null = browserPasskeyApi()): Promise<boolean> {
  const id = stored();
  if (!id || !api) return false;
  try {
    const cred = await api.get({
      challenge: random(32),
      allowCredentials: [{ type: 'public-key', id: fromB64(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    });
    return cred !== null;
  } catch {
    return false;
  }
}
