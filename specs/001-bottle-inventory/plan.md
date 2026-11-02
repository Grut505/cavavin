# Implementation Plan: Inventaire de la cave

**Branch**: `001-bottle-inventory` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-bottle-inventory/spec.md`

## Summary

PWA statique (TypeScript + Vite, sans framework UI) hébergée sur GitHub Pages. Les données
vivent dans la Google Sheet de l'utilisateur, lue et écrite directement depuis le navigateur
via l'API Google Sheets avec une connexion Google (compte autorisé = compte avec lequel la
feuille est partagée). Une copie locale (IndexedDB) rend l'application utilisable hors-ligne ;
les modifications sont mises en file (outbox) puis synchronisées avec fusion par opérations
(deltas de quantité cumulés, dernier-écrit-gagne pour les autres champs). La lecture
d'étiquette est assurée hors de l'application par un projet Claude du compte Claude de
l'utilisateur (propositions déposées dans la feuille ou JSON collé, validées par l'utilisateur) :
aucune clé d'API, aucun relais. Voir [research.md](research.md) pour les décisions.

## Technical Context

**Language/Version**: TypeScript 5.x, ES2022, cible Safari iOS 18 (iPhone 16)

**Primary Dependencies**: Vite, vite-plugin-pwa (Workbox), idb (wrapper IndexedDB), Google Identity Services (script officiel) ; dev : Vitest, fake-indexeddb. Aucun framework UI.

**Storage**: Google Sheets (source de vérité, onglets dédiés) ; IndexedDB (copie locale + outbox + miniatures)

**Testing**: Vitest (unitaires + contrats de synchronisation avec une fausse API Sheets) ; vérification manuelle sur iPhone (quickstart.md)

**Target Platform**: Safari iOS 18+ installé en PWA ; desktop au mieux

**Project Type**: web (application statique, aucun backend ni relais) ; un projet Claude externe (consignes versionnées dans `claude-project/`)

**Performance Goals**: premier affichage < 2 s en 4G ; filtre/tri/recherche < 100 ms sur 500 fiches (en mémoire) ; synchronisation incrémentale < 5 s

**Constraints**: offline-first ; aucun secret commité ; zones tactiles ≥ 44 px ; WCAG AA ; mode sombre ; quota API Sheets (60 req/min/utilisateur) → requêtes groupées (batchGet/batchUpdate)

**Scale/Scope**: 2 utilisateurs, ≤ 1 000 fiches, ≤ 50 emplacements, ~15 écrans

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Simplicité : pas de backend ni BDD maison ; dépendances minimales et justifiées (exception : vite-plugin-pwa, voir Complexity Tracking)
- [x] Mobile-first : conçu pour iPhone 16, zones tactiles ≥ 44 px, PWA installable
- [x] Offline-first : cache local, file d'attente de sync, stratégie de conflit décrite (research.md §5, contracts/sync-operations.md)
- [x] Google Sheet = source de vérité : nouvelles colonnes documentées (contracts/sheet-schema.md), rétro-compatibles (onglet d'origine jamais modifié)
- [x] Accès privé : aucun secret commité (client ID OAuth public par nature ; aucune clé d'IA dans l'application), auth Google limitée aux comptes autorisés
- [x] Végétarien : sans objet pour cette fonctionnalité (accords hors périmètre)
- [x] Design sobre/pro, WCAG AA, mode sombre, états vide/chargement/erreur (jetons de design définis à l'implémentation)

**Re-check post-conception** : toutes les cases restent satisfaites. Plus aucune exception de simplicité liée à la lecture d'étiquette (relais supprimé). Risque principal résiduel : renouvellement silencieux du jeton Google dans une PWA iOS (research.md §3) — atténué par le mode hors-ligne et une reconnexion en un geste.

## Project Structure

### Documentation (this feature)

```text
specs/001-bottle-inventory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── sheet-schema.md
│   ├── sync-operations.md
│   └── label-proposal.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
index.html
vite.config.ts
public/                      # manifest, icônes
src/
├── main.ts                  # amorçage, routeur
├── ui/                      # écrans et composants (cave, liste, fiche, ajout, réglages)
│   ├── cave-map/            # schéma SVG des meubles/étagères
│   └── styles/              # jetons de design, thèmes clair/sombre
├── domain/                  # logique pure testable : fiches, stocks, emplacements,
│                            # sorties, recherche/tri/filtre, doublons
├── data/
│   ├── local-db.ts          # IndexedDB (wines, locations, stocks, outflows, thumbs, outbox)
│   ├── sheets-client.ts     # appels API Sheets (batchGet/batchUpdate/append)
│   ├── sync-engine.ts       # pull/push, fusion, journal
│   ├── schema.ts            # en-têtes d'onglets, migrations de schéma
│   └── legacy-import.ts     # import de l'onglet d'origine
├── auth/google-auth.ts      # Google Identity Services (jeton d'accès)
└── scan/                    # miniature photo, analyse des propositions (JSON collé / onglet), rapprochement
claude-project/              # consignes du projet Claude (INSTRUCTIONS.md, README de mise en place)
tests/
├── unit/
└── contract/                # sync-engine contre une fausse API Sheets
.github/workflows/deploy.yml # build + déploiement GitHub Pages
```

**Structure Decision**: un seul projet statique. La logique métier (`domain/`) est sans dépendance navigateur pour être testée à 100 % en Vitest ; `data/` isole tout accès réseau/stockage ; `ui/` reste fin.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| vite-plugin-pwa | Service Worker + précache fiables sur Safari iOS sans écrire Workbox à la main | SW écrit à la main : bugs de cache probables, maintenance accrue |
