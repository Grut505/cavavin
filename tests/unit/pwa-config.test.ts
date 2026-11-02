import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialHash } from '../../src/app';
import { pwaOptions } from '../../src/sw-config';

describe('démarrage hors-ligne : configuration du Service Worker', () => {
  const workbox = pwaOptions.workbox as { globPatterns: string[]; navigateFallback: string; runtimeCaching?: unknown };

  it('pré-cache le code, les styles, la page, les icônes et le manifeste', () => {
    const patterns = workbox.globPatterns.join(' ');
    for (const ext of ['js', 'css', 'html', 'svg', 'png', 'webmanifest']) expect(patterns).toContain(ext);
  });

  it('toute navigation hors-ligne retombe sur la page de l’application', () => {
    expect(workbox.navigateFallback).toBe('index.html');
  });

  it('ne met jamais en cache les appels à Google : les données vivent dans la base locale', () => {
    expect(workbox.runtimeCaching).toBeUndefined();
    const text = JSON.stringify(pwaOptions);
    expect(text).not.toMatch(/googleapis|google\.com|sheets/i);
  });

  it('se met à jour toute seule', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
  });

  it('est installable sur l’écran d’accueil : manifeste, mode application, icônes existantes', () => {
    const m = pwaOptions.manifest as { display: string; start_url: string; scope: string; icons: { src: string; purpose?: string }[]; lang: string };
    expect(m.display).toBe('standalone');
    expect(m.lang).toBe('fr');
    expect(m.start_url).toBe('.');
    expect(m.scope).toBe('.');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons) expect(existsSync(`public/${icon.src}`), icon.src).toBe(true);
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true);
  });

  it('la page d’entrée déclare les balises d’installation sur iPhone', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-touch-icon');
  });
});

describe('écran d’ouverture', () => {
  it('ouvre la cave directement quand la feuille est déjà prête sur l’appareil (sans réseau ni connexion)', () => {
    expect(initialHash(true)).toBe('#/cave');
  });
  it('passe par la connexion au tout premier lancement', () => {
    expect(initialHash(false)).toBe('#/connexion');
  });
});
