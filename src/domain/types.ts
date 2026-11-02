// Types du domaine — voir specs/001-bottle-inventory/data-model.md

export type EntityKind =
  | 'wine'
  | 'furniture'
  | 'location'
  | 'stock'
  | 'outflow'
  | 'photo'
  | 'proposal'
  | 'person';

export const ENTITY_KINDS: readonly EntityKind[] = [
  'wine',
  'furniture',
  'location',
  'stock',
  'outflow',
  'photo',
  'proposal',
  'person',
];

/** Champs communs à toute entité persistée dans la feuille. */
export interface Base {
  id: string;
  rev: number;
  updated_at: string;
  deleted: boolean;
}

export const WINE_COLORS = ['rouge', 'blanc', 'rosé', 'effervescent', 'liquoreux', 'autre'] as const;
export type WineColor = (typeof WINE_COLORS)[number];

export const BOTTLE_FORMATS = ['demi', '75cl', 'magnum', 'jéroboam', 'autre'] as const;
export type BottleFormat = (typeof BOTTLE_FORMATS)[number];

export const DRYNESS_LEVELS = ['sec', 'demi-sec', 'moelleux', 'doux'] as const;
export type Dryness = (typeof DRYNESS_LEVELS)[number];

export const POSITION_HINTS = ['gauche', 'droite', 'dessus', 'dessous'] as const;
export type PositionHint = (typeof POSITION_HINTS)[number];

export const OUTFLOW_REASONS = ['drunk', 'gifted', 'broken', 'other'] as const;
export type OutflowReason = (typeof OUTFLOW_REASONS)[number];

export interface Wine extends Base {
  domain: string;
  cuvee: string;
  vintage: number | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  color: WineColor | null;
  format: BottleFormat;
  drink_from: number | null;
  drink_until: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  supplier: string | null;
  rating: number | null;
  notes: string | null;
  thumb_ref: string | null;
  legacy_ref: string | null;
  needs_review: boolean;
  created_at: string;
  /** Rouges : note de tanin de 1 (très souple) à 5 (très tannique). */
  tannin: number | null;
  /** Blancs, rosés, effervescents, liquoreux : niveau de sucre. */
  dryness: Dryness | null;
  /** Bouteille reçue en cadeau. */
  gift: boolean;
  /** Identifiant de la personne qui l'a offerte (liste « Personnes » des réglages). */
  gift_from: string | null;
}

/** Personne de la liste paramétrable (donateurs de cadeaux). */
export interface Person extends Base {
  name: string;
  order: number;
}

export interface Furniture extends Base {
  name: string;
  order: number;
}

export type LocationKind = 'shelf' | 'place' | 'legacy';

export interface Location extends Base {
  kind: LocationKind;
  furniture_id: string | null;
  name: string;
  order: number;
}

export interface Stock extends Base {
  wine_id: string;
  location_id: string;
  quantity: number;
  position_hint: PositionHint | null;
}

export interface Outflow extends Base {
  wine_id: string;
  location_id: string;
  reason: OutflowReason;
  date: string;
  note: string | null;
}

export interface Photo extends Base {
  wine_id: string;
  mime: string;
  width: number;
  height: number;
  /** Image encodée en base64 (reconstituée à partir des segments de la feuille). */
  data: string;
}

export type ProposalStatus = 'nouvelle' | 'importée' | 'écartée';
export type ProposalSource = 'claude' | 'paste';

export interface Proposal extends Base {
  created_at: string;
  status: ProposalStatus;
  source: ProposalSource;
  target_wine_id: string | null;
  domain: string | null;
  cuvee: string | null;
  vintage: number | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  color: string | null;
  format: string | null;
  quantity: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  supplier: string | null;
  drink_from: number | null;
  drink_until: number | null;
  notes: string | null;
  raw_json: string | null;
  tannin: number | null;
  dryness: string | null;
}

export interface EntityMap {
  wine: Wine;
  furniture: Furniture;
  location: Location;
  stock: Stock;
  outflow: Outflow;
  photo: Photo;
  proposal: Proposal;
  person: Person;
}

export type AnyEntity = EntityMap[EntityKind];

// --- Opérations de synchronisation (contracts/sync-operations.md) ---

export type OpType = 'create' | 'patch' | 'qty_delta' | 'move' | 'delete';

export interface Op {
  op_id: string;
  device_id: string;
  ts: string;
  type: OpType;
  entity: EntityKind;
  entity_id: string;
  base_rev: number;
  payload: OpPayload;
}

export type OpPayload =
  | { row: Record<string, unknown> } // create
  | { fields: Record<string, unknown>; before: Record<string, unknown> } // patch
  | { delta: number; outflow?: Record<string, unknown> } // qty_delta (entity = stock)
  | { to_location_id: string; quantity: number; new_stock_id: string } // move (entity = stock)
  | Record<string, never>; // delete

export type JournalResult = 'applied' | 'noop' | 'conflict_lww' | 'clamped';

export interface SyncNotice {
  id: string;
  ts: string;
  kind: 'conflict_lww' | 'clamped';
  entity: EntityKind;
  entity_id: string;
  message: string;
}
