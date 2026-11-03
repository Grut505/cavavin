// Fausse API Sheets en mémoire pour les tests de contrat.
import { SheetsError, type SheetsApi, type WriteBatch } from '../../src/data/sheets-api';
import type { Raw } from '../../src/data/schema';

export class FakeSheets implements SheetsApi {
  tabs = new Map<string, Raw[][]>();
  batchCalls = 0;
  /** Erreur à lever lors du prochain appel réseau (puis réinitialisée). */
  failNext: SheetsError | null = null;
  /** Réseau coupé : tous les appels échouent tant que c'est vrai. */
  offline = false;
  /** Cellules lues depuis le début (pour vérifier qu'une synchro n'a pas relu toute la feuille). */
  cellsRead = 0;

  private maybeFail(): void {
    if (this.offline) throw new SheetsError('Réseau indisponible', 'network');
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
  }

  async listTabs(): Promise<string[]> {
    this.maybeFail();
    return [...this.tabs.keys()];
  }

  async addTabs(titles: string[]): Promise<void> {
    this.maybeFail();
    for (const t of titles) if (!this.tabs.has(t)) this.tabs.set(t, []);
  }

  async readTabs(titles: string[]): Promise<Record<string, Raw[][]>> {
    this.maybeFail();
    const out: Record<string, Raw[][]> = {};
    for (const t of titles) {
      const rows = this.tabs.get(t);
      if (!rows) throw new SheetsError(`Onglet introuvable : ${t}`, 'other', 400);
      out[t] = rows.map((r) => [...r]);
      this.cellsRead += rows.reduce((n, r) => n + r.length, 0);
    }
    return out;
  }

  async readRanges(ranges: { tab: string; a1: string }[]): Promise<Raw[][][]> {
    this.maybeFail();
    const col = (l: string): number => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    return ranges.map(({ tab, a1 }) => {
      const rows = this.tabs.get(tab);
      if (!rows) throw new SheetsError(`Onglet introuvable : ${tab}`, 'other', 400);
      const byRow = /^(\d+):(\d+)$/.exec(a1);
      const byCol = /^([A-Z]+):([A-Z]+)$/.exec(a1);
      let out: Raw[][];
      if (byRow) out = rows.slice(Number(byRow[1]) - 1, Number(byRow[2])).map((r) => [...r]);
      else if (byCol) out = rows.map((r) => r.slice(col(byCol[1]!), col(byCol[2]!) + 1));
      else throw new SheetsError(`Plage non gérée : ${a1}`, 'other', 400);
      this.cellsRead += out.reduce((n, r) => n + r.length, 0);
      return out;
    });
  }

  async setHeader(tab: string, headers: string[]): Promise<void> {
    this.maybeFail();
    const rows = this.tabs.get(tab);
    if (!rows) throw new SheetsError(`Onglet introuvable : ${tab}`, 'other', 400);
    rows[0] = [...headers];
  }

  async applyBatch(batch: WriteBatch): Promise<void> {
    this.maybeFail();
    this.batchCalls++;
    // Validation avant écriture : le lot est atomique.
    for (const u of batch.updates) {
      const rows = this.tabs.get(u.tab);
      if (!rows || u.row < 2 || u.row > rows.length) {
        throw new SheetsError(`Ligne invalide ${u.tab}!${u.row}`, 'other', 400);
      }
    }
    for (const a of batch.appends) {
      if (!this.tabs.has(a.tab)) throw new SheetsError(`Onglet introuvable : ${a.tab}`, 'other', 400);
    }
    for (const u of batch.updates) this.tabs.get(u.tab)![u.row - 1] = [...u.cells];
    for (const a of batch.appends) this.tabs.get(a.tab)!.push([...a.cells]);
  }

  // --- aides pour les tests ---

  /** Corps d'un onglet (sans en-tête) sous forme d'objets {en-tête: valeur}. */
  records(tab: string): Record<string, Raw>[] {
    const rows = this.tabs.get(tab) ?? [];
    const header = (rows[0] ?? []) as string[];
    return rows.slice(1).map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] ?? null])));
  }

  /** Ajoute une ligne « à la main » comme le ferait l'utilisateur dans la feuille. */
  addManualRow(tab: string, record: Record<string, Raw>): void {
    const rows = this.tabs.get(tab)!;
    const header = rows[0] as string[];
    rows.push(header.map((h) => record[h] ?? null));
  }
}
