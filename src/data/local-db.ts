// Copie locale (IndexedDB) : entités, file d'opérations (outbox), métadonnées.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AnyEntity, EntityKind, EntityMap, Op } from '../domain/types';
import { ENTITY_KINDS } from '../domain/types';

interface CavavinDB extends DBSchema {
  wine: { key: string; value: EntityMap['wine'] };
  furniture: { key: string; value: EntityMap['furniture'] };
  location: { key: string; value: EntityMap['location'] };
  stock: { key: string; value: EntityMap['stock'] };
  outflow: { key: string; value: EntityMap['outflow'] };
  photo: { key: string; value: EntityMap['photo'] };
  proposal: { key: string; value: EntityMap['proposal'] };
  person: { key: string; value: EntityMap['person'] };
  outbox: { key: number; value: Op };
  meta: { key: string; value: unknown };
}

export const DB_NAME = 'cavavin';
export const DB_VERSION = 2;

export class LocalDb {
  private constructor(private readonly db: IDBPDatabase<CavavinDB>) {}

  static async open(name = DB_NAME): Promise<LocalDb> {
    const db = await openDB<CavavinDB>(name, DB_VERSION, {
      // Montée de version sans perte : on ne crée que les tables manquantes (v2 : `person`).
      upgrade(database) {
        for (const kind of ENTITY_KINDS) {
          if (!database.objectStoreNames.contains(kind)) database.createObjectStore(kind, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('outbox')) database.createObjectStore('outbox', { autoIncrement: true });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
      },
    });
    return new LocalDb(db);
  }

  close(): void {
    this.db.close();
  }

  // --- entités ---

  async getAll<K extends EntityKind>(kind: K): Promise<EntityMap[K][]> {
    return (await this.db.getAll(kind)) as EntityMap[K][];
  }

  async get<K extends EntityKind>(kind: K, id: string): Promise<EntityMap[K] | undefined> {
    return (await this.db.get(kind, id)) as EntityMap[K] | undefined;
  }

  async put<K extends EntityKind>(kind: K, entity: EntityMap[K]): Promise<void> {
    await this.db.put(kind, entity as never);
  }

  async delete(kind: EntityKind, id: string): Promise<void> {
    await this.db.delete(kind, id);
  }

  // --- outbox ---

  async addOp(op: Op): Promise<void> {
    await this.db.add('outbox', op);
  }

  /** Opérations en attente, dans l'ordre d'enregistrement. */
  async listOps(): Promise<{ seq: number; op: Op }[]> {
    const tx = this.db.transaction('outbox', 'readonly');
    const out: { seq: number; op: Op }[] = [];
    let cursor = await tx.store.openCursor();
    while (cursor) {
      out.push({ seq: cursor.key, op: cursor.value });
      cursor = await cursor.continue();
    }
    return out;
  }

  async removeOp(seq: number): Promise<void> {
    await this.db.delete('outbox', seq);
  }

  async outboxCount(): Promise<number> {
    return this.db.count('outbox');
  }

  // --- méta ---

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', value, key);
  }

  /** Purge toutes les données locales (changement de compte, accès refusé). */
  async clearAll(): Promise<void> {
    const names = [...ENTITY_KINDS, 'outbox', 'meta'] as const;
    const tx = this.db.transaction([...names], 'readwrite');
    await Promise.all(names.map((n) => tx.objectStore(n).clear()));
    await tx.done;
  }
}

export type { AnyEntity };
