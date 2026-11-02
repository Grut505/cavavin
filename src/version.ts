// Version de l'application, injectée au build (vite.config.ts) ; valeurs de repli en développement et en test.
declare const __APP_VERSION__: string | undefined;
declare const __APP_COMMIT__: string | undefined;
declare const __APP_BUILD_TIME__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'local';
export const APP_BUILD_TIME = typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : null;

function formatBuild(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** « v0.2.0 · 4ddf001 · 02/11/2026 18:42 » */
export function versionLabel(v = APP_VERSION, commit = APP_COMMIT, build: string | null = APP_BUILD_TIME): string {
  return [`v${v}`, commit, formatBuild(build)].filter(Boolean).join(' · ');
}
