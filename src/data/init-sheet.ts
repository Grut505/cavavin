// Initialisation de la feuille : création des onglets applicatifs, en-têtes, version de schéma.
// Garantie : un onglet existant qui n'est pas à nous n'est jamais modifié (voir TabNameConflictError).
import { META_TAB, SCHEMA_VERSION, allTabs, type Raw } from './schema';
import type { SheetsApi } from './sheets-api';

export class SchemaTooNewError extends Error {
  constructor(readonly found: number) {
    super(
      `La feuille utilise le schéma v${found}, plus récent que cette application (v${SCHEMA_VERSION}). Mettez l'application à jour.`,
    );
    this.name = 'SchemaTooNewError';
  }
}

export class TabNameConflictError extends Error {
  constructor(readonly tabs: string[]) {
    super(
      `Des onglets existants portent le nom d'onglets de l'application sans en avoir la structure : ${tabs.join(', ')}. Renommez-les dans la feuille puis réessayez.`,
    );
    this.name = 'TabNameConflictError';
  }
}

export interface InitResult {
  createdTabs: string[];
  addedColumns: string[];
  schemaVersion: number;
}

/** Vrai si tous les onglets applicatifs existent. */
export function isInitialized(tabs: string[]): boolean {
  const have = new Set(tabs);
  return allTabs().every((t) => have.has(t.title));
}

const cellText = (v: Raw | undefined): string => (v === null || v === undefined ? '' : String(v));

export async function initSheet(api: SheetsApi): Promise<InitResult> {
  const expected = allTabs();
  const existing = new Set(await api.listTabs());
  const present = expected.filter((t) => existing.has(t.title));

  // 1. Refuser de toucher un onglet existant qui n'a pas notre structure.
  const before = await api.readTabs(present.map((t) => t.title));
  const conflicts: string[] = [];
  for (const t of present) {
    const rows = before[t.title] ?? [];
    const header = (rows[0] ?? []).map(cellText);
    const key = t.headers[0]!; // id / op_id / key
    if (rows.length > 0 && !header.includes(key)) conflicts.push(t.title);
  }
  if (conflicts.length > 0) throw new TabNameConflictError(conflicts);

  // 2. Créer les onglets manquants et compléter les en-têtes (colonnes ajoutées à droite).
  const missing = expected.filter((t) => !existing.has(t.title));
  await api.addTabs(missing.map((t) => t.title));

  const addedColumns: string[] = [];
  for (const t of expected) {
    const rows = before[t.title] ?? [];
    const header = (rows[0] ?? []).map(cellText);
    if (header.length === 0) {
      await api.setHeader(t.title, t.headers);
      continue;
    }
    const lacking = t.headers.filter((h) => !header.includes(h));
    if (lacking.length > 0) {
      await api.setHeader(t.title, [...header, ...lacking]);
      addedColumns.push(...lacking.map((h) => `${t.title}.${h}`));
    }
  }

  // 3. Version de schéma.
  const meta = (await api.readTabs([META_TAB]))[META_TAB] ?? [];
  const header = (meta[0] ?? []).map(cellText);
  const kIdx = header.indexOf('key');
  const vIdx = header.indexOf('value');
  const rowIdx = meta.findIndex((r, i) => i > 0 && cellText(r[kIdx]) === 'schema_version');
  if (rowIdx >= 0) {
    const found = Number(meta[rowIdx]![vIdx]);
    if (found > SCHEMA_VERSION) throw new SchemaTooNewError(found);
    if (found < SCHEMA_VERSION) {
      const cells: Raw[] = header.map(() => null);
      cells[kIdx] = 'schema_version';
      cells[vIdx] = SCHEMA_VERSION;
      await api.applyBatch({ updates: [{ tab: META_TAB, row: rowIdx + 1, cells }], appends: [] });
    }
  } else {
    const cells: Raw[] = header.map(() => null);
    cells[kIdx] = 'schema_version';
    cells[vIdx] = SCHEMA_VERSION;
    await api.applyBatch({ updates: [], appends: [{ tab: META_TAB, cells }] });
  }

  return {
    createdTabs: missing.map((t) => t.title),
    addedColumns,
    schemaVersion: SCHEMA_VERSION,
  };
}
