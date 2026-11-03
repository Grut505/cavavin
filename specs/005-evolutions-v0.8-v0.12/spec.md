# Spécification : évolutions v0.8 → v0.12

**Status**: Delivered (vérification iPhone en attente) · **Created**: 2026-11-03 · **Versions**: 0.8.0 → 0.12.0
Complète `004-cave-principale`. Constitution : feuille = source de vérité, hors-ligne d'abord, simplicité, accès privé.

## Scénarios

### US1 — Liste fluide à grande échelle (P1) · v0.8.0
La Liste affiche 100 fiches à la fois ; la suite se charge au défilement (ou par un bouton), sans reconstruire les cartes déjà affichées. Une nouvelle recherche ou un changement de filtre repart de la première page ; la saisie est temporisée (~120 ms). Un squelette de chargement s'affiche avant les données.
- FR-001 100 cartes par paquet ; total de fiches et de bouteilles toujours affiché.
- FR-002 Recherche et filtres inchangés fonctionnellement.

### US2 — Synchronisation incrémentale (P1) · v0.9.0
Une synchronisation ne relit plus toute la feuille. Onglet `Photos` : colonnes `id, rev, updated_at, deleted` puis seulement les lignes nouvelles/modifiées ; `_Journal` : colonne `op_id` seulement s'il y a des opérations à envoyer ; la copie locale n'est réécrite que si le contenu change.
- FR-003 Sans changement, une synchro relit < 2 000 cellules (test de contrat).
- FR-004 Repli sûr (lecture complète) si les colonnes de `Photos` ont été déplacées ou > 40 plages à relire.
- FR-005 Contrat : `contracts/sync-operations.md` (Pull incrémental).

### US3 — Gestes de balayage (P2) · v0.9.0, v0.9.4
Liste : glisser une carte vers la gauche révèle *Modifier* (retour à la Liste ensuite) et *Sortir* (si stock). Historique : glisser une ligne révèle *Supprimer*, avec confirmation (la bouteille ne revient pas en stock). Sans écran tactile : boutons à côté de la ligne dans l'historique.

### US4 — Fiche supprimée consultable (P2) · v0.9.0
Une fiche supprimée ou fusionnée reste ouvrable depuis l'historique : bandeau « fiche supprimée », badge dans l'historique, actions et emplacements masqués.

### US5 — Statut « à boire » partout (P1) · v0.10.0
Cartes : liseré et pastille du code couleur d'urgence (bouteilles en stock). Fiche : pastille dans « À boire », bloc **Style** (tanins sur 5 crans, sucre sur l'échelle sec → doux), « Où la trouver ? » : un bloc par emplacement mis en avant (pastille « Ici », bouteilles de la fiche cerclées), nom d'emplacement non répété (v0.10.1).

### US6 — Lien de pré-remplissage (P1) · v0.11.0
Claude donne un lien `…/#/ajouter/saisie?domain=…` (ou `?fiche=` JSON/base64url) qui ouvre le formulaire pré-rempli. Données validées par `parseProposals` ; **aucun enregistrement automatique**. Dans un navigateur sans cave (Safari à côté de la PWA) : bandeau « Envoyer à ma cave » (proposition `source = lien`) / « Copier pour l'appli installée ». Lien illisible : formulaire vide + message. Limites : 600 caractères par valeur, 8 000 pour la forme compacte. Contrat : `label-proposal.md` canal 3.

### US7 — Filtre par case d'étagère (P2) · v0.12.0
Sur l'écran d'une étagère, toucher une case (3×3 ou « position non précisée ») ne garde que ses bouteilles dans la liste ; re-toucher ou « Tout afficher » annule. Un toucher sur une bouteille ouvre sa fiche sans changer le filtre. Cases accessibles au clavier. Inactif dans « Où la trouver ? ».

## Hors périmètre
Ouverture directe de l'appli installée par un lien sur iOS (limite de la plateforme) ; synchronisation par plages côté Journal (lecture bornée).

## Critères de succès
- SC-001 La Liste reste fluide à 250 fiches (test : 100 / 200 / 250 cartes).
- SC-002 Synchro sans changement : < 2 000 cellules lues.
- SC-003 Aucune écriture de fiche sans validation de l'utilisateur à partir d'un lien.
