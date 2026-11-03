// Dépôt : lecture de la copie locale, écritures optimistes + mise en file d'opérations.
import type {
  Base,
  EntityKind,
  EntityMap,
  Op,
  OpPayload,
  OpType,
  Outflow,
  OutflowReason,
  Person,
  PhotoSide,
  PositionHint,
  Proposal,
  ProposalSource,
  ProposalStatus,
  Stock,
  SyncNotice,
  Wine,
} from '../domain/types';
import {
  UNASSIGNED_NAME,
  assertFurnitureName,
  assertPlaceName,
  assertShelfName,
  bottleCount,
  nextOrder,
  nextShelfName,
  planFurniture,
  requireDecision,
  stocksAt,
  validateMoveTarget,
  type DeletionDecision,
} from '../domain/locations';
import { mergePatch } from '../domain/merge';
import { assertPersonName, nextPersonOrder, sortPersons } from '../domain/people';
import { validateMove, validateOutflow } from '../domain/stock';
import type { WineFields } from '../domain/wine';
import type { ProposalData } from '../scan/proposal';
import type { Thumbnail } from '../scan/image';
import type { LocalDb } from './local-db';
import type { SyncEngine, SyncReport } from './sync-engine';

export interface StockInput {
  location_id: string;
  quantity: number;
  position_hint: PositionHint | null;
}

type Data<K extends EntityKind> = Omit<EntityMap[K], keyof Base> & { id?: string };

export class Repository {
  private listeners = new Set<() => void>();
  private writeListeners = new Set<() => void>();

