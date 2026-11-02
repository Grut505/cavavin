import { LocalDb } from '../../src/data/local-db';
import { SyncEngine } from '../../src/data/sync-engine';
import { Repository } from '../../src/data/repository';
import { initSheet } from '../../src/data/init-sheet';
import { FakeSheets } from './fake-sheets';
import { SyncScheduler } from '../../src/data/sync-scheduler';
import type { AppContext } from '../../src/app';
import type { Wine } from '../../src/domain/types';
import type { WineFields } from '../../src/domain/wine';

let dbCounter = 0;

export interface Device {
  db: LocalDb;
  engine: SyncEngine;
  repo: Repository;
  deviceId: string;
}

export async function makeDevice(
  sheets: FakeSheets,
  deviceId: string,
  clock: { t: number } = { t: Date.parse('2026-11-02T10:00:00.000Z') },
): Promise<Device> {
  const db = await LocalDb.open(`test-${++dbCounter}`);
  const now = () => new Date(clock.t++);
  const engine = new SyncEngine({ db, api: sheets, deviceId, now });
  const repo = new Repository(db, engine, deviceId, now);
  return { db, engine, repo, deviceId };
}

/** Contexte d'application complet pour les tests d'écrans (ordonnanceur créé mais non démarré). */
export function contextOf(d: Device, opts: { online?: () => boolean; hasToken?: () => boolean } = {}): AppContext {
  const scheduler = new SyncScheduler({
    repo: d.repo,
    hasToken: opts.hasToken ?? (() => true),
    isOnline: opts.online ?? (() => true),
  });
  return { repo: d.repo, db: d.db, scheduler, engine: d.engine, deviceId: d.deviceId } as unknown as AppContext;
}

export async function makeSheet(): Promise<FakeSheets> {
  const sheets = new FakeSheets();
  await initSheet(sheets);
  return sheets;
}

export function wineData(over: Partial<Wine> = {}): Omit<Wine, 'id' | 'rev' | 'updated_at' | 'deleted'> {
  return {
    domain: 'Domaine X',
    cuvee: 'Les Y',
    vintage: 2019,
    appellation: null,
    region: null,
    country: null,
    color: 'rouge',
    format: '75cl',
    drink_from: null,
    drink_until: null,
    purchase_price: null,
    purchase_date: null,
    supplier: null,
    rating: null,
    notes: null,
    thumb_ref: null,
    legacy_ref: null,
    needs_review: false,
    created_at: '2026-11-02T10:00:00.000Z',
    tannin: null,
    dryness: null,
    gift: false,
    gift_from: null,
    ...over,
  };
}

/** Champs de fiche saisissables (sans champs techniques). */
export function wineFields(over: Partial<WineFields> = {}): WineFields {
  const { created_at: _created, thumb_ref: _t, legacy_ref: _l, needs_review: _n, ...fields } = wineData();
  void [_created, _t, _l, _n];
  return { ...fields, ...over };
}
