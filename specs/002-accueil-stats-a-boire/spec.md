# Feature Specification: Accueil — à boire, statistiques et cadeaux par personne

**Feature Branch**: `002-accueil-stats-a-boire`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Accueil : stats globales (répartition couleur/région/millésime/appellation, valeur et prix, consommation dans le temps depuis l'historique des sorties, maturité), module « quoi boire et quand » (règles sur la fenêtre de garde : à boire maintenant / bientôt / en retard / trop tôt, plus suggestion par occasion via un prompt à coller dans le projet Claude, sans clé d'API), fiche personne listant les bouteilles offertes (en stock et déjà sorties) avec filtre « Offert par » dans la Liste. Nouvel onglet « Accueil » (À boire en haut, puis stats) ; barre à 5 onglets. Fonctionne hors-ligne, données locales."

> Suite de [001-bottle-inventory](../001-bottle-inventory/spec.md), qui annonçait « top à boire » et « statistiques » comme fonctions séparées. Cette fonctionnalité **ne crée aucune nouvelle donnée** : tout est calculé à partir des fiches, stocks, sorties et personnes déjà présents dans la feuille.

## Clarifications

### Session 2026-11-02

- Q: Où retrouver les bouteilles offertes par personne ? → A: Une fiche par personne (depuis Réglages > Personnes) listant ses bouteilles en stock et déjà sorties, plus un filtre « Offert par » dans la Liste.
- Q: Comment fonctionne « quoi boire et quand » ? → A: Des règles sur la fenêtre de garde calculées dans l'application, plus une suggestion par occasion : l'application prépare un prompt à coller dans le projet Claude de l'utilisateur (aucune clé d'API, aucun appel d'IA par l'application).
- Q: Quelles statistiques ? → A: Répartition (couleur, région/pays, millésime, appellation), valeur et prix, consommation dans le temps, maturité.
- Q: Où dans la navigation ? → A: Un nouvel onglet « Accueil » (« À boire » en haut, puis statistiques) ; la barre passe à 5 onglets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Savoir quoi boire et quand (Priority: P1)

À l'ouverture de l'application, l'utilisateur voit sur l'Accueil ce qu'il devrait boire : les bouteilles dont la fenêtre de garde est dépassée ou se termine, puis celles à boire maintenant, celles qui arrivent bientôt et celles qui sont encore trop jeunes. Il touche une ligne pour ouvrir la fiche et voir où est rangée la bouteille.

**Why this priority**: c'est la raison d'être d'une cave suivie : ne pas laisser passer l'apogée des bouteilles. La fenêtre de garde est déjà saisie sur chaque fiche.

**Independent Test**: avec quelques fiches ayant des fenêtres de garde variées, l'Accueil les classe dans les bonnes catégories et un tap sur une ligne ouvre la fiche.

**Acceptance Scenarios**:

1. **Given** des fiches dont la fenêtre de garde est dépassée, en cours, à venir et lointaine, **When** l'utilisateur ouvre l'Accueil, **Then** elles apparaissent dans quatre groupes distincts (« En retard », « À boire maintenant », « Bientôt », « Trop tôt »), chacun avec son nombre de bouteilles, les groupes urgents en premier.
2. **Given** une fiche à boire maintenant dont la fenêtre se termine cette année ou la suivante, **When** l'Accueil s'affiche, **Then** elle est signalée « à finir » et placée avant les autres du groupe.
3. **Given** une fiche en stock à plusieurs emplacements, **When** elle apparaît dans « À boire », **Then** sa quantité totale et ses emplacements sont visibles sans ouvrir la fiche.
4. **Given** aucune bouteille en stock, **When** l'Accueil s'affiche, **Then** un état vide explique quoi faire (ajouter une bouteille) au lieu d'un écran vide.
5. **Given** une fiche sans fenêtre de garde exploitable, **When** l'Accueil s'affiche, **Then** elle est placée dans un groupe « Non évaluée » et jamais écartée silencieusement.

---

### User Story 2 - Voir les bouteilles offertes par personne (Priority: P2)

L'utilisateur ouvre une personne depuis Réglages > Personnes et voit toutes les bouteilles qu'elle lui a offertes : celles encore en stock (avec emplacement et quantité) et celles déjà sorties (avec date et motif). Dans la Liste, un filtre « Offert par » restreint l'affichage aux bouteilles d'une personne.

