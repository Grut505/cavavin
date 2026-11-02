// Moteur de synchronisation : outbox → feuille (opérations idempotentes), feuille → copie locale.
// Contrat : specs/001-bottle-inventory/contracts/sync-operations.md
import type {
  AnyEntity,
  EntityKind,
  JournalResult,
  Op,
  SyncNotice,
} from '../domain/types';
import { ENTITY_KINDS } from '../domain/types';
import {
  JOURNAL_HEADERS,
  JOURNAL_TAB,
  KIND_TABS,
  META_TAB,
  entityToRow,
  kindHeaders,
  rowToEntity,
  type Raw,
} from './schema';
import { initSheet, isInitialized } from './init-sheet';
import type { LocalDb } from './local-db';
import type { Cell, SheetsApi, WriteBatch } from './sheets-api';

export class NotInitializedError extends Error {
  constructor() {
    super("La feuille n'est pas initialisée (onglets manquants).");
    this.name = 'NotInitializedError';
  }
}

export interface SyncDeps {
  db: LocalDb;
  api: SheetsApi;
  deviceId: string;
  now?: () => Date;
  newId?: () => string;
}

export interface SyncReport {
  pushed: number;
  notices: number;
  healed: number;
}

interface TabModel {
  header: string[];
  rows: Raw[][];
}

interface Tx {
  updates: { tab: string; rowIdx: number; cells: Cell[] }[];
  appends: { tab: string; cells: Cell[] }[];
}

const emptyTx = (): Tx => ({ updates: [], appends: [] });

const same = (a: unknown, b: unknown): boolean => String(a ?? '') === String(b ?? '');

/** Copie en mémoire de la feuille, tenue à jour avec nos propres écritures. */
class RemoteStore {
  private index = new Map<string, Map<string, number>>();
  private journal = new Set<string>();

  constructor(readonly model: Record<string, TabModel>) {
    for (const kind of ENTITY_KINDS) this.reindex(KIND_TABS[kind]);
    const j = model[JOURNAL_TAB]!;
    const k = j.header.indexOf('op_id');
    for (const r of j.rows) if (k >= 0 && r[k]) this.journal.add(String(r[k]));
  }

  private reindex(tab: string): void {
    const m = this.model[tab]!;
    const k = m.header.indexOf('id');
    const map = new Map<string, number>();
    m.rows.forEach((r, i) => {
      const id = k >= 0 ? r[k] : '';
      if (id !== undefined && id !== null && id !== '') map.set(String(id), i);
    });
    this.index.set(tab, map);
  }

  header(kind: EntityKind): string[] {
    return this.model[KIND_TABS[kind]]!.header;
  }

  find(kind: EntityKind, id: string): number {
    return this.index.get(KIND_TABS[kind])?.get(id) ?? -1;
  }

  row(kind: EntityKind, rowIdx: number): Raw[] {
    return this.model[KIND_TABS[kind]]!.rows[rowIdx]!;
  }

  entity(kind: EntityKind, rowIdx: number): Record<string, unknown> {
    return rowToEntity(kind, this.header(kind), this.row(kind, rowIdx));
  }

  all(kind: EntityKind): Record<string, unknown>[] {
    const m = this.model[KIND_TABS[kind]]!;
    const k = m.header.indexOf('id');
    const out: Record<string, unknown>[] = [];
    m.rows.forEach((r, i) => {
      const id = k >= 0 ? r[k] : '';
      if (id !== undefined && id !== null && id !== '') out.push(this.entity(kind, i));
    });
    return out;
  }

  /** Colonnes attendues par cette version de l'application et absentes de la feuille. */
  missingColumns(): string[] {
    const out: string[] = [];
    for (const kind of ENTITY_KINDS) {
      const header = this.header(kind);
      for (const h of kindHeaders(kind)) if (!header.includes(h)) out.push(`${KIND_TABS[kind]}.${h}`);
    }
    const jh = this.model[JOURNAL_TAB]!.header;
    for (const h of JOURNAL_HEADERS) if (!jh.includes(h)) out.push(`${JOURNAL_TAB}.${h}`);
    return out;
  }

  hasOp(opId: string): boolean {
    return this.journal.has(opId);
  }

  /** Construit la ligne à écrire pour une entité (en conservant les colonnes inconnues). */
  buildRow(kind: EntityKind, entity: Record<string, unknown>, rowIdx?: number): Raw[] {
    const existing = rowIdx === undefined ? undefined : this.row(kind, rowIdx);
    return entityToRow(kind, this.header(kind), entity, existing);
  }

