# Feature Specification: La Cave comme écran principal

**Feature Branch**: `004-cave-principale`

**Created**: 2026-11-03

**Status**: In progress

**Input**: « La cave doit être l'écran principal, avec en exergue les bouteilles à boire en priorité (code couleur selon l'échéance, légende « i »), les mêmes couleurs sur l'écran des emplacements où les bouteilles sont aussi dessinées ; deux boutons en haut : « À boire » (→ stats) et « Quoi boire » (fenêtre de saisie → Liste filtrée) ; « Compléter les mets » dans Réglages ; « À boire maintenant » plus lisible (catégories repliables) ; l'ancien Accueil devient un onglet de stats ; à l'ajout : photo depuis la phototèque, deux photos (avant/arrière), bouton vers le projet Claude (configurable dans Réglages), bouton Enregistrer toujours visible, emplacement directement accessible, position précise 3×3 (anciennes positions reprises) ; total de bouteilles à côté de chaque titre d'emplacement. »

> Suite de [002](../002-accueil-stats-a-boire/spec.md) (qui reste la référence pour les statistiques, « À racheter », la liste de courses, la fusion, le pointage…) et de [001](../001-bottle-inventory/spec.md).

## Décisions

- **Navigation** : Cave (écran d'ouverture) · Stats (ancien « Accueil », ancien chemin `#/accueil` conservé) · Liste · Ajouter · Réglages. La pastille des bouteilles à boire en priorité passe sur l'onglet **Cave**.
- **Code couleur d'urgence** (légende « i ») : rouge *En retard* · orange *À finir* (fin de garde cette année ou la suivante) · vert *À point* · bleu *Bientôt* · gris *Trop tôt* · beige *Non évaluée*. Il colore les bouteilles dessinées sur la cave **et** sur l'écran d'une étagère (les plus urgentes d'abord).
- **Quoi boire** : fenêtre de saisie d'un plat ; envoie sur la Liste avec un filtre « Plat » (recherche tolérante dans les mets conseillés, meilleures correspondances et bouteilles les plus à point d'abord). Le même filtre existe dans la feuille de filtres de la Liste et via les mets cliquables de la fiche.
- **À boire (Stats)** : cinq catégories repliables (En retard, À finir, À point, Bientôt, Trop tôt, Non évaluée) ; seules les plus pressées sont ouvertes ; une ligne compacte par fiche qui se déplie au toucher (garde, emplacement, « Fiche », « Je la bois »).
- **Positions** : 9 zones (dessus / milieu / dessous × gauche / centre / droite). Anciennes valeurs reprises : `dessus` et `dessous` → `milieu-centre`, `gauche` → `milieu-gauche`, `droite` → `milieu-droite` (feuille et base locale).

## Requirements

- **FR-001** La Cave est l'écran d'ouverture ; deux boutons en tête : « À boire » (→ Stats, bloc « À boire ») et « Quoi boire » (fenêtre → Liste filtrée sur le plat).
- **FR-002** Les bouteilles dessinées (cave, étagère) sont colorées selon l'urgence ; un « i » ouvre la légende ; chaque titre de meuble affiche le total de bouteilles.
- **FR-003** « Compléter les mets » n'est accessible que depuis Réglages.
- **FR-004** « À boire » : catégories repliables, lignes compactes dépliables.
- **FR-005** La position sur l'étagère se précise sur 9 zones ; les anciennes positions sont reprises sans action de l'utilisateur.
- **FR-006** *(à venir, voir tâches)* Ajout d'une bouteille : photo depuis la phototèque ou l'appareil photo, deux photos (avant, arrière), bouton Enregistrer toujours visible, emplacement et position choisis directement dans le formulaire, bouton « Ouvrir mon projet Claude » (adresse réglable dans Réglages).
