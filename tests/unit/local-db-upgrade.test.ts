import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { LocalDb } from '../../src/data/local-db';

describe('base locale : montée de version', () => {
  it('ajoute la table « person » à une base v1 sans toucher aux données existantes', async () => {
    const name = `upgrade-${Math.random().toString(36).slice(2)}`;
    // Base telle que créée par la v1 de l'application (sans la table « person »).
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        for (const k of ['wine', 'furniture', 'location', 'stock', 'outflow', 'photo', 'proposal']) {
          db.createObjectStore(k, { keyPath: 'id' });
        }
        db.createObjectStore('outbox', { autoIncrement: true });
        db.createObjectStore('meta');
      },
    });
    await v1.put('furniture', { id: 'f1', name: 'Meuble A', order: 0, rev: 1, updated_at: '', deleted: false });
    await v1.put('meta', 'dev-1', 'device_id');
    v1.close();

    const db = await LocalDb.open(name);
    expect(await db.getAll('furniture')).toHaveLength(1);
    expect(await db.getMeta('device_id')).toBe('dev-1');
    await db.put('person', { id: 'p1', name: 'Marie', order: 0, rev: 0, updated_at: '', deleted: false });
    expect((await db.getAll('person')).map((p) => p.name)).toEqual(['Marie']);
    db.close();
  });
});
