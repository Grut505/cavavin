/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Constantes injectées au build (vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_SHEET_ID: string;
  /** Comptes autorisés (facultatif) : adresses séparées par des virgules. */
  readonly VITE_ALLOWED_EMAILS?: string;
  /** Adresse du projet Claude (facultatif ; sinon réglée dans Réglages, par appareil). */
  readonly VITE_CLAUDE_PROJECT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
