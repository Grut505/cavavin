---

description: "Liste des tâches — Inventaire de la cave"
---

# Tasks: Inventaire de la cave (référencer et retrouver ses bouteilles)

**Input**: `/specs/001-bottle-inventory/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md

**Tests**: inclus pour la logique métier, la synchronisation et l'import — exigés par la constitution (Workflow de développement). L'UI est vérifiée manuellement (quickstart.md).

**Organization**: tâches groupées par user story. Chaque phase de story est un incrément testable seul.

**Prérequis côté utilisateur (bloquants)** :
1. Fournir les en-têtes (ou un export CSV) de l'onglet d'origine de la feuille → débloque T033, T032 et T041 (E1).
2. Créer le projet Claude dans ton compte Claude avec les consignes de T039 et vérifier si un connecteur Google Sheets en écriture est disponible (canal 1) ; sinon le canal « JSON collé » suffit → débloque T081.
3. Créer le projet Google Cloud selon T080.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, pas de dépendance non terminée)
- **[Story]** : US0…US6 (voir spec.md)

## Path Conventions

Projet unique statique : `src/`, `tests/`, `apps-script/` à la racine du dépôt (voir plan.md).

---

## Phase 1: Setup

- [X] T001 Initialiser le projet (package.json, tsconfig.json strict, vite.config.ts) à la racine avec Vite, TypeScript, idb
- [X] T002 [P] Configurer Vitest avec fake-indexeddb dans vitest.config.ts et tests/setup.ts
- [X] T003 [P] Configurer ESLint et Prettier (eslint.config.js, .prettierrc)
- [X] T004 [P] Ajouter .env.example (VITE_GOOGLE_CLIENT_ID, VITE_SHEET_ID, VITE_LABEL_READER_URL), ignorer .env.local dans .gitignore, typer l'env dans src/env.d.ts
- [X] T005 [P] Configurer la PWA : public/manifest.webmanifest, icônes dans public/icons/, vite-plugin-pwa dans vite.config.ts (précache, mode hors-ligne)
- [X] T006 [P] Créer le workflow de déploiement GitHub Pages dans .github/workflows/deploy.yml (build + tests + déploiement)
- [X] T007 [P] Définir les jetons de design et thèmes clair/sombre dans src/ui/styles/tokens.css et src/ui/styles/base.css (palette sobre + accent bordeaux, cibles ≥ 44 px, safe-area, prefers-reduced-motion)
- [X] T008 Créer index.html, src/main.ts et le routeur par hash src/ui/router.ts avec barre de navigation basse (Cave, Liste, Ajouter, Réglages)
- [X] T080 [P] Documenter et réaliser la configuration Google Cloud (projet, client OAuth « Application Web », origines `http://localhost:5173` et GitHub Pages, écran de consentement en mode test avec les deux comptes comme utilisateurs de test, activation de l'API Sheets, avertissement « application non vérifiée » attendu) dans docs/google-cloud-setup.md

---

## Phase 2: Foundational (bloque toutes les stories)

**⚠️ CRITIQUE** : aucune story ne démarre avant la fin de cette phase.

