# Implementation Plan: Accueil — à boire, statistiques et cadeaux par personne

**Spec**: [spec.md](./spec.md) · **Base technique** : identique à [001](../001-bottle-inventory/plan.md) (TypeScript + Vite, sans framework UI, IndexedDB + Google Sheets).

## Approche

Aucune nouvelle donnée, aucune colonne ni onglet : tout est dérivé de `wine`, `stock`, `outflow`, `person` (constitution IV respectée). La logique est dans `src/domain/` (pure, testée sans navigateur) ; l'UI reste fine.

| Sujet | Module | Remarque |
|---|---|---|
| Maturité (FR-002/003) | `src/domain/maturity.ts` | `classify(wine, année)` → catégorie + « à finir » ; regroupement et tri par urgence |
| Statistiques (FR-005 à 008) | `src/domain/stats.ts` | répartitions, valeur (prix × quantité), consommation 12 mois (1 sortie = 1 bouteille) |
| Cadeaux (FR-013/014) | `src/domain/gifts.ts`, `Filters.giftFrom` dans `query.ts` | filtre « Offert par » persistant avec les autres filtres de la Liste |
| Prompt d'occasion (FR-009 à 012) | `src/domain/occasion.ts` | 60 bouteilles max, urgentes d'abord, troncature signalée ; copie presse-papiers avec repli |
| Écrans | `src/ui/views/home.ts`, `person.ts` | routes `/accueil` (onglet, écran d'ouverture) et `/personne/:id` |
| Navigation (FR-001) | `src/main.ts`, `icons.ts` | 5 onglets |

## Décisions

- Barres de statistiques en HTML/CSS (aucune bibliothèque de graphiques) : lisibles par lecteur d'écran via `aria-label` et valeurs textuelles (FR-016).
- « À boire » : 10 fiches par groupe, puis « Afficher les n restantes » ; groupes « En retard » et « À boire maintenant » ouverts par défaut.
- Le prompt n'est jamais stocké ; la réponse de Claude n'est pas importée.

## Complexity Tracking

Aucune violation : pas de dépendance ajoutée, pas de nouveau stockage.