  constructor(
    private readonly db: LocalDb,
    private readonly engine: SyncEngine,
    private readonly deviceId: string,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notifié à chaque écriture locale (ex. pour déclencher une synchronisation différée). */
  onWrite(fn: () => void): () => void {
    this.writeListeners.add(fn);
    return () => this.writeListeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private changed(): void {
    this.notify();
    this.writeListeners.forEach((l) => l());
  }

  // --- lecture ---

  async list<K extends EntityKind>(kind: K, includeDeleted = false): Promise<EntityMap[K][]> {
    const all = await this.db.getAll(kind);
    return includeDeleted ? all : all.filter((e) => !e.deleted);
  }

  async get<K extends EntityKind>(kind: K, id: string, includeDeleted = false): Promise<EntityMap[K] | undefined> {
    const e = await this.db.get(kind, id);
    return e && (includeDeleted || !e.deleted) ? e : undefined;
  }

  pendingCount(): Promise<number> {
    return this.db.outboxCount();
  }

  async lastSyncAt(): Promise<string | undefined> {
    return this.db.getMeta<string>('last_sync_at');
  }

  async notices(): Promise<SyncNotice[]> {
    return (await this.db.getMeta<SyncNotice[]>('sync_notices')) ?? [];
  }

  /** Acquitte un avis de synchronisation (il disparaît de la liste). */
  async acknowledgeNotice(id: string): Promise<void> {
    const list = (await this.db.getMeta<SyncNotice[]>('sync_notices')) ?? [];
    await this.db.setMeta('sync_notices', list.filter((n) => n.id !== id));
    this.notify();
  }

  async acknowledgeAllNotices(): Promise<void> {
    await this.db.setMeta('sync_notices', []);
    this.notify();
  }

  // --- écriture ---

  private async enqueue(
    type: OpType,
    entity: EntityKind,
    entityId: string,
    baseRev: number,
    payload: OpPayload,
  ): Promise<void> {
    const op: Op = {
      op_id: this.newId(),
      device_id: this.deviceId,
      ts: this.now().toISOString(),
      type,
      entity,
      entity_id: entityId,
      base_rev: baseRev,
      payload,
    };
    await this.engine.enqueue(op);
  }

  async create<K extends EntityKind>(kind: K, data: Data<K>): Promise<EntityMap[K]> {
    const ts = this.now().toISOString();
    const id = data.id ?? this.newId();
    const entity = { ...data, id, rev: 0, updated_at: ts, deleted: false } as unknown as EntityMap[K];
    await this.db.put(kind, entity);
    await this.enqueue('create', kind, id, 0, { row: entity as unknown as Record<string, unknown> });
    this.changed();
    return entity;
  }

  async patch<K extends EntityKind>(
    kind: K,
    id: string,
    fields: Partial<Omit<EntityMap[K], keyof Base>>,
  ): Promise<EntityMap[K]> {
    const current = await this.db.get(kind, id);
    if (!current) throw new Error(`${kind} ${id} introuvable`);
    const cur = current as unknown as Record<string, unknown>;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(fields)) before[k] = cur[k] ?? null;
    const next = { ...cur, ...fields, updated_at: this.now().toISOString() } as unknown as EntityMap[K];
    await this.db.put(kind, next);
    await this.enqueue('patch', kind, id, current.rev, {
      fields: fields as Record<string, unknown>,
      before,
    });
    this.changed();
    return next;
  }

  async remove(kind: EntityKind, id: string): Promise<void> {
    const current = await this.db.get(kind, id);
    if (!current) return;
    await this.db.put(kind, { ...current, deleted: true, updated_at: this.now().toISOString() } as never);
    await this.enqueue('delete', kind, id, current.rev, {});
    this.changed();
  }

  /** Variation de quantité d'un stock (négative = sortie). Plancher à 0. */
  async adjustStock(
    stockId: string,
    delta: number,
    outflow?: Omit<Outflow, keyof Base | 'wine_id' | 'location_id'>,
  ): Promise<string | undefined> {
    const stock = await this.db.get('stock', stockId);
    if (!stock) throw new Error(`stock ${stockId} introuvable`);
    const ts = this.now().toISOString();
    const current = stock.deleted ? 0 : stock.quantity;
    const quantity = Math.max(0, current + delta);
    await this.db.put('stock', { ...stock, quantity, deleted: quantity === 0, updated_at: ts });

    let outflowRow: Record<string, unknown> | undefined;
    let outflowId: string | undefined;
    if (outflow) {
      const o: Outflow = {
        ...outflow,
        id: this.newId(),
        rev: 0,
        updated_at: ts,
        deleted: false,
        wine_id: stock.wine_id,
        location_id: stock.location_id,
      };
      await this.db.put('outflow', o);
      outflowRow = o as unknown as Record<string, unknown>;
      outflowId = o.id;
    }
    await this.enqueue('qty_delta', 'stock', stockId, stock.rev, {
      delta,
      ...(outflowRow ? { outflow: outflowRow } : {}),
    });
    this.changed();
    return outflowId;
  }

  /**
   * Déplace `quantity` bouteilles d'un stock vers un autre emplacement et retourne l'identifiant du
   * stock de destination (`null` si rien n'a été déplacé). `hint` mémorise la position sur l'étagère
   * de destination.
   */
  async moveStock(
    stockId: string,
    toLocationId: string,
    quantity: number,
    hint?: PositionHint | null,
  ): Promise<string | null> {
    const src = await this.db.get('stock', stockId);
    if (!src || src.deleted) throw new Error(`stock ${stockId} introuvable`);
    if (toLocationId === src.location_id) return null;
    const qty = Math.min(quantity, src.quantity);
    if (qty <= 0) return null;
    const ts = this.now().toISOString();
    const left = src.quantity - qty;
    await this.db.put('stock', { ...src, quantity: left, deleted: left === 0, updated_at: ts });

    const newStockId = this.newId();
    const dest = (await this.db.getAll('stock')).find(
      (s: Stock) => s.wine_id === src.wine_id && s.location_id === toLocationId,
    );
    const destId = dest ? dest.id : newStockId;
    if (dest) {
      await this.db.put('stock', {
        ...dest,
        quantity: (dest.deleted ? 0 : dest.quantity) + qty,
        deleted: false,
        updated_at: ts,
      });
    } else {
      await this.db.put('stock', {
        id: newStockId,
        rev: 0,
        updated_at: ts,
        deleted: false,
        wine_id: src.wine_id,
        location_id: toLocationId,
        quantity: qty,
        position_hint: null,
      });
    }
    await this.enqueue('move', 'stock', stockId, src.rev, {
      to_location_id: toLocationId,
      quantity: qty,
      new_stock_id: newStockId,
    });
    if (hint) await this.patch('stock', destId, { position_hint: hint });
    this.changed();
    return destId;
  }

  /**
   * Sort des bouteilles d'un stock : une sortie (motif, date, note) par bouteille, pour que les
   * statistiques futures comptent juste. À zéro, le stock est désactivé et la fiche passe en historique.
   */
  async recordOutflow(
    stockId: string,
    opts: { reason: OutflowReason; date: string; note: string | null; quantity?: number },
  ): Promise<string[]> {
    const stock = await this.get('stock', stockId);
    if (!stock) throw new Error(`stock ${stockId} introuvable`);
    const check = validateOutflow({
      quantity: opts.quantity ?? 1,
      available: stock.quantity,
      date: opts.date,
      reason: opts.reason,
    });
    if (!check.ok) throw new Error(check.issues.map((i) => i.message).join(' '));
    const { quantity, date, reason } = check.value;
    const note = opts.note?.trim() ? opts.note.trim() : null;
    const ids: string[] = [];
    for (let i = 0; i < quantity; i++) {
      const id = await this.adjustStock(stockId, -1, { reason, date, note });
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * Annule des sorties (tap malheureux) : remet une bouteille par sortie à son emplacement d'origine et supprime
   * les sorties de l'historique. Les stocks désactivés repassent actifs.
   */
  async undoOutflows(ids: string[]): Promise<void> {
    for (const id of ids) {
      const o = await this.db.get('outflow', id);
      if (!o || o.deleted) continue;
      const stock = (await this.db.getAll('stock')).find((s) => s.wine_id === o.wine_id && s.location_id === o.location_id);
      if (stock) await this.adjustStock(stock.id, 1);
      else await this.create('stock', { wine_id: o.wine_id, location_id: o.location_id, quantity: 1, position_hint: null });
      await this.remove('outflow', id);
    }
  }

  /** Vérifie un déplacement (quantité, destination) avant de l'appliquer. */
  async moveBottles(
    stockId: string,
    toLocationId: string,
    quantity: number,
    hint?: PositionHint | null,
  ): Promise<void> {
    const stock = await this.get('stock', stockId);
    if (!stock) throw new Error(`stock ${stockId} introuvable`);
    const check = validateMove({ quantity, available: stock.quantity, fromLocationId: stock.location_id, toLocationId });
    if (!check.ok) throw new Error(check.issues.map((i) => i.message).join(' '));
    await this.moveStock(stockId, toLocationId, check.quantity, hint);
  }

  /** Modifie une fiche : seuls les champs réellement changés sont écrits (fusion plus fine en cas de conflit). */
  async updateWine(wineId: string, fields: Partial<WineFields>): Promise<Wine> {
    const current = await this.get('wine', wineId);
    if (!current) throw new Error(`fiche ${wineId} introuvable`);
    const cur = current as unknown as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) if (cur[k] !== v) changed[k] = v;
    if (current.needs_review) changed.needs_review = false;
    if (Object.keys(changed).length === 0) return current;
    return this.patch('wine', wineId, changed as Partial<Wine>);
  }

  // --- fiches et stocks (US1) ---

  /** Crée une fiche, ses stocks et (facultatif) sa miniature. */
  async addWine(fields: WineFields, stocks: StockInput[], thumb?: Thumbnail): Promise<Wine> {
    const wine = await this.create('wine', {
      ...fields,
      thumb_ref: null,
      legacy_ref: null,
      needs_review: false,
      to_buy: false,
      created_at: this.now().toISOString(),
    });
    for (const st of stocks) await this.addStock(wine.id, st);
    if (thumb) await this.setThumbnail(wine.id, thumb);
    return (await this.get('wine', wine.id)) ?? wine;
  }

  /**
   * Ajoute des bouteilles à une fiche à un emplacement : fusionne avec le stock existant
   * (une ligne par fiche et par emplacement), le réactive s'il était à zéro.
   */
  async addStock(wineId: string, input: StockInput): Promise<void> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new Error('La quantité doit être un entier supérieur ou égal à 1.');
    }
    const existing = (await this.db.getAll('stock')).find(
      (s) => s.wine_id === wineId && s.location_id === input.location_id,
    );
    if (!existing) {
      await this.create('stock', {
        wine_id: wineId,
        location_id: input.location_id,
        quantity: input.quantity,
        position_hint: input.position_hint,
      });
      return;
    }
    await this.adjustStock(existing.id, input.quantity);
    if (input.position_hint && existing.position_hint !== input.position_hint) {
      await this.patch('stock', existing.id, { position_hint: input.position_hint });
    }
  }