**Why this priority**: permet de penser à la personne au bon moment (la boire avec elle, la remercier) ; la donnée « offert par » existe déjà mais n'est pas exploitable.

**Independent Test**: avec deux personnes et des fiches marquées « cadeau », chaque fiche personne n'affiche que ses bouteilles ; le filtre de la Liste donne le même contenu pour les bouteilles en stock.

**Acceptance Scenarios**:

1. **Given** une personne ayant offert trois fiches dont une déjà bue, **When** l'utilisateur ouvre sa fiche, **Then** deux sont listées « en stock » et une « déjà sortie » avec sa date de sortie.
2. **Given** la Liste, **When** l'utilisateur choisit « Offert par » puis une personne, **Then** seules les bouteilles en stock offertes par cette personne restent affichées, et le filtre apparaît parmi les filtres actifs, effaçable.
3. **Given** une personne supprimée de la liste mais dont le nom reste sur des fiches, **When** l'utilisateur filtre la Liste, **Then** ce nom reste proposé ou retrouvable ailleurs sans erreur (les fiches ne sont jamais perdues).
4. **Given** une personne n'ayant rien offert, **When** l'utilisateur ouvre sa fiche, **Then** un message l'indique simplement.

---

### User Story 3 - Statistiques globales de la cave (Priority: P2)

Sous « À boire », l'Accueil présente des statistiques : répartition du stock (couleur, région/pays, millésime, appellation), valeur et prix, maturité globale et consommation dans le temps.

**Why this priority**: donne une vue d'ensemble de la cave et de ses habitudes ; utile mais moins urgente que de savoir quoi boire.

**Independent Test**: sur un jeu de données connu, chaque total affiché correspond au calcul manuel (bouteilles par couleur, valeur = prix × quantité, sorties par mois).

**Acceptance Scenarios**:

1. **Given** un stock varié, **When** l'utilisateur consulte les statistiques, **Then** il voit le nombre total de bouteilles et de fiches et, pour chaque axe (couleur, région/pays, millésime, appellation), la répartition en nombre de bouteilles, triée du plus au moins représenté.
2. **Given** des fiches avec et sans prix d'achat, **When** la valeur s'affiche, **Then** elle est la somme prix × quantité des fiches qui ont un prix, avec le prix moyen par bouteille, et indique combien de fiches n'ont pas de prix (non comptées).
3. **Given** un historique de sorties (bue, offerte, cassée, autre), **When** l'utilisateur consulte la consommation, **Then** il voit le nombre de bouteilles sorties par mois sur les 12 derniers mois et le total par motif.
4. **Given** la maturité, **When** les statistiques s'affichent, **Then** la part de la cave dans chaque catégorie de maturité de l'US1 est visible.
5. **Given** une cave vide ou sans historique, **When** les statistiques s'affichent, **Then** chaque bloc indique l'absence de données sans erreur ni division par zéro.

---

### User Story 4 - Suggestion de bouteilles selon l'occasion (Priority: P3)

L'utilisateur décrit une occasion (plat, convives, budget, envie) ; l'application prépare un prompt contenant la liste de ses bouteilles candidates avec leur maturité, qu'il copie et colle dans son projet Claude pour obtenir une sélection argumentée parmi sa cave.

**Why this priority**: valeur ajoutée par rapport aux règles seules, mais dépend d'une étape manuelle hors application ; sans clé d'API, c'est le seul mode possible.

**Independent Test**: après saisie d'une occasion, le prompt copié contient l'occasion, les consignes et la liste des candidates ; il se colle tel quel dans une conversation Claude.

**Acceptance Scenarios**:

