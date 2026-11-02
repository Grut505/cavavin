import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsApi } from '../../src/data/sheets-client';
import { SheetsError } from '../../src/data/sheets-api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function make(fetchFn: typeof fetch) {
  return new GoogleSheetsApi('SHEET', async () => 'tok', {
    fetchFn,
    sleep: async () => undefined,
    maxRetries: 2,
  });
}

const tabsResponse = {
  sheets: [
    { properties: { sheetId: 11, title: 'Vins' } },
    { properties: { sheetId: 22, title: '_Journal' } },
  ],
};

describe('GoogleSheetsApi', () => {
  it('liste les onglets et envoie le jeton', async () => {
    const f = vi.fn(async () => json(tabsResponse));
    const api = make(f as unknown as typeof fetch);
    expect(await api.listTabs()).toEqual(['Vins', '_Journal']);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v4/spreadsheets/SHEET?fields=');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('lit les onglets (noms entre apostrophes) et gère les onglets vides', async () => {
    const f = vi.fn(async () => json({ valueRanges: [{ values: [['id'], ['a']] }, {}] }));
    const api = make(f as unknown as typeof fetch);
    const res = await api.readTabs(['Vins', '_Journal']);
    expect(res).toEqual({ Vins: [['id'], ['a']], _Journal: [] });
    const url = decodeURIComponent((f.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("ranges='Vins'");
    expect(url).toContain("ranges='_Journal'");
    expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE');
  });

  it('envoie updateCells et appendCells dans une seule requête, avec cellules typées', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(tabsResponse)).mockResolvedValueOnce(json({}));
    const api = make(f as unknown as typeof fetch);
    await api.applyBatch({
      updates: [{ tab: 'Vins', row: 3, cells: ['x', 2, true, null] }],
      appends: [{ tab: '_Journal', cells: ['op', ''] }],
    });
    const body = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0].updateCells.start).toEqual({ sheetId: 11, rowIndex: 2, columnIndex: 0 });
    expect(body.requests[0].updateCells.rows[0].values).toEqual([
      { userEnteredValue: { stringValue: 'x' } },
      { userEnteredValue: { numberValue: 2 } },
      { userEnteredValue: { boolValue: true } },
      {},
    ]);
    expect(body.requests[1].appendCells.sheetId).toBe(22);
  });

  it('mappe 401 → auth et 403 → forbidden sans réessayer', async () => {
    const f401 = vi.fn(async () => json({ error: { message: 'x', status: 'UNAUTHENTICATED' } }, 401));
    await expect(make(f401 as unknown as typeof fetch).listTabs()).rejects.toMatchObject({ kind: 'auth' });
    const f403 = vi.fn(async () => json({ error: { message: 'x', status: 'PERMISSION_DENIED' } }, 403));
    await expect(make(f403 as unknown as typeof fetch).listTabs()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(f403).toHaveBeenCalledTimes(1);
  });

  it('distingue API désactivée, autorisation manquante et absence de partage (403)', async () => {
    const disabled = vi.fn(async () =>
      json(
        {
          error: {
            message: 'Google Sheets API has not been used in project 1 before or it is disabled.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        },
        403,
      ),
    );
    await expect(make(disabled as unknown as typeof fetch).listTabs()).rejects.toMatchObject({
      kind: 'api_disabled',
    });
    const scope = vi.fn(async () =>
      json(
        {
          error: {
            message: 'Request had insufficient authentication scopes.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        },
        403,
      ),
    );
    await expect(make(scope as unknown as typeof fetch).listTabs()).rejects.toMatchObject({ kind: 'scope' });
    const noShare = vi.fn(async () =>
      json({ error: { message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } }, 403),
    );
    await expect(make(noShare as unknown as typeof fetch).listTabs()).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('réessaie après 429 puis réussit', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: 'quota', status: 'RESOURCE_EXHAUSTED' } }, 429))
      .mockResolvedValueOnce(json(tabsResponse));
    const api = make(f as unknown as typeof fetch);
    expect(await api.listTabs()).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('abandonne en « quota » après les tentatives, et signale le réseau coupé', async () => {
    const f = vi.fn(async () => json({ error: { message: 'q', status: 'RESOURCE_EXHAUSTED' } }, 429));
    await expect(make(f as unknown as typeof fetch).listTabs()).rejects.toMatchObject({ kind: 'quota' });
    expect(f).toHaveBeenCalledTimes(3);
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await make(down as unknown as typeof fetch).listTabs().catch((e) => e);
    expect(err).toBeInstanceOf(SheetsError);
    expect(err.kind).toBe('network');
  });
});