  /** Complète une fiche existante avec des champs choisis, sans toucher aux quantités. */
  async completeWine(wineId: string, changes: Record<string, unknown>): Promise<void> {
    await this.patch('wine', wineId, { ...changes, needs_review: false } as Partial<Wine>);
  }

  /** Remplace la miniature d'une fiche (l'ancienne est supprimée). */
  async setThumbnail(wineId: string, thumb: Thumbnail, side: PhotoSide = 'avant'): Promise<void> {
    for (const old of (await this.list('photo')).filter((p) => p.wine_id === wineId && (p.side ?? 'avant') === side)) {
      await this.remove('photo', old.id);
    }
    const photo = await this.create('photo', {
      wine_id: wineId,
      side,
      mime: thumb.mime,
      width: thumb.width,
      height: thumb.height,
      data: thumb.data,
    });
    if (side === 'avant') await this.patch('wine', wineId, { thumb_ref: photo.id });
  }

  /** Miniatures disponibles localement : fiche → data URL. */
  async thumbnailUrls(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const p of await this.list('photo')) {
      if (p.data && (p.side ?? 'avant') === 'avant') out.set(p.wine_id, `data:${p.mime};base64,${p.data}`);
    }
    return out;
  }

  /** Les deux faces de chaque fiche : miniature de l'avant et de l'arrière (data URL), quand elles existent. */
  async photoUrls(): Promise<Map<string, { front?: string; back?: string }>> {
    const out = new Map<string, { front?: string; back?: string }>();
    for (const p of await this.list('photo')) {
      if (!p.data) continue;
      const cur = out.get(p.wine_id) ?? {};
      cur[(p.side ?? 'avant') === 'avant' ? 'front' : 'back'] = `data:${p.mime};base64,${p.data}`;
      out.set(p.wine_id, cur);
    }
    return out;
  }

  // --- personnes (cadeaux) ---

  /** Personnes de la liste, triées par nom. */
  async persons(): Promise<Person[]> {
    return sortPersons(await this.list('person'));
  }

  async addPerson(name: string): Promise<Person> {
    const all = await this.list('person');
    return this.create('person', { name: assertPersonName(name, all), order: nextPersonOrder(all) });
  }

  async renamePerson(id: string, name: string): Promise<void> {
    await this.patch('person', id, { name: assertPersonName(name, await this.list('person'), id) });
  }

  /** Retire une personne de la liste. Les fiches qui la citent gardent la référence et le nom reste affiché. */
  async removePerson(id: string): Promise<void> {
    await this.remove('person', id);
  }

  /**
   * Fusionne la fiche `absorbedId` dans `keepId` : bouteilles (stocks fusionnés par emplacement), historique des
   * sorties, miniature si la fiche conservée n'en a pas, champs vides comblés ; la fiche absorbée est supprimée.
   */
  async mergeWines(keepId: string, absorbedId: string): Promise<void> {
    if (keepId === absorbedId) throw new Error('Choisissez deux fiches différentes.');
    const keep = await this.get('wine', keepId);
    const absorbed = await this.get('wine', absorbedId);
    if (!keep || !absorbed) throw new Error('Fiche introuvable.');

    const stocks = (await this.db.getAll('stock')).filter((s) => !s.deleted && s.quantity > 0);
    for (const st of stocks.filter((s) => s.wine_id === absorbedId)) {
      const same = stocks.find((s) => s.wine_id === keepId && s.location_id === st.location_id);
      if (same) {
        await this.adjustStock(same.id, st.quantity); // même emplacement : on additionne
        await this.adjustStock(st.id, -st.quantity); // et l'ancien stock est vidé (sans sortie : ce n'est pas une consommation)
      } else {
        await this.patch('stock', st.id, { wine_id: keepId });
      }
    }
    for (const o of (await this.list('outflow')).filter((x) => x.wine_id === absorbedId)) {
      await this.patch('outflow', o.id, { wine_id: keepId });
    }
    const photos = await this.list('photo');
    const hasFace = (wineId: string, side: PhotoSide): boolean => photos.some((p) => p.wine_id === wineId && (p.side ?? 'avant') === side);
    for (const side of ['avant', 'arrière'] as const) {
      const photo = photos.find((p) => p.wine_id === absorbedId && (p.side ?? 'avant') === side);
      if (!photo || hasFace(keepId, side)) continue; // la face de la fiche conservée est gardée
      await this.patch('photo', photo.id, { wine_id: keepId });
      if (side === 'avant') await this.patch('wine', keepId, { thumb_ref: photo.id });
    }
    const fields = mergePatch(keep, absorbed);
    if (Object.keys(fields).length > 0) await this.patch('wine', keepId, fields);
    await this.remove('wine', absorbedId);
  }

  /** Ajoute ou retire une fiche de la liste de courses. */
  async setToBuy(wineId: string, toBuy: boolean): Promise<void> {
    await this.patch('wine', wineId, { to_buy: toBuy });
  }

  /** Nombre de fiches offertes par cette personne. */
  async giftCount(personId: string): Promise<number> {
    return (await this.list('wine')).filter((w) => w.gift && w.gift_from === personId).length;
  }

  // --- propositions du projet Claude (US1) ---

  /** Enregistre une proposition (collée ou lue) ; elle est synchronisée dans l'onglet Propositions. */
  async createProposal(p: ProposalData, source: ProposalSource): Promise<Proposal> {
    return this.create('proposal', {
      created_at: this.now().toISOString(),
      status: 'nouvelle',
      source,
      target_wine_id: p.target_wine_id,
      domain: p.domain,
      cuvee: p.cuvee,
      vintage: p.vintage,
      appellation: p.appellation,
      region: p.region,
      country: p.country,
      color: p.color,
      format: p.format,
      quantity: p.quantity,
      purchase_price: p.purchase_price,
      purchase_date: p.purchase_date,
      supplier: p.supplier,
      drink_from: p.drink_from,
      drink_until: p.drink_until,
      notes: p.notes,
      raw_json: p.raw_json,
      tannin: p.tannin,
      dryness: p.dryness,
      pairings: p.pairings,
    });
  }

  /** Propositions en attente de validation, les plus récentes d'abord. */
  async pendingProposals(): Promise<Proposal[]> {
    return (await this.list('proposal'))
      .filter((p) => p.status === 'nouvelle')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async resolveProposal(id: string, status: Exclude<ProposalStatus, 'nouvelle'>): Promise<void> {
    await this.patch('proposal', id, { status });
  }

  // --- cave : meubles, étagères, lieux (US0) ---

  /** Crée un meuble et ses N étagères numérotées de haut en bas. */
  async createFurniture(name: string, shelfCount: number): Promise<string> {
    const plan = planFurniture(name, shelfCount, await this.list('furniture'));
    const furniture = await this.create('furniture', plan.furniture);
    for (const shelf of plan.shelves) {
      await this.create('location', {
        kind: 'shelf',
        furniture_id: furniture.id,
        name: shelf.name,
        order: shelf.order,
      });
    }
    return furniture.id;
  }

  async renameFurniture(id: string, name: string): Promise<void> {
    const clean = assertFurnitureName(name, await this.list('furniture'), id);
    await this.patch('furniture', id, { name: clean });
  }

  /** Ajoute une étagère en bas du meuble. */
  async addShelf(furnitureId: string): Promise<string> {
    const shelves = await this.shelvesOf(furnitureId);
    const loc = await this.create('location', {
      kind: 'shelf',
      furniture_id: furnitureId,
      name: nextShelfName(shelves),
      order: nextOrder(shelves),
    });
    return loc.id;
  }

  async renameLocation(id: string, name: string): Promise<void> {
    const loc = await this.get('location', id);
    if (!loc) throw new Error(`emplacement ${id} introuvable`);
    const siblings =
      loc.kind === 'shelf'
        ? await this.shelvesOf(loc.furniture_id ?? '')
        : (await this.list('location')).filter((l) => l.kind === loc.kind);
    const clean =
      loc.kind === 'shelf' ? assertShelfName(name, siblings, id) : assertPlaceName(name, siblings, id);
    await this.patch('location', id, { name: clean });
  }

  async createPlace(name: string): Promise<string> {
    const places = (await this.list('location')).filter((l) => l.kind === 'place');
    const clean = assertPlaceName(name, places);
    const loc = await this.create('location', {
      kind: 'place',
      furniture_id: null,
      name: clean,
      order: nextOrder(places),
    });
    return loc.id;
  }

  /** Supprime une étagère ou un lieu. Non vide : une décision explicite est exigée (FR-003d). */
  async deleteLocation(id: string, decision?: DeletionDecision): Promise<void> {
    await this.removeLocations([id], decision);
  }

  /** Supprime un meuble et ses étagères, avec la même garde que `deleteLocation`. */
  async deleteFurniture(id: string, decision?: DeletionDecision): Promise<void> {
    const shelves = await this.shelvesOf(id);
    await this.removeLocations(shelves.map((s) => s.id), decision);
    await this.remove('furniture', id);
  }

  /** Nombre de bouteilles actives dans un ensemble d'emplacements. */
  async bottlesIn(locationIds: string[]): Promise<number> {
    const stocks = await this.list('stock');
    return locationIds.reduce((n, id) => n + bottleCount(stocks, id), 0);
  }

  private async shelvesOf(furnitureId: string) {
    return (await this.list('location')).filter(
      (l) => l.kind === 'shelf' && l.furniture_id === furnitureId,
    );
  }

  private async removeLocations(ids: string[], decision?: DeletionDecision): Promise<void> {
    const locations = await this.list('location');
    const stocks = await this.list('stock');
    const bottles = ids.reduce((n, id) => n + bottleCount(stocks, id), 0);
    requireDecision(bottles, decision);

    if (bottles > 0 && decision) {
      const removed = new Set(ids);
      validateMoveTarget(decision, removed, locations);
      const targetId =
        decision.action === 'move' ? decision.toLocationId : await this.unassignedLocationId();
      for (const id of ids) {
        for (const st of stocksAt(stocks, id)) await this.moveStock(st.id, targetId, st.quantity);
      }
    }
    for (const id of ids) await this.remove('location', id);
  }

  /** Emplacement « Sans emplacement » (créé à la demande, jamais supprimé automatiquement). */
  private async unassignedLocationId(): Promise<string> {
    const existing = (await this.list('location')).find(
      (l) => l.kind === 'legacy' && l.name === UNASSIGNED_NAME,
    );
    if (existing) return existing.id;
    const loc = await this.create('location', {
      kind: 'legacy',
      furniture_id: null,
      name: UNASSIGNED_NAME,
      order: 9999,
    });
    return loc.id;
  }

  // --- synchronisation ---

  async sync(): Promise<SyncReport> {
    try {
      return await this.engine.sync();
    } finally {
      this.notify();
    }
  }
}

export async function getOrCreateDeviceId(db: LocalDb): Promise<string> {
  const existing = await db.getMeta<string>('device_id');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.setMeta('device_id', id);
  return id;
}