1. **Given** une cave non vide, **When** l'utilisateur saisit « magret de canard, 4 personnes » et touche « Préparer le prompt », **Then** le prompt est copié dans le presse-papiers avec confirmation, et contient l'occasion et les bouteilles en stock (domaine, cuvée, millésime, appellation, couleur, quantité, maturité, emplacement).
2. **Given** une cave de plusieurs centaines de fiches, **When** le prompt est préparé, **Then** il reste d'une taille collable : les bouteilles les plus urgentes et pertinentes sont gardées, et l'utilisateur est prévenu si la liste a été tronquée.
3. **Given** que le presse-papiers est refusé, **When** l'utilisateur touche « Préparer le prompt », **Then** le prompt s'affiche dans un champ sélectionnable pour copie manuelle.
4. **Given** l'absence de réseau, **When** l'utilisateur prépare le prompt, **Then** la préparation fonctionne ; seul le collage dans Claude nécessite le réseau.

---

### Edge Cases

- Fiche sans fenêtre de garde exploitable (valeurs absentes ou incohérentes, début postérieur à la fin) : groupe « Non évaluée », jamais masquée.
- Millésime « NV » ou fenêtre exprimée en années seules : la fenêtre de garde reste la référence, le millésime n'intervient pas dans le classement.
- Changement d'année : le classement dépend de l'année en cours et se met à jour à l'ouverture de l'application, sans resynchronisation.
- Prix d'achat absent ou à zéro : fiche exclue de la valeur et signalée dans le compteur « sans prix ».
- Fiche sans appellation, région ou couleur : regroupée sous « Non renseigné » dans la répartition.
- Bouteille sortie (quantité 0) : absente du stock, des répartitions et d'« À boire », mais présente dans la consommation et dans la fiche personne (« déjà sortie »).
- Fiche « cadeau » sans personne renseignée : comptée comme cadeau mais absente des fiches personne.
- Grande cave (500 à 1000 fiches) : l'Accueil reste fluide hors-ligne.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST proposer un onglet « Accueil », premier de la barre de navigation et écran d'ouverture par défaut, la barre comptant alors cinq onglets (Accueil, Cave, Liste, Ajouter, Réglages) avec des zones tactiles ≥ 44 px.
- **FR-002**: Le système MUST classer chaque fiche en stock, d'après sa fenêtre de garde et l'année en cours, dans exactement une catégorie : **En retard** (fin de fenêtre dépassée), **À boire maintenant** (année dans la fenêtre), **Bientôt** (la fenêtre s'ouvre l'année suivante), **Trop tôt** (la fenêtre s'ouvre dans plus d'un an) ou **Non évaluée** (fenêtre absente ou incohérente).
- **FR-003**: Le système MUST signaler « à finir » les fiches à boire maintenant dont la fenêtre se termine l'année en cours ou la suivante, et les placer avant les autres de leur groupe.
- **FR-004**: L'Accueil MUST présenter « À boire » en premier, avec pour chaque groupe le nombre de bouteilles et, pour chaque fiche, titre, millésime, quantité totale, emplacements et accès à la fiche.
- **FR-005**: Le système MUST afficher des statistiques de répartition du stock, en nombre de bouteilles, par couleur, région/pays, millésime et appellation, avec le total de bouteilles et de fiches.
- **FR-006**: Le système MUST afficher la valeur de la cave (somme prix d'achat × quantité), le prix moyen par bouteille, et le nombre de fiches sans prix non comptées ; les montants en euros, format français (cf. 001 FR-002b).
- **FR-007**: Le système MUST afficher la consommation à partir de l'historique des sorties : bouteilles sorties par mois sur les 12 derniers mois et total par motif (bue, offerte, cassée, autre).
- **FR-008**: Le système MUST afficher la répartition de la cave par catégorie de maturité (FR-002).
- **FR-009**: Le système MUST proposer, sur l'Accueil, une zone « Quoi boire ce soir ? » où l'utilisateur décrit une occasion en texte libre (plat, convives, budget, envie) et obtient un prompt prêt à coller dans son projet Claude.
- **FR-010**: Le prompt MUST contenir l'occasion, des consignes de réponse (sélection argumentée limitée aux bouteilles fournies, par ordre de préférence, en privilégiant les bouteilles à finir) et la liste des bouteilles en stock avec domaine, cuvée, millésime, appellation, couleur, quantité, catégorie de maturité et emplacement, sans photos.
- **FR-011**: Le système MUST garder le prompt à une taille collable en retenant en priorité les bouteilles les plus urgentes, et MUST informer l'utilisateur lorsque la liste est tronquée.
- **FR-012**: Le système MUST copier le prompt dans le presse-papiers avec confirmation, ou à défaut l'afficher dans un champ sélectionnable. L'application n'appelle aucun service d'IA, ne contient aucune clé d'API et n'importe pas la réponse de Claude.
- **FR-013**: Le système MUST proposer une fiche par personne, accessible depuis Réglages > Personnes, listant les bouteilles qu'elle a offertes : « En stock » (titre, quantité, emplacement) et « Déjà sorties » (titre, date et motif de sortie).
- **FR-014**: Le système MUST ajouter à la Liste un filtre « Offert par » (une personne), combinable avec les filtres existants, apparaissant comme filtre actif effaçable, et restreint aux bouteilles en stock.
- **FR-015**: Le système MUST calculer tout cela localement, hors-ligne, à partir des données déjà synchronisées, sans nouvelle colonne ni nouvel onglet dans la feuille ; un changement de données se reflète à l'affichage suivant.
- **FR-016**: Tous les nouveaux écrans MUST disposer d'états vides explicites, de libellés accessibles (contraste AA, graphiques doublés d'un texte ou d'un tableau lisible par lecteur d'écran), du mode sombre, et ne jamais défiler horizontalement sur iPhone.