  toBatch(tx: Tx): WriteBatch {
    return {
      updates: tx.updates.map((u) => ({ tab: u.tab, row: u.rowIdx + 2, cells: u.cells })),
      appends: tx.appends,
    };
  }

  /** À appeler après écriture réussie dans la feuille. */
  commit(tx: Tx): void {
    const touched = new Set<string>();
    for (const u of tx.updates) {
      const m = this.model[u.tab]!;
      m.rows[u.rowIdx] = [...u.cells];
      touched.add(u.tab);
    }
    for (const a of tx.appends) {
      this.model[a.tab]!.rows.push([...a.cells]);
      touched.add(a.tab);
      if (a.tab === JOURNAL_TAB) this.journal.add(String(a.cells[0]));
    }
    for (const t of touched) if (t !== JOURNAL_TAB) this.reindex(t);
  }
}

/** Identifiants d'entités locales concernées par une opération en attente. */
function touchedIds(op: Op): string[] {
  const ids = [op.entity_id];
  const p = op.payload as Record<string, unknown>;
  if (op.type === 'move' && typeof p.new_stock_id === 'string') ids.push(p.new_stock_id);
  if (op.type === 'qty_delta' && p.outflow && typeof (p.outflow as { id?: unknown }).id === 'string') {
    ids.push((p.outflow as { id: string }).id);
  }
  return ids;
}

export class SyncEngine {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private running: Promise<SyncReport> | null = null;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async enqueue(op: Op): Promise<void> {
    await this.deps.db.addOp(op);
  }

  /** Une seule synchronisation à la fois ; les appels simultanés partagent le même résultat. */
  sync(): Promise<SyncReport> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    const { db, api } = this.deps;
    // Onglets ajoutés par une version plus récente de l'application (ex. « Personnes ») : on les crée
    // si la feuille a déjà été initialisée ; une feuille jamais initialisée reste à la main de l'utilisateur.
    const tabs = await api.listTabs();
    if (!tabs.includes(META_TAB)) throw new NotInitializedError();
    if (!isInitialized(tabs)) await initSheet(api);

    let store = await this.loadRemote();
    // Migration de schéma : colonnes ajoutées par une version plus récente de l'application.
    // Sans elles, les nouvelles valeurs seraient perdues silencieusement à l'écriture.
    if (store.missingColumns().length > 0) {
      await initSheet(api);
      store = await this.loadRemote();
    }
    const healed = await this.healManualRows(store);

    let pushed = 0;
    // Un seul avis par fiche et par type pour toute la synchronisation (sortir 3 bouteilles d'un stock
    // qui n'en contient qu'une ne doit pas produire 3 avis identiques).
    const raised = new Map<string, { notice: SyncNotice; count: number }>();
    for (const { seq, op } of await db.listOps()) {
      if (store.hasOp(op.op_id)) {
        await db.removeOp(seq);
        continue;
      }
      const { tx, result, notice } = this.applyOp(store, op);
      tx.appends.push({
        tab: JOURNAL_TAB,
        cells: [
          op.op_id,
          op.device_id,
          op.ts,
          op.type,
          op.entity_id,
          JSON.stringify(op.payload).slice(0, 1000),
          result,
        ],
      });
      // Écriture + journal dans la même requête atomique : idempotence en cas d'interruption.
      await api.applyBatch(store.toBatch(tx));
      store.commit(tx);
      await db.removeOp(seq);
      pushed++;
      if (notice) {
        const key = `${notice.kind}:${notice.entity}:${notice.entity_id}`;
        const seen = raised.get(key);
        if (seen) seen.count++;
        else raised.set(key, { notice, count: 1 });
      }
    }
    for (const { notice, count } of raised.values()) {
      await this.addNotice(count > 1 ? { ...notice, message: `${notice.message} (${count} opérations concernées)` } : notice);
    }
    const notices = raised.size;

