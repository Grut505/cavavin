# Contrat : schéma de la Google Sheet

Feuille : `<ID de la feuille>` (variable `VITE_SHEET_ID`) (identifiant public par nature ; accès contrôlé par le partage).

**Règle d'or** : l'onglet d'origine n'est jamais écrit. L'application crée/maintient les onglets ci-dessous (préfixe `_` = interne). La ligne 1 de chaque onglet contient les en-têtes ci-dessous ; l'application lit par **nom d'en-tête**, pas par position (ajouter des colonnes à droite est sans risque).

Colonnes communes à tous les onglets de données : `id`, `rev`, `updated_at`, `deleted` (TRUE/FALSE).

| Onglet | Colonnes propres |
|---|---|
| `Vins` | domain, cuvee, vintage, appellation, region, country, color, format, drink_from, drink_until, purchase_price, purchase_date, supplier, rating, notes, thumb_ref, legacy_ref, needs_review, created_at, dryness, tannin, gift, gift_from |
| `Meubles` | name, order |
| `Emplacements` | kind, furniture_id, name, order |
| `Stocks` | wine_id, location_id, quantity, position_hint |
| `Sorties` | wine_id, location_id, reason, date, note |
| `Propositions` | created_at, status (`nouvelle` \| `importée` \| `écartée`), source (`claude` \| `paste`), target_wine_id, domain, cuvee, vintage, appellation, region, country, color, format, quantity, purchase_price, purchase_date, supplier, drink_from, drink_until, notes, raw_json, tannin, dryness |
| `Personnes` | name, order |
| `Photos` | wine_id, mime, width, height, seg_0 … seg_n (base64, ≤ 40 000 caractères par cellule) |
| `_Journal` | op_id, device_id, ts, type, entity_id, payload, result |
| `_Meta` | key, value — au minimum `schema_version` |

**Propositions** : seul onglet dans lequel le projet Claude (connecteur) est autorisé à **ajouter** des lignes (contracts/label-proposal.md). Il ne modifie jamais une ligne existante ni un autre onglet ; l'application seule change `status`.

## Versionnage et migrations

- **v3** (2026-11) : ajout de l'onglet `Personnes` et des colonnes `gift`, `gift_from` à `Vins`. Migration automatique à la prochaine synchronisation (onglet créé, colonnes ajoutées à droite) pour toute feuille déjà initialisée ; une feuille jamais initialisée n'est jamais modifiée sans action de l'utilisateur.
- **v2** (2026-11) : ajout des colonnes `dryness` et `tannin` à `Vins`, `tannin` et `dryness` à `Propositions`. Les feuilles créées en v1 sont migrées **automatiquement à la prochaine synchronisation** (colonnes ajoutées à droite, version mise à jour) avant toute écriture, pour qu'aucune valeur ne soit perdue.

- `_Meta.schema_version` = entier. L'application refuse d'écrire si la version de la feuille est **supérieure** à celle qu'elle connaît (invite à mettre à jour l'application).
- Migration = ajout de colonnes/onglets uniquement (rétro-compatible) ; toute migration destructive est interdite sans nouvelle version majeure de la constitution.
- Création initiale (« Initialiser ma cave ») : crée les onglets manquants, écrit les en-têtes, `schema_version = 3`, lance l'import.

## Import de l'onglet d'origine (FR-004b)

Table de correspondance **à finaliser** après lecture des en-têtes réels (la feuille n'a pas pu être lue ; voir research.md §4). Principes figés :

1. Chaque ligne d'origine non vide → une fiche `Vins` (`legacy_ref = Onglet!Ligne`), un `Stock` si une quantité existe.
2. Valeurs d'emplacement distinctes → `Emplacements(kind = legacy, name = valeur)`, à rattacher à la cave configurée.
3. Champ manquant ou illisible → vide ; `needs_review = TRUE` si domaine ou millésime manque.
4. Ré-exécutable sans doublon : clé `legacy_ref`.
5. Aucune écriture dans l'onglet d'origine.

## Droits d'accès

Portée OAuth : `https://www.googleapis.com/auth/spreadsheets` (+ `userinfo.email`). Seuls les comptes avec accès éditeur à la feuille peuvent lire/écrire ; HTTP 403 → écran « accès refusé ».
