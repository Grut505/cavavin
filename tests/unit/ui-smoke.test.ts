// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isTokenValid } from '../../src/auth/google-auth';
import { signInView } from '../../src/ui/views/sign-in';
import { placeholderView } from '../../src/ui/views/placeholder';
import type { AppContext } from '../../src/app';

describe('auth', () => {
  it('considère un jeton proche de l’expiration comme invalide', () => {
    const now = 1_000_000;
    expect(isTokenValid({ token: 't', expiresAt: now + 10 * 60_000 }, now)).toBe(true);
    expect(isTokenValid({ token: 't', expiresAt: now + 30_000 }, now)).toBe(false);
    expect(isTokenValid(null, now)).toBe(false);
  });
});

describe('vues', () => {
  it('affiche le bouton de connexion Google au premier lancement', () => {
    const el = signInView({} as AppContext);
    expect(el.querySelector('button')?.textContent).toBe('Se connecter avec Google');
    expect(el.querySelector('h1')?.textContent).toBe('Ma cave');
  });

  it('affiche un écran provisoire pour les vues à venir', () => {
    expect(placeholderView('Liste').textContent).toContain('arrive bientôt');
  });
});
