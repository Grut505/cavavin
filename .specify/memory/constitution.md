<!--
Sync Impact Report
- Version change: (template, non ratifiée) → 1.0.0
- Principes modifiés : aucun renommage (première rédaction) ; 5 principes définis
- Sections ajoutées : Contraintes techniques, Workflow de développement, Governance
- Sections supprimées : aucune
- Templates :
  - ✅ .specify/templates/plan-template.md (gates de la Constitution Check renseignés)
  - ✅ .specify/templates/spec-template.md (aucun changement requis)
  - ✅ .specify/templates/tasks-template.md (aucun changement requis)
  - ✅ .specify/templates/checklist-template.md (aucun changement requis)
- TODO différés :
  - TODO(SHEET_SCHEMA): structure exacte de la Google Sheet non relue (accès non vérifié) ;
    à documenter dans la première spec.
  - TODO(STACK): choix framework/outillage (vanilla JS vs. framework léger) laissé au plan.
-->
# Cavavin Constitution

## Core Principles

### I. Simplicité d'abord (NON-NEGOTIABLE)
Cavavin est une petite application web personnelle. Toute fonctionnalité MUST répondre à un
besoin réel de gestion de cave ; le YAGNI s'applique. Pas de backend maison, pas de base de
données dédiée, pas de dépendance lourde sans justification écrite dans la section
« Complexity Tracking » du plan. Préférer HTML/CSS/JS standards et un nombre minimal de
dépendances.
*Rationale : un seul développeur, deux utilisateurs ; la maintenance doit rester triviale.*

### II. Mobile-first, iPhone 16 minimum
L'interface MUST être conçue d'abord pour iPhone 16 (Safari iOS), utilisable à une main,
avec des zones tactiles ≥ 44 px. Elle MUST être installable en PWA (manifest, icône,
ajout à l'écran d'accueil). Le desktop est supporté mais jamais prioritaire.
*Rationale : usage principal à la cave, téléphone en main.*

### III. Offline-first
Les données MUST être mises en cache localement (Service Worker + IndexedDB/localStorage)
afin que la consultation, la recherche et les suggestions fonctionnent sans réseau. Les
modifications faites hors-ligne MUST être mises en file d'attente et synchronisées avec la
Google Sheet au retour du réseau, avec une stratégie de conflit explicite (documentée dans
le plan) et sans perte silencieuse de données.
*Rationale : une cave a souvent une mauvaise couverture réseau.*

### IV. Google Sheet = source de vérité
Toutes les données persistantes (bouteilles, emplacements, historique, rappels de rachat)
MUST vivre dans la Google Sheet du projet. L'ajout de colonnes est autorisé ; il MUST être
documenté (nom, type, sémantique) dans la spec ou le plan concerné, et ne MUST PAS casser
les colonnes existantes. Le cache local n'est qu'une copie ; aucune donnée ne MUST exister
uniquement dans le navigateur de façon durable.
*Rationale : choix produit — la feuille est lisible, éditable et sauvegardée par Google.*

### V. Accès privé et sobriété des données
L'accès est réservé à l'utilisateur et, potentiellement, à son épouse. Aucun secret
(clé de service, jeton privé) MUST être commité dans le dépôt public ; l'authentification
MUST passer par un mécanisme Google (OAuth/compte autorisé) limité aux comptes
autorisés. Aucune analytique tierce, aucun traçage.
*Rationale : une page GitHub Pages est publique ; seules les données doivent être privées.*

## Contraintes techniques et produit

- **Hébergement** : site statique (GitHub Pages) ; un raccourci/PWA sur l'écran d'accueil
  suffit. Le packaging natif est hors priorité.
- **Fonctions cibles** : scan d'étiquettes + saisie de l'emplacement en cave ; recherche ;
  liste avec tri et filtres ; top des bouteilles à boire ; suggestion de bouteille selon un
  plat (**cuisine strictement végétarienne** : aucune suggestion ni accord ne MUST
  mentionner viande ou poisson) ; statistiques avec visualisations ; rappels de rachat.
- **Design** : sobre et professionnel mais marquant — palette restreinte, typographie
  soignée, espacements généreux, mode sombre pris en charge, animations discrètes,
  états vides/chargement/erreur soignés. Contraste conforme WCAG AA.
- **Performance** : premier affichage < 2 s sur iPhone 16 en 4G ; interactions < 100 ms
  sur données en cache.
- **Langue** : interface en français.

## Workflow de développement

- Le flux Spec Kit s'applique : spec → plan → tasks → implement ; la Constitution Check du
  plan MUST passer avant la recherche et après la conception.
- Chaque fonctionnalité MUST être testable de façon indépendante (user stories priorisées).
- Tests : la logique métier (parsing de la sheet, tri/filtre, calcul de fenêtre de
  consommation, file de synchronisation) MUST avoir des tests automatisés ; l'UI est
  vérifiée manuellement sur iPhone ou émulation Safari mobile avant chaque mise en ligne.
- Les changements du format de la Google Sheet MUST être rétro-compatibles ou accompagnés
  d'une étape de migration documentée.
- Commits atomiques, messages clairs ; la branche `main` est toujours déployable.

## Governance

Cette constitution prévaut sur les autres pratiques du projet. Un amendement MUST être
documenté (motif, impact) et reflété dans le Sync Impact Report ainsi que dans les
templates dépendants. Versionnage sémantique : MAJOR pour la suppression ou la
redéfinition incompatible d'un principe, MINOR pour l'ajout d'un principe/section ou un
élargissement notable, PATCH pour les clarifications. Toute spec, plan et revue MUST
vérifier la conformité ; toute complexité additionnelle MUST être justifiée dans le plan.
Les directives de développement courantes sont dans `CLAUDE.md` et le plan en cours.

**Version**: 1.0.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-01
