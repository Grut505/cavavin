/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_SHEET_ID: string;
  /** Comptes autorisés (facultatif) : adresses séparées par des virgules. */
  readonly VITE_ALLOWED_EMAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
