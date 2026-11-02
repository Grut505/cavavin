// Gestion des erreurs d'accès : 401 ⇒ outbox intacte + reprise ; 403 ⇒ état « refusé », outbox intacte.
import { describe, expect, it } from 'vitest';
import { SheetsError } from '../../src/data/sheets-api';
import { makeDevice, makeSheet, wineData } from './helpers';

describe('erreurs d’accès à la feuille', () => {
  it('401 : la synchro échoue, l’outbox reste intacte, puis la reprise envoie tout', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-a');
    await d.repo.create('wine', wineData());
    const before = await d.repo.pendingCount();
    expect(before).toBeGreaterThan(0);

    sheets.failNext = new SheetsError('Invalid Credentials', 'auth', 401);
    await expect(d.repo.sync()).rejects.toMatchObject({ kind: 'auth' });
    expect(await d.repo.pendingCount()).toBe(before);

    await d.repo.sync();
    expect(await d.repo.pendingCount()).toBe(0);
  });

  it('403 : la synchro échoue avec « forbidden » sans perdre les modifications locales', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-b');
    await d.repo.create('wine', wineData());
    const before = await d.repo.pendingCount();

    sheets.failNext = new SheetsError('The caller does not have permission', 'forbidden', 403);
    await expect(d.repo.sync()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(await d.repo.pendingCount()).toBe(before);
  });

  it('clearAll (changement de compte) vide le cache local, outbox comprise', async () => {
    const sheets = await makeSheet();
    const d = await makeDevice(sheets, 'dev-c');
    await d.repo.create('wine', wineData());
    await d.db.clearAll();
    expect(await d.repo.list('wine')).toHaveLength(0);
    expect(await d.repo.pendingCount()).toBe(0);
  });
});