### Key Entities *(include if feature involves data)*

- **Catégorie de maturité** : état d'une fiche en stock par rapport à sa fenêtre de garde et à l'année en cours (En retard, À boire maintenant, Bientôt, Trop tôt, Non évaluée), avec l'indicateur « à finir ». Calculée, jamais stockée.
- **Statistique de répartition** : décompte de bouteilles par valeur d'un axe (couleur, région/pays, millésime, appellation) ; calculée.
- **Consommation** : décompte des sorties par mois et par motif, issu de l'historique des sorties existant.
- **Cadeau par personne** : lien entre une personne, ses fiches « cadeau », les stocks restants et les sorties de ces fiches. Aucune nouvelle donnée : la fiche porte déjà « offert par ».
- **Prompt d'occasion** : texte éphémère assemblé à partir de l'occasion saisie et du stock ; jamais conservé dans la feuille.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En ouvrant l'application, l'utilisateur identifie les bouteilles à boire en priorité en moins de 10 secondes, sans aucune manipulation.
- **SC-002**: 100 % des fiches en stock apparaissent dans exactement une catégorie de maturité, y compris celles à fenêtre incomplète.
- **SC-003**: Sur un jeu de données de référence, 100 % des totaux affichés (répartitions, valeur, consommation) correspondent au calcul manuel.
- **SC-004**: Retrouver toutes les bouteilles offertes par une personne, en stock et déjà sorties, prend moins de 10 secondes.
- **SC-005**: Préparer un prompt d'occasion prêt à coller prend moins de 20 secondes, saisie de l'occasion comprise.
- **SC-006**: Avec 1000 fiches, l'Accueil s'affiche en moins de 1 seconde perçue et fonctionne intégralement sans réseau.
- **SC-007**: Un test sur iPhone confirme que les cinq onglets restent lisibles et tapables à une main, sans défilement horizontal.

## Assumptions

- Le classement de maturité utilise l'année civile en cours ; « Bientôt » signifie que la fenêtre s'ouvre l'année suivante, « Trop tôt » qu'elle s'ouvre plus tard (interprétation à confirmer à l'usage).
- Le prix d'achat est un prix par bouteille ; la valeur est une valeur d'achat, pas une cote de marché.
- Seuls les stocks actifs (quantité > 0) entrent dans l'« À boire », les répartitions et la valeur.
- Le marquage « cadeau » est porté par la fiche : toutes les bouteilles d'une fiche « cadeau » sont comptées comme offertes par la personne indiquée.
- L'historique des sorties existant (date, motif, fiche) est suffisant pour la consommation ; les sorties antérieures à l'existence de l'historique n'y figurent pas.
- Le prompt d'occasion est destiné au projet Claude déjà décrit dans `claude-project/` ; ses consignes générales y sont déjà posées, le prompt n'ajoute que l'occasion et la liste.
- Hors périmètre : rappels de rachat, accords mets-vins calculés par l'application, graphiques interactifs avancés, export des statistiques, import de la réponse de Claude dans l'application.