    await this.reconcileLocal(store);
    await db.setMeta('last_sync_at', this.now().toISOString());
    return { pushed, notices, healed };
  }

  // --- lecture de la feuille ---

  private async loadRemote(): Promise<RemoteStore> {
    const tabs = [...ENTITY_KINDS.map((k) => KIND_TABS[k]), JOURNAL_TAB];
    const raw = await this.deps.api.readTabs(tabs);
    const model: Record<string, TabModel> = {};
    for (const tab of tabs) {
      const rows = raw[tab] ?? [];
      const header = (rows[0] ?? []).map((h) => String(h ?? ''));
      if (header.length === 0 || !header.includes(tab === JOURNAL_TAB ? 'op_id' : 'id')) {
        throw new NotInitializedError();
      }
      model[tab] = { header, rows: rows.slice(1).map((r) => padRow(r, header.length)) };
    }
    return new RemoteStore(model);
  }

  /** Lignes ajoutées à la main dans la feuille (sans `id`) : on leur attribue un identifiant. */
  private async healManualRows(store: RemoteStore): Promise<number> {
    const tx = emptyTx();
    const nowIso = this.now().toISOString();
    for (const kind of ENTITY_KINDS) {
      const tab = KIND_TABS[kind];
      const m = store.model[tab]!;
      const idK = m.header.indexOf('id');
      m.rows.forEach((row, rowIdx) => {
        const hasContent = row.some((c) => c !== null && c !== '' && c !== false);
        const id = row[idK];
        if (!hasContent || (id !== null && id !== undefined && id !== '')) return;
        const ent = rowToEntity(kind, m.header, row);
        ent.id = this.newId();
        ent.rev = 1;
        ent.updated_at = nowIso;
        ent.deleted = false;
        if ('created_at' in ent && !ent.created_at) ent.created_at = nowIso;
        if (kind === 'wine' && !ent.format) ent.format = '75cl';
        if (kind === 'proposal') {
          ent.status ||= 'nouvelle';
          ent.source ||= 'claude';
        }
        tx.updates.push({ tab, rowIdx, cells: store.buildRow(kind, ent, rowIdx) });
      });
    }
    if (tx.updates.length === 0) return 0;
    await this.deps.api.applyBatch(store.toBatch(tx));
    store.commit(tx);
    return tx.updates.length;
  }

  // --- application d'une opération sur la feuille ---

  private applyOp(
    store: RemoteStore,
    op: Op,
  ): { tx: Tx; result: JournalResult; notice?: SyncNotice } {
    const tx = emptyTx();
    const tab = KIND_TABS[op.entity];
    const rowIdx = store.find(op.entity, op.entity_id);
    const p = op.payload as Record<string, unknown>;
    const ts = op.ts;

    switch (op.type) {
      case 'create': {
        if (rowIdx >= 0) return { tx, result: 'noop' };
        const ent: Record<string, unknown> = { ...(p.row as Record<string, unknown>), id: op.entity_id };
        ent.rev = 1;
        ent.updated_at = ts;
        ent.deleted = false;
        tx.appends.push({ tab, cells: store.buildRow(op.entity, ent) });
        return { tx, result: 'applied' };
      }

      case 'patch': {
        if (rowIdx < 0) return { tx, result: 'noop' };
        const remote = store.entity(op.entity, rowIdx);
        const fields = p.fields as Record<string, unknown>;
        const before = (p.before ?? {}) as Record<string, unknown>;
        const next = { ...remote };
        const lost: string[] = [];
        const won: string[] = [];
        for (const [name, value] of Object.entries(fields)) {
          const changedRemotely = !same(remote[name], before[name]) && !same(remote[name], value);
          if (changedRemotely) {
            if (String(remote.updated_at) > ts) {
              lost.push(name); // la modification distante est plus récente : elle gagne
              continue;
            }
            won.push(name); // la nôtre est plus récente : elle remplace la distante
          }
          next[name] = value;
        }
        next.rev = Number(remote.rev) + 1;
        next.updated_at = ts;
        tx.updates.push({ tab, rowIdx, cells: store.buildRow(op.entity, next, rowIdx) });
        if (lost.length === 0 && won.length === 0) return { tx, result: 'applied' };
        return {
          tx,
          result: 'conflict_lww',
          notice: this.notice(
            'conflict_lww',
            op,
            lost.length
              ? `Modification simultanée : la version la plus récente a été conservée (${lost.join(', ')}).`
              : `Modification simultanée : votre version a remplacé l’autre (${won.join(', ')}).`,
          ),
        };
      }

      case 'qty_delta': {
        if (rowIdx < 0) return { tx, result: 'noop' };
        const remote = store.entity('stock', rowIdx);
        const delta = Number(p.delta);
        const current = remote.deleted ? 0 : Number(remote.quantity);
        const wanted = current + delta;
        const quantity = Math.max(0, wanted);
        const next = {
          ...remote,
          quantity,
          deleted: quantity === 0,
          rev: Number(remote.rev) + 1,
          updated_at: ts,
        };
        tx.updates.push({ tab, rowIdx, cells: store.buildRow('stock', next, rowIdx) });
        const outflow = p.outflow as Record<string, unknown> | undefined;
        if (outflow && typeof outflow.id === 'string' && store.find('outflow', outflow.id) < 0) {
          const o = { ...outflow, rev: 1, updated_at: ts, deleted: false };
          tx.appends.push({ tab: KIND_TABS.outflow, cells: store.buildRow('outflow', o) });
        }
        if (wanted < 0) {
          return {
            tx,
            result: 'clamped',
            notice: this.notice(
              'clamped',
              op,
              `Quantité ramenée à 0 : la feuille ne contenait que ${current} bouteille(s).`,
            ),
          };
        }
        return { tx, result: 'applied' };
      }

      case 'move': {
        if (rowIdx < 0) return { tx, result: 'noop' };
        const src = store.entity('stock', rowIdx);
        const available = src.deleted ? 0 : Number(src.quantity);
        const qty = Math.min(Number(p.quantity), available);
        if (qty <= 0) return { tx, result: 'noop' };
        const srcLeft = available - qty;
        tx.updates.push({
          tab,
          rowIdx,
          cells: store.buildRow(
            'stock',
            { ...src, quantity: srcLeft, deleted: srcLeft === 0, rev: Number(src.rev) + 1, updated_at: ts },
            rowIdx,
          ),
        });
        const toLoc = String(p.to_location_id);
        const dest = store
          .all('stock')
          .find((s) => s.wine_id === src.wine_id && s.location_id === toLoc);
        if (dest) {
          const destRow = store.find('stock', String(dest.id));
          const destQty = (dest.deleted ? 0 : Number(dest.quantity)) + qty;
          tx.updates.push({
            tab,
            rowIdx: destRow,
            cells: store.buildRow(
              'stock',
              { ...dest, quantity: destQty, deleted: false, rev: Number(dest.rev) + 1, updated_at: ts },
              destRow,
            ),
          });
        } else {
          tx.appends.push({
            tab,
            cells: store.buildRow('stock', {
              id: String(p.new_stock_id),
              rev: 1,
              updated_at: ts,
              deleted: false,
              wine_id: src.wine_id,
              location_id: toLoc,
              quantity: qty,
              position_hint: null,
            }),
          });
        }
        return { tx, result: 'applied' };
      }

      case 'delete': {
        if (rowIdx < 0) return { tx, result: 'noop' };
        const remote = store.entity(op.entity, rowIdx);
        tx.updates.push({
          tab,
          rowIdx,
          cells: store.buildRow(
            op.entity,
            { ...remote, deleted: true, rev: Number(remote.rev) + 1, updated_at: ts },
            rowIdx,
          ),
        });
        return { tx, result: 'applied' };
      }
    }
  }

  private notice(kind: SyncNotice['kind'], op: Op, message: string): SyncNotice {
    return {
      id: this.newId(),
      ts: this.now().toISOString(),
      kind,
      entity: op.entity,
      entity_id: op.entity_id,
      message,
    };
  }

  private async addNotice(n: SyncNotice): Promise<void> {
    const list = (await this.deps.db.getMeta<SyncNotice[]>('sync_notices')) ?? [];
    list.push(n);
    await this.deps.db.setMeta('sync_notices', list);
  }

  // --- feuille → copie locale ---

  private async reconcileLocal(store: RemoteStore): Promise<void> {
    const { db } = this.deps;
    const pending = new Set((await db.listOps()).flatMap(({ op }) => touchedIds(op)));
    for (const kind of ENTITY_KINDS) {
      const remote = store.all(kind) as unknown as AnyEntity[];
      const remoteIds = new Set(remote.map((e) => e.id));
      for (const ent of remote) {
        if (!pending.has(ent.id)) await db.put(kind, ent as never);
      }
      for (const local of await db.getAll(kind)) {
        if (!remoteIds.has(local.id) && !pending.has(local.id)) await db.delete(kind, local.id);
      }
    }
  }
}

function padRow(row: Raw[], length: number): Raw[] {
  const out = row.slice(0, Math.max(length, row.length));
  while (out.length < length) out.push(null);
  return out;
}
