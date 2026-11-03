# Feature Specification: Accès renforcé — adresses autorisées et verrou Face ID

**Feature Branch**: `003-acces-renforce`

**Created**: 2026-11-02

**Status**: Delivered (vérification iPhone en attente)

**Input**: User description: « Seuls moi et ma femme doivent pouvoir se connecter » ; liste d'adresses autorisées en plus du partage de la feuille ; verrou Face ID (web).

> Complète [001 US6 « Accès privé »](../001-bottle-inventory/spec.md). Le contrôle des **données** reste le partage de la feuille Google ; cette fonctionnalité ajoute de la défense en profondeur côté application et un verrou local.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seuls les comptes de la liste se connectent (Priority: P1)

Une liste d'adresses Google autorisées est configurée au déploiement. Un compte absent de la liste est refusé dès la connexion, même si la feuille lui était partagée par erreur.

**Independent Test**: avec une liste « moi, elle », la connexion d'un troisième compte affiche « compte non autorisé », ferme la session et n'affiche aucune donnée.

**Acceptance Scenarios**:

1. **Given** une liste configurée, **When** un compte absent de la liste se connecte, **Then** la session est fermée, l'adresse refusée est indiquée et aucune donnée n'est chargée.
2. **Given** une liste configurée, **When** un compte listé se connecte (casse de l'adresse ignorée), **Then** la connexion se poursuit normalement.
3. **Given** une liste modifiée entre-temps, **When** l'application s'ouvre avec la session d'un compte désormais absent, **Then** la session est fermée et l'écran « Accès refusé » s'affiche ; le cache local est effacé s'il n'y a aucune modification non synchronisée, sinon conservé masqué.
4. **Given** aucune liste configurée, **When** n'importe quel compte autorisé par la feuille se connecte, **Then** aucun contrôle supplémentaire n'est appliqué.
5. **Given** une liste configurée et une adresse impossible à vérifier, **When** l'utilisateur se connecte, **Then** l'accès est refusé avec le message « Impossible de vérifier le compte Google ».

### User Story 2 - Verrou Face ID (Priority: P2)

Dans Réglages, l'utilisateur active un verrou : Face ID (ou Touch ID, ou le code de l'appareil) est demandé à l'ouverture et après 1 minute passée en arrière-plan. Un écran opaque recouvre l'application tant que le verrou n'est pas levé.

**Independent Test**: verrou activé, fermer puis rouvrir l'application : l'écran de verrouillage apparaît et disparaît après validation de Face ID.

**Acceptance Scenarios**:

1. **Given** un appareil compatible, **When** l'utilisateur active le verrou, **Then** Face ID est demandé une fois pour créer la clé de l'appareil et l'état « Verrou actif » s'affiche.
2. **Given** le verrou actif, **When** l'application s'ouvre ou revient d'une minute ou plus en arrière-plan, **Then** l'écran de verrouillage la recouvre et exige Face ID via un bouton « Déverrouiller ».
3. **Given** un échec ou un refus de Face ID, **When** l'utilisateur réessaie, **Then** le verrou reste en place et un message l'indique, sans limite de tentatives.
4. **Given** un retour d'arrière-plan de moins d'une minute, **When** l'application réapparaît, **Then** elle n'est pas reverrouillée.
5. **Given** un appareil sans Face ID, Touch ID ni code, ou un navigateur sans WebAuthn, **When** l'utilisateur ouvre les Réglages, **Then** la carte indique que le verrou n'est pas disponible, sans bouton.
6. **Given** un verrou impossible à lever (appareil changé, clé perdue), **When** l'utilisateur touche « Déverrouillage impossible ? » et confirme, **Then** les données locales sont effacées, le verrou désactivé et l'utilisateur ramené à la connexion Google ; la cave est retrouvée depuis la feuille.
7. **Given** le verrou actif, **When** l'utilisateur le désactive dans Réglages, **Then** plus aucun écran de verrouillage n'apparaît.

### Edge Cases

- L'application fonctionne hors-ligne : le verrou aussi (aucun serveur).
- Le verrou ne chiffre pas les données locales : il écarte un tiers qui prend le téléphone déverrouillé, pas un attaquant équipé.
- Des modifications non synchronisées ne sont jamais perdues sans confirmation explicite (« Déverrouillage impossible ? »).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST accepter une liste facultative d'adresses Google autorisées, fournie au déploiement (variable publique), séparées par virgules, points-virgules ou espaces, casse ignorée.
- **FR-002**: Lorsque la liste est renseignée, le système MUST refuser, à la connexion, tout compte absent de la liste ou dont l'adresse ne peut pas être vérifiée, fermer sa session (jeton révoqué) et ne charger aucune donnée.
- **FR-003**: À l'ouverture, le système MUST fermer la session d'un compte connu absent de la liste et afficher « Accès refusé », en n'effaçant le cache local qu'en l'absence de modification non synchronisée.
- **FR-004**: Sans liste, le comportement existant MUST rester inchangé (le partage de la feuille décide).
- **FR-005**: Le système MUST proposer, dans Réglages, un verrou activable et désactivable reposant sur l'authentification de la plateforme (Face ID, Touch ID ou code de l'appareil), indisponible avec un message clair si l'appareil ne le permet pas.
- **FR-006**: Verrou actif, le système MUST recouvrir l'application d'un écran opaque à l'ouverture et après 1 minute en arrière-plan, et ne le lever qu'après réussite de l'authentification, déclenchée par un tap de l'utilisateur.
- **FR-007**: Le système MUST offrir une sortie de secours « Déverrouillage impossible ? » qui, après confirmation explicite, efface les données locales, désactive le verrou et ramène à la connexion.
- **FR-008**: Aucune donnée biométrique ne MUST quitter l'appareil ni être lue par l'application ; seule la réussite de l'authentification est utilisée. Aucun nouveau stockage dans la feuille.

## Success Criteria *(mandatory)*

- **SC-001**: 100 % des connexions de comptes hors liste sont refusées sans afficher de donnée (liste renseignée).
- **SC-002**: Activer le verrou prend moins de 15 secondes ; le lever à l'ouverture, un seul tap plus Face ID.
- **SC-003**: Un test sur iPhone confirme que Face ID se déclenche depuis l'application installée sur l'écran d'accueil.

## Assumptions

- La liste d'adresses est une défense en profondeur côté client : elle est visible dans le code publié et ne remplace pas le partage de la feuille Google, qui reste le contrôle réel des données.
- Le verrou repose sur WebAuthn (iOS 16+ pour les passkeys, application installée ou Safari) ; la réussite de l'authentification est prise en compte localement, sans vérification de signature côté serveur (il n'y en a pas).
- Hors périmètre : chiffrement des données locales, limitation du nombre de tentatives, verrou différent par compte.
