# Data Model — Inventaire de la cave

Identifiants : UUID v4 générés côté client. Toutes les entités persistées portent `rev` (entier, +1 à chaque écriture), `updated_at` (ISO 8601 UTC) et `deleted` (suppression logique). Stockage de référence : onglets de la feuille (voir [contracts/sheet-schema.md](contracts/sheet-schema.md)) ; copie locale dans IndexedDB.

## Wine (fiche) — FR-003, FR-002a, FR-005

| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| domain | texte | **facultatif** (peut être vide) ; avec `cuvee` et `vintage` forme la **clé d'unicité** (normalisée : minuscules, sans accents/espaces multiples) |
| cuvee | texte | **obligatoire** à la saisie (« — » accepté s'il n'y a pas de cuvée) |
| vintage | entier \| null | **obligatoire** à la saisie : une année 1900–année courante+1, ou « NV » (enregistré `null` = non millésimé) |
| appellation | texte | **obligatoire** à la saisie |
| region, country | texte | facultatifs ; graphies harmonisées par l'autocomplétion de la cave |
| color | enum | **obligatoire** à la saisie : rouge, blanc, rosé, effervescent, liquoreux, autre |
| format | enum | **obligatoire** à la saisie : demi, 75cl, magnum, jéroboam, autre (défaut 75cl) — FR-002b |
| drink_from, drink_until | année \| null | **facultatifs** (placés dans la partie principale du formulaire) ; `drink_from ≤ drink_until` quand les deux sont donnés |
| purchase_price | décimal € \| null | ≥ 0 |
| purchase_date | date \| null | affichage jj/mm/aaaa |
| supplier | texte \| null | |
| rating | entier 1–5 \| null | |
| tannin | entier 1–5 \| null | rouges : 1 = très souple … 5 = très tannique ; null pour les autres couleurs |
| gift | booléen | bouteille reçue en cadeau (défaut false) |
| gift_from | uuid \| null | `Person.id` de la personne qui l'a offerte ; non nul seulement si `gift` |
| dryness | enum \| null | `sec`, `demi-sec`, `moelleux`, `doux` ; blancs, rosés, effervescents, liquoreux ; null pour un rouge |
| notes | texte \| null | |
| thumb_ref | uuid \| null | miniature (`Photo`) |
| legacy_ref | texte \| null | `Onglet!Ligne` d'origine si importée — FR-004b |
| needs_review | booléen | vrai pour les lignes importées incomplètes (« à compléter ») |
| created_at | ISO | « date d'ajout » (tri) |

Quantité totale = somme des `Stock.quantity` actifs de la fiche (calculée, jamais stockée).

## Location (emplacement) — FR-003a/b

| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| kind | enum | `shelf` \| `place` (pièce, placard…) \| `legacy` (emplacement importé à rattacher) |
| furniture_id | uuid \| null | requis si `kind = shelf` |
| name | texte | libellé (« Étagère 3 », « Cellier ») ; unique dans son meuble / parmi les `place` |
| order | entier | ordre d'affichage (haut→bas dans le schéma) |

## Person (personne) — cadeaux

| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| name | texte | unique (accents/casse ignorés) parmi les personnes actives |
| order | entier | ordre de création |

Supprimer une personne (suppression logique) ne modifie pas les fiches : `gift_from` conserve la référence et le nom reste affiché.

## Furniture (meuble/casier) — FR-003a

| Champ | Type | Règle |
|---|---|---|
| id, name, order | | `name` unique |
| shelf_count | dérivé | nombre de `Location(shelf)` actives |

Règles : suppression d'une `Location` ou d'un `Furniture` non vide **interdite sans** déplacement des stocks ou confirmation explicite (FR-003d) ; si confirmée, les stocks sont déplacés vers `legacy` « Sans emplacement », jamais supprimés.

## Stock — FR-003, FR-003c

| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| wine_id, location_id | uuid | paire unique (une ligne par fiche et par emplacement) |
| quantity | entier ≥ 0 | à 0 : ligne désactivée (`deleted = true`), fiche encore listée seulement si historique |
| position_hint | enum \| null | 9 zones `rangée-colonne` : rangées dessus / milieu / dessous × colonnes gauche / centre / droite (ex. `dessus-gauche`) — indicatif, jamais recalculé. Anciennes valeurs reprises à la lecture : `dessus` et `dessous` → `milieu-centre`, `gauche` → `milieu-gauche`, `droite` → `milieu-droite` |

## Outflow (sortie) — FR-012

| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| wine_id, location_id | uuid | emplacement d'où la bouteille est sortie |
| reason | enum | `drunk` (défaut), `gifted`, `broken`, `other` |
| date | date | défaut aujourd'hui |
| note | texte \| null | |

## Photo (miniature) — FR-005

`id`, `wine_id`, `mime` (`image/jpeg`), `data_base64` (segmentée si > 40 000 caractères), `width`, `height`.

## Proposition — FR-001, FR-001a, FR-004a

`id`, `created_at`, `status` (`nouvelle` → `importée` | `écartée`), `source` (`claude` | `paste`), `target_wine_id` (facultatif), puis les champs de fiche du contrat [contracts/label-proposal.md](contracts/label-proposal.md), `quantity` proposée, `raw_json` d'origine. Une proposition ne devient fiche/stock que par validation de l'utilisateur (aucune écriture automatique dans `Vins`/`Stocks`).

## Journal — FR-016 (idempotence et audit)

`op_id` (uuid, unique), `device_id`, `ts`, `type`, `entity_id`, `payload` (JSON court), `result` (`applied` | `noop` | `conflict_lww` | `clamped`).

## Données locales uniquement (IndexedDB)

- `outbox` : opérations en attente (voir [contracts/sync-operations.md](contracts/sync-operations.md)) ; inclut `photo_pending` (miniature en attente de rattachement).
- `meta` : `device_id`, `last_sync_at`, `schema_version`, `sync_notices` (avis « champ remplacé » à montrer à l'utilisateur).

## Transitions d'état

- Stock : `actif (q>0)` → décrément (sortie) → `q=0 ⇒ désactivé`.
- Wine : `active` (≥ 1 stock actif) → `historique` (0 stock actif, ≥ 1 sortie) ; ré-ajout d'une bouteille de la même clé la réactive (FR-004).
- Wine importé : `needs_review = true` → `false` dès qu'une modification manuelle ou un rescan valide la fiche.
