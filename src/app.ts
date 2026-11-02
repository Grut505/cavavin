// Contexte applicatif : base locale, API Sheets, moteur de sync, dépôt.
import { currentToken, getAccessToken, onAuthChange } from './auth/google-auth';
import { LocalDb } from './data/local-db';
import { GoogleSheetsApi } from './data/sheets-client';
import { SyncEngine } from './data/sync-engine';
import { Repository, getOrCreateDeviceId } from './data/repository';
import type { SheetsApi } from './data/sheets-api';
import { SyncScheduler } from './data/sync-scheduler';

export interface AppContext {
  db: LocalDb;
  api: SheetsApi;
  engine: SyncEngine;
  repo: Repository;
  scheduler: SyncScheduler;
  deviceId: string;
}

export async function createContext(): Promise<AppContext> {
  const db = await LocalDb.open();
  const deviceId = await getOrCreateDeviceId(db);
  const api = new GoogleSheetsApi(import.meta.env.VITE_SHEET_ID, getAccessToken);
  const engine = new SyncEngine({ db, api, deviceId });
  const repo = new Repository(db, engine, deviceId);
  const scheduler = new SyncScheduler({
    repo,
    hasToken: () => currentToken() !== null,
    onAuthChange,
    events: window,
    doc: document,
  });
  return { db, api, engine, repo, scheduler, deviceId };
}

/**
 * Écran d'ouverture. Hors-ligne d'abord : si la feuille a déjà été initialisée et synchronisée sur cet
 * appareil, on ouvre directement la cave à partir des données locales (aucun réseau ni connexion Google
 * n'est nécessaire pour consulter) ; sinon, on passe par la connexion.
 */
export function initialHash(ready: boolean): '#/accueil' | '#/connexion' {
  return ready ? '#/accueil' : '#/connexion';
}

/** Vrai quand la feuille a déjà été initialisée et synchronisée sur cet appareil. */
export async function isSheetReady(ctx: AppContext): Promise<boolean> {
  return (await ctx.db.getMeta<boolean>('sheet_ready')) === true;
}

export async function markSheetReady(ctx: AppContext): Promise<void> {
  await ctx.db.setMeta('sheet_ready', true);
}
