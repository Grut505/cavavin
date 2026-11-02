// Client de l'API Google Sheets v4 (appels directs depuis le navigateur, jeton d'accès Google).
import type { Raw } from './schema';
import { SheetsError, type Cell, type SheetsApi, type WriteBatch } from './sheets-api';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface ClientOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

function cellData(cell: Cell): Record<string, unknown> {
  if (cell === null || cell === '') return {};
  if (typeof cell === 'number') return { userEnteredValue: { numberValue: cell } };
  if (typeof cell === 'boolean') return { userEnteredValue: { boolValue: cell } };
  return { userEnteredValue: { stringValue: cell } };
}

function quote(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export class GoogleSheetsApi implements SheetsApi {
  private sheetIds = new Map<string, number>();
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(
    private readonly spreadsheetId: string,
    private readonly getToken: () => Promise<string>,
    opts: ClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let attempt = 0;
    for (;;) {
      const token = await this.getToken();
      let res: Response;
      try {
        res = await this.fetchFn(`${BASE}/${this.spreadsheetId}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
          },
        });
      } catch (e) {
        throw new SheetsError(`Réseau indisponible : ${String(e)}`, 'network');
      }
      if (res.ok) return (await res.json()) as T;

      const body = (await res.json().catch(() => ({}))) as {
        error?: {
          message?: string;
          status?: string;
          details?: { reason?: string }[];
          errors?: { reason?: string }[];
        };
      };
      const reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.errors?.[0]?.reason;
      const msg = body.error?.message ?? res.statusText;
      const apiStatus = body.error?.status;
      if (res.status === 401) throw new SheetsError(msg, 'auth', 401);
      if (res.status === 403 && apiStatus !== 'RESOURCE_EXHAUSTED') {
        const kind =
          reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(msg)
            ? 'api_disabled'
            : reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || /insufficient authentication scopes/i.test(msg)
              ? 'scope'
              : 'forbidden';
        throw new SheetsError(msg, kind, 403, reason);
      }
      const retryable = res.status === 429 || res.status === 403 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(500 * 2 ** attempt);
        attempt++;
        continue;
      }
      if (res.status === 429 || res.status === 403) throw new SheetsError(msg, 'quota', res.status);
      if (res.status >= 500) throw new SheetsError(msg, 'server', res.status);
      throw new SheetsError(msg, 'other', res.status);
    }
  }

  private async refreshTabs(): Promise<void> {
    const meta = await this.request<{
      sheets?: { properties: { sheetId: number; title: string } }[];
    }>('?fields=sheets.properties(sheetId,title)');
    this.sheetIds = new Map((meta.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]));
  }

  async listTabs(): Promise<string[]> {
    await this.refreshTabs();
    return [...this.sheetIds.keys()];
  }

  async addTabs(titles: string[]): Promise<void> {
    if (titles.length === 0) return;
    await this.request(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    await this.refreshTabs();
  }

  async readTabs(titles: string[]): Promise<Record<string, Raw[][]>> {
    if (titles.length === 0) return {};
    const params = new URLSearchParams({
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    for (const t of titles) params.append('ranges', quote(t));
    const res = await this.request<{ valueRanges?: { values?: Raw[][] }[] }>(
      `/values:batchGet?${params.toString()}`,
    );
    const out: Record<string, Raw[][]> = {};
    titles.forEach((t, k) => {
      out[t] = res.valueRanges?.[k]?.values ?? [];
    });
    return out;
  }

  async setHeader(tab: string, headers: string[]): Promise<void> {
    const range = `${quote(tab)}!1:1`;
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [headers] }),
    });
  }

  private sheetId(tab: string): number {
    const id = this.sheetIds.get(tab);
    if (id === undefined) throw new SheetsError(`Onglet introuvable : ${tab}`, 'other');
    return id;
  }

  async applyBatch(batch: WriteBatch): Promise<void> {
    if (batch.updates.length === 0 && batch.appends.length === 0) return;
    if (this.sheetIds.size === 0) await this.refreshTabs();
    const requests: unknown[] = [];
    for (const u of batch.updates) {
      requests.push({
        updateCells: {
          start: { sheetId: this.sheetId(u.tab), rowIndex: u.row - 1, columnIndex: 0 },
          rows: [{ values: u.cells.map(cellData) }],
          fields: 'userEnteredValue',
        },
      });
    }
    for (const a of batch.appends) {
      requests.push({
        appendCells: {
          sheetId: this.sheetId(a.tab),
          rows: [{ values: a.cells.map(cellData) }],
          fields: 'userEnteredValue',
        },
      });
    }
    await this.request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}