- [X] T009 [P] Définir les types du domaine (Wine, Location, Furniture, Stock, Outflow, Photo, Op) selon data-model.md dans src/domain/types.ts
- [X] T010 [P] Implémenter la normalisation (minuscules, sans accents, espaces) et la clé d'unicité de fiche dans src/domain/normalize.ts, avec tests dans tests/unit/normalize.test.ts
- [X] T011 [P] Déclarer (dont l'onglet `Propositions`) les en-têtes d'onglets et la version de schéma (contracts/sheet-schema.md) dans src/data/schema.ts
- [X] T012 Implémenter la base locale IndexedDB (wines, locations, furniture, stocks, outflows, photos, outbox, meta) dans src/data/local-db.ts
- [X] T013 [P] Implémenter l'authentification Google Identity Services (jeton d'accès, expiration, demande de reconnexion sur geste) dans src/auth/google-auth.ts
- [X] T014 Implémenter le client API Sheets (batchGet, batchUpdate, append, création d'onglets, lecture par nom d'en-tête, mapping 401/403/429 avec backoff) dans src/data/sheets-client.ts
- [X] T015 [P] Écrire une fausse API Sheets en mémoire pour les tests de contrat dans tests/contract/fake-sheets.ts
- [X] T016 Implémenter le cœur du moteur de sync : file d'opérations, application locale optimiste, push des opérations create/patch/qty_delta/move/delete avec écriture `_Journal` dans le même batchUpdate (idempotence) dans src/data/sync-engine.ts
- [X] T017 Implémenter le pull (batchGet de tous les onglets, comparaison par `rev`, rejouage de l'outbox par-dessus) dans src/data/sync-engine.ts
- [X] T018 Écrire les tests de contrat de base (création, patch, rejeu idempotent, pull) dans tests/contract/sync-basic.test.ts
- [X] T019 Implémenter la couche dépôt (lecture réactive, abonnements UI, opérations métier qui enfilent des ops) dans src/data/repository.ts
- [X] T020 Implémenter l'initialisation de la feuille (création des onglets manquants, en-têtes, `schema_version`, refus si version supérieure) dans src/data/init-sheet.ts
- [X] T021 Créer l'écran de connexion et d'initialisation (« Se connecter avec Google », « Initialiser ma cave », états chargement/erreur) dans src/ui/views/sign-in.ts

**Checkpoint** : connexion, lecture/écriture de la feuille et outbox fonctionnels.

---

## Phase 3: User Story 0 — Configurer ma cave (P1)

**Goal** : décrire la cave (meubles, étagères, lieux) avec un schéma visuel.

**Independent Test** : créer un meuble de 5 étagères et une pièce « Cellier », ajouter une étagère, supprimer une étagère vide ; le schéma suit chaque changement ; supprimer une étagère non vide exige déplacement/confirmation.

### Tests

- [X] T022 [P] [US0] Tests des règles d'emplacements (unicité des noms, refus de suppression non vide, déplacement vers « Sans emplacement ») dans tests/unit/locations.test.ts

### Implementation

- [X] T023 [US0] Implémenter les règles métier (créer meuble avec N étagères, ajouter/supprimer étagère, créer lieu, suppression gardée) dans src/domain/locations.ts
- [X] T024 [US0] Exposer les opérations cave dans src/data/repository.ts (createFurniture, addShelf, removeShelf, createPlace, deleteLocation)
- [X] T025 [P] [US0] Composant schéma SVG des meubles/étagères (étagères tactiles ≥ 44 px, compteur de bouteilles, sélection) dans src/ui/cave-map/cave-map.ts et src/ui/cave-map/cave-map.css
- [X] T026 [US0] Écran de configuration de la cave (créer/renommer/supprimer meuble, étagères, lieux, état vide) dans src/ui/views/cave-config.ts
- [X] T027 [US0] Dialogue de suppression d'un emplacement non vide (déplacer ou confirmer) dans src/ui/components/delete-location-dialog.ts
- [X] T028 [US0] Vue d'une étagère listant ses bouteilles (touch dans le schéma) dans src/ui/views/shelf-detail.ts

**Checkpoint** : la cave se configure et se visualise.

---

## Phase 4: User Story 1 — Référencer une bouteille (P1) 🎯 MVP avec US0 et US2

**Goal** : à partir d'une proposition du projet Claude (feuille ou JSON collé) ou d'une saisie manuelle, choisir l'emplacement et valider ; import des lignes existantes ; compléter une fiche existante.

**Independent Test** : coller un JSON de proposition, choisir une étagère, valider ; la fiche apparaît dans la feuille avec ses stocks. Une proposition sur une fiche existante propose « ajouter » / « compléter ».

### Tests

- [X] T029 [P] [US1] Tests de validation de fiche (millésime, fenêtre de garde, prix, note, formats) dans tests/unit/wine-validation.test.ts
- [X] T030 [P] [US1] Tests de détection de doublons (clé normalisée, non millésimé) dans tests/unit/duplicates.test.ts
- [X] T031 [P] [US1] Tests de rapprochement d'une proposition (propose seulement champs vides/différents, n'écrase jamais) et d'analyse du JSON collé (objet, tableau, texte autour, bloc ```json, champ invalide ignoré avec avertissement) dans tests/unit/reconcile.test.ts et tests/unit/proposal-parse.test.ts
- [~] T032 (ABANDONNÉE : pas d'import, la cave est ressaisie) [P] [US1] Tests d'import de l'onglet d'origine (champs manquants, `needs_review`, ré-exécution sans doublon, aucune écriture dans l'onglet d'origine) dans tests/contract/legacy-import.test.ts

### Implementation

- [~] T033 (ABANDONNÉE : pas d'import, la cave est ressaisie) [US1] **À FAIRE EN PREMIER DE LA PHASE 4 — bloquant import, nécessite l'export fourni par l'utilisateur (E1)** : relever les en-têtes réels de l'onglet d'origine (export CSV fourni par l'utilisateur) et compléter la table de correspondance dans specs/001-bottle-inventory/contracts/sheet-schema.md, avec un échantillon anonymisé dans tests/fixtures/legacy-sample.csv
- [X] T034 [P] [US1] Implémenter validation et construction de fiche (champs facultatifs FR-002a, euros/jj-mm-aaaa FR-002b) dans src/domain/wine.ts
- [X] T035 [P] [US1] Implémenter la détection de doublons dans src/domain/duplicates.ts
- [X] T036 [P] [US1] Génération de la miniature depuis une photo (~240 px, JPEG q0,6) dans src/scan/image.ts
- [X] T037 [P] [US1] Analyse et validation d'une proposition (contracts/label-proposal.md : JSON collé tolérant, objet ou tableau, normalisation, avertissements) dans src/scan/proposal.ts
- [X] T038 [US1] Implémenter le rapprochement proposition/fiche existante (FR-001a, FR-004a) dans src/scan/reconcile.ts
- [X] T039 [P] [US1] Rédiger le projet Claude : claude-project/INSTRUCTIONS.md (lire l'étiquette, produire une proposition au format contracts/label-proposal.md, ne jamais inventer un champ, proposer les mises à jour de fiches existantes via `target_wine_id`, ajouter uniquement des lignes à l'onglet `Propositions` si le connecteur le permet) et claude-project/README.md (création du projet dans le compte Claude, canaux 1 et 2)
- [ ] T081 [US1] Évaluer SC-002 : protocole manuel dans tests/eval/README.md et grille de résultats dans tests/eval/labels.md — passer environ 20 étiquettes réelles dans le projet Claude (T039), comparer à la vérité terrain (domaine + millésime corrects, cible ≥ 70 %), et corriger les consignes si besoin
- [X] T040 [US1] Stockage des miniatures (onglet `Photos` segmenté, cache IndexedDB, chargement paresseux) dans src/data/photos.ts
- [~] T041 (ABANDONNÉE : pas d'import, la cave est ressaisie) [US1] Implémenter l'import de l'onglet d'origine (FR-004b, `legacy_ref`, emplacements `legacy` à rattacher) dans src/data/legacy-import.ts, et le brancher sur le flux « Initialiser ma cave » de src/ui/views/sign-in.ts (import exécuté une fois après la création des onglets, avec résumé : N fiches importées, M à compléter)
- [X] T042 [US1] Opérations dépôt : addWine, addStock, completeWine (sans changer la quantité) dans src/data/repository.ts
- [X] T043 [US1] Écran d'ajout : prise de photo, formulaire pré-rempli modifiable, champs facultatifs repliés, sélecteur d'emplacement via le schéma de cave, quantité par emplacement, indication de position facultative sur l'étagère (gauche/droite, dessus/dessous — FR-003c, jamais obligatoire), saisie manuelle, caméra refusée dans src/ui/views/add-wine.ts
- [X] T044 [US1] Dialogue de doublon « ajouter une bouteille » / « compléter la fiche existante » dans src/ui/components/duplicate-dialog.ts
- [X] T082 [US1] Lire l'onglet `Propositions` à la synchronisation et exposer les propositions en attente via le dépôt dans src/data/repository.ts et src/data/sync-engine.ts (opérations `proposal_accept` / `proposal_dismiss` du contrat sync-operations.md)
- [X] T084 [US1] Prompt autonome de lecture d'étiquette (src/scan/prompt.ts, claude-project/PROMPT.md, bouton « Copier le prompt pour Claude » dans l'écran Ajouter et dans « Coller depuis Claude ») et ses tests dans tests/unit/prompt.test.ts
- [X] T085 [US1] Tanin (rouges), sucre (autres) et estimation de la fenêtre de garde par le projet Claude : champs `tannin`, `dryness` (fiche, propositions, formulaire, cartes), prompt, migration de schéma v2 automatique à la synchronisation
- [X] T086 [US1] Fenêtre de garde dans la partie principale de la fiche et obligatoire (validation, formulaire, tests) ; libellé « Sucre (autres) »
- [X] T087 [US1] Cadeau : champs `gift`, `gift_from`, entité `Person` (onglet `Personnes`, schéma v3, base locale v2), liste paramétrable Réglages › Personnes (src/ui/views/personnes.ts, src/domain/people.ts), ajout à la volée dans la fiche, affichage « Offert par … » sur les cartes
- [X] T088 [US1] Champs obligatoires réduits à cuvée, millésime (année ou NV), appellation, couleur, format ; domaine et fenêtre de garde facultatifs ; affichage de secours quand le domaine est vide (`wineTitle`)
- [X] T089 [US1] Effacement de l'erreur d'un champ dès la saisie ; interrupteur « Cadeau » (éteint par défaut) ; étoiles sur les champs obligatoires
- [X] T090 [US1] Autocomplétion millésime/appellation/région/pays alimentée par la cave, graphies de référence, confirmation des valeurs proches, région/pays d'une appellation connue (src/domain/vocabulary.ts, src/ui/components/similar-dialog.ts) et leurs tests
- [X] T091 [US4] « Ajouter des bouteilles » à une fiche existante depuis la fiche détaillée (src/ui/components/add-stock-dialog.ts) ; schéma de la cave limité aux meubles de la fiche, emplacements en évidence ; liens depuis la liste et les étagères vers la fiche
- [X] T092 [US5] Avis regroupés par fiche et par type pour une même synchronisation (« N opérations concernées »), acquittement individuel ou en bloc, pastille d'état et lien « avis » dans l'en-tête de chaque écran, état de synchronisation en direct dans Réglages
- [X] T083 [US1] Écran « Propositions à ranger » (liste des propositions du projet Claude, bouton « Coller depuis Claude », choix de l'emplacement et de la quantité, valider/écarter, miniature facultative via l'appareil photo) dans src/ui/views/proposals.ts
- [~] T045 (ABANDONNÉE : pas d'import, la cave est ressaisie) [US1] Écran de rattachement des emplacements importés (`legacy` → étagère/lieu) et file « à compléter » dans src/ui/views/legacy-review.ts

**Checkpoint** : on peut référencer et importer ; le cœur du produit existe.

---

## Phase 5: User Story 2 — Parcourir et filtrer (P1)

**Goal** : liste triable et filtrable.

**Independent Test** : avec quelques fiches, changer le tri puis appliquer des filtres ; résultat immédiat, compteur, état vide avec réinitialisation.

- [X] T046 [P] [US2] Tests tri/filtre (tous les critères FR-007/FR-008, combinaisons, réinitialisation) dans tests/unit/query.test.ts
- [X] T047 [P] [US2] Test de performance tri/filtre/recherche sur 500 fiches (< 100 ms) dans tests/unit/query-perf.test.ts
- [X] T048 [US2] Implémenter tri et filtres dans src/domain/query.ts
- [X] T049 [P] [US2] Composant carte de fiche (domaine, cuvée, millésime, couleur, quantité, miniature) dans src/ui/components/wine-card.ts
- [X] T050 [US2] Écran liste avec tri, feuille de filtres, compteur de résultats, état vide « réinitialiser » et squelette de chargement dans src/ui/views/wine-list.ts

---

## Phase 6: User Story 3 — Rechercher et localiser (P2)

**Goal** : recherche texte et fiche détaillée avec emplacement.

**Independent Test** : saisir un terme présent ; la bouteille apparaît avec son emplacement mis en évidence.

- [X] T051 [P] [US3] Tests de recherche (accents, casse, champs indexés, tri par pertinence) dans tests/unit/search.test.ts
- [X] T052 [US3] Implémenter l'index et la recherche dans src/domain/search.ts
- [X] T053 [US3] Ajouter la barre de recherche en direct à src/ui/views/wine-list.ts
- [X] T054 [US3] Écran fiche détaillée (tous les champs, miniature, emplacements en évidence dans le schéma) dans src/ui/views/wine-detail.ts

---

## Phase 7: User Story 4 — Cycle de vie (P2)

**Goal** : modifier, déplacer, sortir une bouteille avec motif ; historique.

**Independent Test** : sortir une bouteille ; quantité −1, sortie enregistrée avec motif ; à 0 la fiche passe en historique.

- [X] T055 [P] [US4] Tests des sorties (décrément par emplacement, motif par défaut, passage en historique, ré-ajout réactive) dans tests/unit/outflow.test.ts
- [X] T056 [P] [US4] Tests de déplacement (fusion avec stock existant, quantité partielle) dans tests/unit/move.test.ts
- [X] T057 [US4] Implémenter sorties et déplacements dans src/domain/stock.ts
- [X] T058 [US4] Opérations dépôt : updateWine, moveStock, recordOutflow dans src/data/repository.ts
- [X] T059 [US4] Formulaire de modification de fiche (dont l'indication de position facultative par stock, FR-003c) dans src/ui/views/edit-wine.ts
- [X] T060 [US4] Dialogue « Sortir une bouteille » (emplacement, motif, note, date) dans src/ui/components/outflow-dialog.ts
- [X] T061 [US4] Dialogue de déplacement via le schéma de cave dans src/ui/components/move-dialog.ts
- [X] T062 [US4] Écran historique des sorties dans src/ui/views/history.ts

---

## Phase 8: User Story 5 — Hors-ligne et synchronisation (P2)

**Goal** : tout fonctionne hors-ligne, synchro automatique, fusion sans perte.

**Independent Test** : mode avion, ajouter une bouteille, rétablir le réseau ; présente dans la feuille. Deux sorties concurrentes ⇒ −2.

- [X] T063 [P] [US5] Tests de contrat des conflits (deltas concurrents −2, LWW avec avis, plancher 0 avec avertissement, reprise après interruption) dans tests/contract/sync-conflicts.test.ts
- [X] T064 [US5] Implémenter la fusion `qty_delta`, `patch` LWW et les avis (`sync_notices`) dans src/data/sync-engine.ts
- [X] T065 [US5] Miniatures et fiches saisies hors-ligne : conservées en local (entités `photo` + rattachement `thumb_ref` rejoués comme toute opération, sans type d'opération dédié) et envoyées au retour du réseau, vérifié dans tests/contract/offline.test.ts
- [X] T066 [US5] Ordonnanceur de sync (au retour réseau, à l'ouverture, toutes les 15 s min, backoff 429/5xx) dans src/data/sync-scheduler.ts
- [X] T067 [US5] Composant d'état de sync (à jour / en attente (n) / hors-ligne, dernière synchro) dans src/ui/components/sync-status.ts
- [X] T068 [US5] Écran des avis de synchronisation (champ remplacé, quantité plafonnée) avec acquittement dans src/ui/views/sync-notices.ts
- [X] T069 [US5] Démarrage hors-ligne : configuration du Service Worker isolée dans src/sw-config.ts (pré-cache complet, repli `index.html`, aucun cache des appels Google), écran d'ouverture `initialHash`, et reprise des modifications faites directement dans la feuille (tests/unit/pwa-config.test.ts, tests/contract/sync-manual-edit.test.ts)

---

## Phase 9: User Story 6 — Accès privé (P3)

**Goal** : seuls les deux comptes accèdent aux données.

**Independent Test** : un compte non partagé obtient « accès refusé » sans donnée ; un compte autorisé reste utilisable sans reconnexion quotidienne.

- [X] T070 [P] [US6] Tests de gestion d'erreurs d'accès (403 ⇒ aucun cache affiché, 401 ⇒ bandeau reconnexion, outbox intacte) dans tests/contract/auth-errors.test.ts
- [X] T071 [US6] Écran « accès refusé » et purge du cache local si le compte n'est pas autorisé dans src/ui/views/access-denied.ts et src/data/local-db.ts
- [X] T072 [US6] Bandeau « Reconnecter » (un tap) et reprise de sync après reconnexion dans src/ui/components/reconnect-banner.ts
- [X] T073 [US6] Mémoriser le compte et tenter le renouvellement silencieux du jeton à l'ouverture dans src/auth/google-auth.ts

---

## Phase 10: Polish & transversal

- [X] T074 [P] Audit accessibilité (contraste AA, focus visible, libellés ARIA, tailles tactiles) sur tous les écrans dans src/ui/
- [X] T075 [P] Finitions design : mode sombre, états vide/chargement/erreur, transitions discrètes dans src/ui/styles/
- [X] T076 [P] Rédiger README.md (installation, variables d'environnement, déploiement GitHub Pages, mise en place du projet Claude (claude-project/README.md), ajout de colonnes à la feuille)
- [ ] T077 Test de charge sur 500–1000 fiches (sync incrémentale, rendu de la liste) et mesure du premier affichage < 2 s en 4G simulée (Lighthouse/DevTools, mode installé) avec correctifs, résultats consignés dans specs/001-bottle-inventory/quickstart.md §8
- [ ] T078 Exécuter le parcours complet de specs/001-bottle-inventory/quickstart.md sur iPhone 16 et consigner le résultat du renouvellement de jeton (research.md §3)
- [X] T079 Revue de conformité à la constitution (secrets, schéma documenté, dépendances) et mise à jour de specs/001-bottle-inventory/plan.md si nécessaire

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → stories.
- **US0** dépend de la Foundational seule.
- **US1** dépend de US0 (sélecteur d'emplacement) ; T033 (en-têtes réels, à faire en premier) bloque T041 et T032 ; T039 (consignes du projet Claude) bloque T081 (évaluation SC-002) ; T080 (Google Cloud) conditionne la connexion réelle dès T013.
- **US2** dépend de la Foundational ; testable avec des fiches créées par US1 (ou fixtures).
- **US3** dépend de US2 (même écran) ; **US4** dépend de US1 ; **US5** étend le moteur de sync (T016/T017) ; **US6** étend l'authentification (T013).
- Ordre conseillé : US0 → US1 → US2 → US4 → US3 → US5 → US6 → Polish.

### Opportunités de parallélisme

- Setup : T002–T007 en parallèle après T001.
- Foundational : T009, T010, T011, T013, T015 en parallèle.
- US1 : tests T029–T032 ensemble ; T034, T035, T036, T037, T039 ensemble (fichiers distincts).
- US0 : T022 et T025 en parallèle.
- Les stories US2, US3 et US5 peuvent avancer en parallèle une fois la Foundational et US1 terminées.

## Implementation Strategy

- **MVP** : Setup + Foundational + US0 + US1 + US2 (les trois stories P1) : on configure la cave, on référence des bouteilles, on les parcourt.
- **Incréments** : +US4 (garder le stock juste), +US3 (recherche et fiche), +US5 (hors-ligne complet et conflits), +US6 (durcissement de l'accès), puis Polish.
- Valider chaque checkpoint avec les scénarios correspondants de quickstart.md avant de passer à la story suivante.
