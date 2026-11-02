// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableLock, enableLock, isLockEnabled, isLockSupported, unlock, type PasskeyApi } from '../../src/auth/app-lock';
import { installLock } from '../../src/ui/components/lock-screen';
import { lockSettingsCard } from '../../src/ui/components/lock-settings';

const waitFor = <T>(fn: () => T | Promise<T>): Promise<T> => vi.waitFor(fn, { timeout: 4000, interval: 20 });
const click = (el: Element | null | undefined): void => {
  if (!el) throw new Error('élément introuvable');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

/** Faux authentificateur : `ok` décide si Face ID « reconnaît » l'utilisateur. */
function fakeApi(opts: { available?: boolean; ok?: boolean } = {}) {
  const calls = { create: 0, get: 0 };
  const api: PasskeyApi = {
    available: async () => opts.available ?? true,
    create: async () => {
      calls.create++;
      return { rawId: new Uint8Array([1, 2, 3, 250]).buffer } as unknown as Credential;
    },
    get: async () => {
      calls.get++;
      return opts.ok === false ? null : ({} as Credential);
    },
  };
  return { api, calls, set ok(v: boolean) { opts.ok = v; } };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe('adresses autorisées', () => {
  it('lit la liste (virgules, points-virgules, espaces, casse) et accepte tout si elle est vide', async () => {
    const { parseAllowedEmails, isEmailAllowed } = await import('../../src/auth/google-auth');
    expect(parseAllowedEmails(' Moi@Gmail.com, elle@gmail.com;autre@x.fr  ')).toEqual(['moi@gmail.com', 'elle@gmail.com', 'autre@x.fr']);
    expect(parseAllowedEmails(undefined)).toEqual([]);
    const list = ['moi@gmail.com', 'elle@gmail.com'];
    expect(isEmailAllowed('MOI@gmail.com', list)).toBe(true);
    expect(isEmailAllowed('intrus@gmail.com', list)).toBe(false);
    expect(isEmailAllowed(undefined, list)).toBe(false);
    expect(isEmailAllowed(undefined, [])).toBe(true);
  });

  it('ferme à l’ouverture la session d’un compte absent de la liste', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ALLOWED_EMAILS', 'moi@gmail.com');
    localStorage.setItem('cavavin.auth', JSON.stringify({ token: 't', expiresAt: Date.now() + 3_600_000, email: 'intrus@gmail.com' }));
    const m = await import('../../src/auth/google-auth');
    expect(m.currentToken()).toBe('t');
    expect(m.enforceAllowlist()).toBe(false);
    expect(m.currentToken()).toBeNull();
    expect(localStorage.getItem('cavavin.auth')).toBeNull();
  });

  it('garde la session d’un compte autorisé', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ALLOWED_EMAILS', 'moi@gmail.com');
    localStorage.setItem('cavavin.auth', JSON.stringify({ token: 't', expiresAt: Date.now() + 3_600_000, email: 'Moi@gmail.com' }));
    const m = await import('../../src/auth/google-auth');
    expect(m.enforceAllowlist()).toBe(true);
    expect(m.currentToken()).toBe('t');
  });
});

describe('verrou Face ID (WebAuthn)', () => {
  it('active, déverrouille, refuse et se désactive', async () => {
    const f = fakeApi();
    expect(isLockEnabled()).toBe(false);
    expect(await isLockSupported(f.api)).toBe(true);
    await enableLock(f.api);
    expect(isLockEnabled()).toBe(true);
    expect(f.calls.create).toBe(1);
    expect(await unlock(f.api)).toBe(true);
    f.ok = false;
    expect(await unlock(f.api)).toBe(false);
    disableLock();
    expect(isLockEnabled()).toBe(false);
    expect(await unlock(f.api)).toBe(false); // pas de clé : jamais déverrouillé par erreur
  });

  it('refuse d’activer sans authentificateur disponible', async () => {
    await expect(enableLock(fakeApi({ available: false }).api)).rejects.toThrow(/ne sont pas disponibles/);
    expect(isLockEnabled()).toBe(false);
    expect(await isLockSupported(null)).toBe(false);
  });

  it('affiche l’écran de verrouillage à l’ouverture, le garde si Face ID échoue, le retire si réussi', async () => {
    const f = fakeApi({ ok: false });
    await enableLock(f.api);
    const lock = installLock({ api: f.api, onForgot: async () => undefined });
    expect(lock.isLocked()).toBe(true);
    const overlay = document.querySelector('.lock')!;
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    click(overlay.querySelector('button.btn--primary'));
    await waitFor(() => expect(overlay.textContent).toContain('Déverrouillage refusé'));
    expect(lock.isLocked()).toBe(true);

    f.ok = true;
    click(overlay.querySelector('button.btn--primary'));
    await waitFor(() => expect(document.querySelector('.lock')).toBeNull());
    expect(lock.isLocked()).toBe(false);
    lock.dispose();
  });

  it('ne verrouille pas sans verrou activé', () => {
    const lock = installLock({ api: fakeApi().api, onForgot: async () => undefined });
    expect(lock.isLocked()).toBe(false);
    lock.dispose();
  });

  it('reverrouille après un séjour en arrière-plan assez long, pas après un court', async () => {
    const f = fakeApi();
    await enableLock(f.api);
    let t = 0;
    const lock = installLock({ api: f.api, now: () => t, idleMs: 60_000, onForgot: async () => undefined });
    click(document.querySelector('button.btn--primary'));
    await waitFor(() => expect(lock.isLocked()).toBe(false));

    const visibility = (v: 'hidden' | 'visible'): void => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    visibility('hidden');
    t = 30_000;
    visibility('visible');
    expect(lock.isLocked()).toBe(false);
    visibility('hidden');
    t = 30_000 + 61_000;
    visibility('visible');
    expect(lock.isLocked()).toBe(true);
    lock.dispose();
  });

  it('« Déverrouillage impossible ? » appelle la sortie de secours, et un refus laisse le verrou', async () => {
    const f = fakeApi();
    await enableLock(f.api);
    const onForgot = vi.fn(async () => {
      throw new Error('annulé');
    });
    const lock = installLock({ api: f.api, onForgot });
    click([...document.querySelectorAll('.lock button')].find((b) => b.textContent?.includes('impossible')));
    await waitFor(() => expect(onForgot).toHaveBeenCalled());
    expect(lock.isLocked()).toBe(true);
    onForgot.mockResolvedValueOnce(undefined as never);
    click([...document.querySelectorAll('.lock button')].find((b) => b.textContent?.includes('impossible')));
    await waitFor(() => expect(lock.isLocked()).toBe(false));
    lock.dispose();
  });

  it('carte des Réglages : active et désactive, ou explique que ce n’est pas disponible', async () => {
    const f = fakeApi();
    const card = lockSettingsCard(f.api);
    document.body.append(card);
    await waitFor(() => expect(card.textContent).toContain('Activer le verrou Face ID'));
    click(card.querySelector('button'));
    await waitFor(() => expect(card.textContent).toContain('Verrou actif'));
    expect(isLockEnabled()).toBe(true);
    click(card.querySelector('button'));
    await waitFor(() => expect(card.textContent).toContain('Activer le verrou Face ID'));
    expect(isLockEnabled()).toBe(false);

    const none = lockSettingsCard(fakeApi({ available: false }).api);
    document.body.append(none);
    await waitFor(() => expect(none.textContent).toContain('Non disponible ici'));
    expect(none.querySelector('button')).toBeNull();
  });
});
