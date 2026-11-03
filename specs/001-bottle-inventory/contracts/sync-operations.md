# Contrat : opérations de synchronisation

Toute modification utilisateur est enregistrée localement **puis** ajoutée à l'`outbox` (IndexedDB), appliquée à l'état local immédiatement (UI optimiste), puis poussée à la feuille quand réseau + jeton valides.

## Enveloppe

```json
{ "op_id": "uuid", "device_id": "uuid", "ts": "2026-11-01T10:00:00Z",
  "type": "create|patch|qty_delta|move|delete",
  "entity": "wine|location|furniture|stock|outflow|photo|proposal|person", "entity_id": "uuid",
  "base_rev": 4, "payload": { } }
```

## Types

| type | payload | Application à la feuille | Résultat journalisé |
|---|---|---|---|
| `create` | ligne complète | ajoute la ligne si `id` absent, sinon `noop` | applied / noop |
| `patch` | `{champ: valeur, …}` | relit la ligne ; pour chaque champ changé côté feuille depuis `base_rev` : l'`updated_at` le plus récent gagne ; écrit, `rev+1` | applied / conflict_lww (+ avis utilisateur) |
| `qty_delta` | `{stock_id, delta, reason?, outflow_id?}` | relit `quantity`, écrit `max(0, q+delta)` ; crée la ligne `Sorties` si `outflow_id` | applied / clamped |
| `move` | `{stock_id, to_location_id, quantity}` | décrémente la source, incrémente la destination (fusion si stock existant) | applied |
| `delete` | — | `deleted = TRUE`, `rev+1` ; refusé si Location/Furniture non vide (FR-003d) | applied |
| `proposal_accept` / `proposal_dismiss` | *(non implémentés comme types dédiés)* | L'acceptation d'une proposition est une **composition d'opérations existantes** : `create` de la fiche et des stocks (ou `patch` pour compléter, `qty_delta` pour ajouter), puis `patch` de `status` → `importée` sur la ligne `Propositions`. L'écart est un `patch` de `status` → `écartée`. Chaque opération reste idempotente et journalisée. | applied |
| *(miniature)* | — | Pas de type dédié : la miniature est une entité `photo` créée localement (`create`) puis rattachée à la fiche (`patch` de `thumb_ref`) ; elle se synchronise comme toute autre entité, y compris après un passage hors-ligne. | applied |

## Garanties

1. **Idempotence** : avant d'appliquer, vérifier `op_id` dans `_Journal` ; présent ⇒ ignorer. Écrire la ligne `_Journal` **dans le même `batchUpdate`** que la modification.
2. **Ordre** : les opérations d'une même entité sont appliquées dans l'ordre de `ts`.
3. **Aucune perte silencieuse** : tout résultat `conflict_lww` ou `clamped` crée un avis visible (`meta.sync_notices`) jusqu'à acquittement.
4. **Reprise** : après interruption, l'outbox est rejouée ; l'idempotence garantit l'absence de double application.
5. **Pull** (incrémental depuis v0.9.0) : `values.batchGet` des onglets légers en entier ; pour `Photos` (images en base64), lecture de l'en-tête et des colonnes `id, rev, updated_at, deleted`, puis des seules lignes nouvelles ou dont la révision diffère de la copie locale (repli : lecture complète si les colonnes ont été déplacées ou si plus de 40 plages sont à relire) ; `_Journal` : en-tête seul, plus la colonne `op_id` uniquement s'il y a des opérations en attente. La copie locale n'est réécrite que pour les lignes dont le contenu a changé ; une ligne distante remplace la ligne locale si `rev` distant > `rev` local **et** aucune opération en attente sur cette entité ; sinon l'opération est rejouée par-dessus.
6. **Quotas** : regroupement en `batchUpdate` ; pas plus de 1 cycle de sync / 15 s ; backoff exponentiel sur HTTP 429/5xx.
7. **Jeton expiré / 401** : arrêt de la sync, bandeau « Reconnecter », outbox intacte. **403** : écran « accès refusé ».

## Tests de contrat attendus (Vitest, fausse API Sheets)

- Deux appareils sortent chacun une bouteille de la même ligne ⇒ quantité −2.
- Même champ modifié des deux côtés ⇒ le plus récent gagne, avis créé.
- Rejeu de la même opération ⇒ aucun effet supplémentaire.
- Interruption entre modification et journal ⇒ impossible (même `batchUpdate`).
- Suppression d'un emplacement non vide ⇒ refus ou déplacement vers « Sans emplacement ».
