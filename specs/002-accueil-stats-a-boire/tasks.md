# Tasks: Accueil — à boire, statistiques et cadeaux par personne

- [X] T001 [US1] `src/domain/maturity.ts` + tests (catégories, « à finir », tri, fenêtre) — `tests/unit/home-domain.test.ts`
- [X] T002 [US3] `src/domain/stats.ts` + tests (répartition, valeur, consommation 12 mois)
- [X] T003 [US2] `src/domain/gifts.ts` + filtre `giftFrom` (`query.ts`, `wine-list.ts`, `filter-sheet.ts`) + tests
- [X] T004 [US4] ~~prompt d'occasion~~ remplacé par la recherche par mets : `src/domain/pairing.ts` (recherche tolérante) + `pairing-list.ts` + tests (`tests/unit/pairing.test.ts`)
- [X] T005 [US1] [US3] [US4] Écran Accueil `src/ui/views/home.ts` (+ `home.css`) + tests `tests/unit/home-ui.test.ts`
- [X] T006 [US2] Fiche personne `src/ui/views/person.ts`, lien depuis Réglages > Personnes
- [X] T007 Navigation 5 onglets, icône, route d'ouverture `/accueil` (`main.ts`, `app.ts`, `sign-in.ts`)
- [X] T008 [US4] Champ `pairings` : types, schéma v4 + migration (`tests/contract/schema-v4.test.ts`), formulaire, fiche détaillée, proposition/rapprochement, prompts `claude-project/` et `src/scan/prompt.ts`, contrats
- [X] T010 [US5] « Compléter les mets » : `pairing-backfill.ts`, vue `pairings-backfill.ts` (`/mets`), liens Réglages et Accueil, tests `tests/unit/extras.test.ts`
- [X] T011 [US6] « Je la bois » depuis l'Accueil : `quick-outflow.ts`
- [X] T012 [US7] « À racheter » : `rebuy.ts` + bloc Accueil
- [X] T013 Filtre « Offert par » périmé retiré automatiquement (`wine-list.ts`)
- [X] T014 [US1] Liste « À boire » à grande échelle (50+ fiches) : pagination, sous-titres « À finir/À point », filtre couleur, tri expliqué et mémorisé ; pagination des résultats « Quoi boire ce soir » (FR-021)
- [X] T015 [US3] Statistiques cliquables → Liste préfiltrée : filtres Appellation et Maturité, `stats-filter.ts`, lignes en boutons (FR-022), tests `tests/unit/stats-to-list.test.ts`
- [ ] T009 Vérification sur iPhone : 5 onglets lisibles à une main, Accueil < 1 s avec 1000 fiches, copie du prompt dans Safari (SC-005 à SC-007)
