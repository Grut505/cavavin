# Implementation Plan: Accueil — à boire, statistiques et cadeaux par personne

**Spec**: [spec.md](./spec.md) · **Base technique** : identique à [001](../001-bottle-inventory/plan.md) (TypeScript + Vite, sans framework UI, IndexedDB + Google Sheets).

## Approche

Une seule nouvelle donnée : la colonne `pairings` (schéma v4, migration automatique) ; tout le reste est dérivé de `wine`, `stock`, `outflow`, `person` (constitution IV respectée : colonne documentée dans `contracts/sheet-schema.md`). La logique est dans `src/domain/` (pure, testée sans navigateur) ; l'UI reste fine.

| Sujet | Module | Remarque |
|---|---|---|
| Maturité (FR-002/003) | `src/domain/maturity.ts` | `classify(wine, année)` → catégorie + « à finir » ; regroupement et tri par urgence |
| Statistiques (FR-005 à 008) | `src/domain/stats.ts` | répartitions, valeur (prix × quantité), consommation 12 mois (1 sortie = 1 bouteille) |
| Cadeaux (FR-013/014) | `src/domain/gifts.ts`, `Filters.giftFrom` dans `query.ts` | filtre « Offert par » persistant avec les autres filtres de la Liste |
| Mets conseillés (FR-009/010) | `pairing-list.ts`, `Wine.pairings`, schéma v4, `scan/prompt.ts`, `claude-project/` | colonne texte `pairings` (`a; b`), estimée par Claude à la lecture d'étiquette |
| Quoi boire ce soir (FR-011 à 012b) | `src/domain/pairing.ts` | recherche locale : mots significatifs, singulier approximatif, distance de Damerau-Levenshtein (1 faute jusqu'à 7 lettres, 2 au-delà), préfixes, ≥ 50 % des mots ; tri couverture → maturité → score |
| Écrans | `src/ui/views/home.ts`, `person.ts` | routes `/accueil` (onglet, écran d'ouverture) et `/personne/:id` |
| Navigation (FR-001) | `src/main.ts`, `icons.ts` | 5 onglets |

## Décisions

- Barres de statistiques en HTML/CSS (aucune bibliothèque de graphiques) : lisibles par lecteur d'écran via `aria-label` et valeurs textuelles (FR-016).
- « À boire » : 10 fiches par groupe, puis « Afficher les n restantes » ; groupes « En retard » et « À boire maintenant » ouverts par défaut.
- Aucun appel d'IA côté application : Claude renseigne les mets à l'ajout de la bouteille, la recherche est purement locale.

## Complexity Tracking

Aucune violation : pas de dépendance ajoutée, pas de nouveau stockage.
