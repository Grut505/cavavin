// Interface d'accès à la feuille — implémentée par GoogleSheetsApi (réseau) et FakeSheets (tests).
import type { Raw } from './schema';

export type Cell = Raw;

export interface WriteBatch {
  /** Réécriture d'une ligne existante (row : numéro de ligne 1-based de la feuille). */
  updates: { tab: string; row: number; cells: Cell[] }[];
  /** Ajout en fin d'onglet. */
  appends: { tab: string; cells: Cell[] }[];
}

export interface SheetsApi {
  listTabs(): Promise<string[]>;
  addTabs(titles: string[]): Promise<void>;
  /** Toutes les valeurs de chaque onglet, en-têtes inclus (ligne 0). */
  readTabs(titles: string[]): Promise<Record<string, Raw[][]>>;
  setHeader(tab: string, headers: string[]): Promise<void>;
  /** Applique toutes les écritures de façon atomique (une seule requête). */
  applyBatch(batch: WriteBatch): Promise<void>;
}

export type SheetsErrorKind =
  | 'auth'
  | 'forbidden' // le compte n'a pas accès à la feuille
  | 'api_disabled' // API Google Sheets non activée dans le projet Cloud
  | 'scope' // autorisation « Sheets » non accordée à la connexion
  | 'quota'
  | 'server'
  | 'network'
  | 'other';

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly kind: SheetsErrorKind,
    readonly status?: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'SheetsError';
  }
}
