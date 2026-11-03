// Configuration PWA / Service Worker : démarrage hors-ligne de l'application (FR-014, US5).
// Importée par vite.config.ts ; testée dans tests/unit/pwa-config.test.ts.
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  // La nouvelle version est téléchargée en arrière-plan puis attend : l'application (src/app-update.ts)
  // l'active automatiquement juste après l'ouverture, ou propose « Mettre à jour » dans un bandeau.
  registerType: 'prompt',
  // L'enregistrement du Service Worker est fait par l'application elle-même (suivi des mises à jour).
  injectRegister: false,
  includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
  manifest: {
    name: 'Cavavin',
    short_name: 'Cavavin',
    description: 'Ma cave à vin, partout, même hors-ligne.',
    lang: 'fr',
    start_url: '.',
    scope: '.',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f2ee',
    theme_color: '#6b1f2b',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Tout le code et les ressources de l'application sont pré-cachés : elle démarre sans réseau.
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    // Toute navigation hors-ligne (y compris un lien profond) retombe sur la page de l'application.
    navigateFallback: 'index.html',
    // Aucun cache d'exécution (`runtimeCaching`) : les appels à Google (Sheets, connexion) ne sont
    // jamais servis depuis le cache, les données vivent dans la base locale de l'application.
    navigateFallbackDenylist: [/^\/api\//, /\/teaser\//], // la page teaser est une page à part, pas l'application
    cleanupOutdatedCaches: true,
  },
  devOptions: { enabled: false },
};
