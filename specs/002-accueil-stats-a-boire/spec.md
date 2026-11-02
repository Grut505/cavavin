# Feature Specification: Accueil — à boire, statistiques et cadeaux par personne

**Feature Branch**: `002-accueil-stats-a-boire`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Accueil : stats globales (répartition couleur/région/millésime/appellation, valeur et prix, consommation dans le temps depuis l'historique des sorties, maturité), module « quoi boire et quand » (règles sur la fenêtre de garde : à boire maintenant / bientôt / en retard / trop tôt), fiche personne listant les bouteilles offertes (en stock et déjà sorties) avec filtre « Offert par » dans la Liste. Nouvel onglet « Accueil » (À boire en haut, puis stats) ; barre à 5 onglets. Fonctionne hors-ligne, données locales."

> Suite de [001-bottle-inventory](../001-bottle-inventory/spec.md), qui annonçait « top à boire » et « statistiques » comme fonctions séparées. Cette fonctionnalité **ne crée aucune nouvelle donnée** : tout est calculé à partir des fiches, stocks, sorties et personnes déjà présents dans la feuille.

## Clarifications

### Session 2026-11-02

- Q: Où retrouver les bouteilles offertes par personne ? → A: Une fiche par personne (depuis Réglages > Personnes) listant ses bouteilles en stock et déjà sorties, plus un filtre « Offert par » dans la Liste.
- Q: Comment fonctionne « quoi boire et quand » ? → A: Des règles sur la fenêtre de garde calculées dans l'application. ~~Suggestion par occasion via un prompt à coller dans Claude~~ **remplacée (2026-11-02)** : à la lecture d'étiquette, le projet Claude propose une **liste de mets conseillés** stockée dans la fiche ; « Quoi boire ce soir » cherche le plat saisi dans ces mets, localement, avec tolérance aux fautes de frappe (aucune clé d'API, aucun appel d'IA par l'application).
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

### User Story 4 - Quoi boire ce soir, d'après les mets (Priority: P3)

Lors du référencement d'une bouteille, le projet Claude propose une liste de **mets conseillés** (végétariens, par exemple « risotto aux champignons », « fromages à pâte dure »), qui est enregistrée dans la fiche et modifiable. Sur l'Accueil, l'utilisateur saisit un plat ou un ingrédient et l'application sort les bouteilles en stock dont les mets correspondent, les plus à point d'abord. La recherche pardonne les fautes de frappe et les variations d'écriture.

**Why this priority**: répond à la question « qu'est-ce que j'ouvre avec ce plat ? » sans aucun appel externe au moment de la recherche : l'intelligence est apportée une fois pour toutes à l'ajout de la bouteille.

**Independent Test**: avec des fiches portant des mets, la saisie d'un plat (même mal orthographié) retourne les bonnes bouteilles, triées par maturité, avec le met qui a déclenché la correspondance.

**Acceptance Scenarios**:

1. **Given** une étiquette lue par le projet Claude, **When** la proposition est importée, **Then** la fiche pré-remplit les mets conseillés (4 à 8 en général), que l'utilisateur peut corriger avant d'enregistrer.
2. **Given** des fiches avec mets, **When** l'utilisateur saisit « un risoto aux champignon pour 4 personnes », **Then** les bouteilles dont les mets contiennent « risotto aux champignons » sont listées malgré les fautes, sans que le nombre de convives ni les mots courants gênent.
3. **Given** des résultats, **When** ils s'affichent, **Then** les bouteilles à boire maintenant (« à finir » d'abord) passent avant les trop jeunes, chaque résultat indique le met correspondant, sa maturité et sa fenêtre de garde, et un tap ouvre la fiche.
4. **Given** un plat composé de plusieurs mots dont une partie seulement correspond (« risotto truffe »), **When** au moins la moitié des mots significatifs est retrouvée, **Then** la bouteille est proposée, moins bien classée qu'une correspondance complète.
5. **Given** un plat avec viande ou poisson (« magret de canard »), **When** la recherche ne trouve rien, **Then** l'écran explique que les mets de la cave sont végétariens et invite à essayer un plat végétarien ou un raccourci.
6. **Given** aucune correspondance, **When** la recherche aboutit à zéro résultat, **Then** l'écran le dit clairement et indique combien de fiches en stock n'ont aucun mets renseigné.
7. **Given** des fiches existantes sans mets, **When** l'utilisateur ouvre l'écran, **Then** elles restent utilisables partout ailleurs ; elles n'apparaissent simplement pas dans cette recherche tant que leurs mets ne sont pas renseignés (à la main ou par un nouveau passage dans le projet Claude).
8. **Given** des mets déjà présents dans la cave, **When** l'écran s'affiche, **Then** les plus fréquents sont proposés comme raccourcis de recherche.
9. **Given** l'absence de réseau, **When** l'utilisateur cherche un plat, **Then** la recherche fonctionne intégralement.

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
- **FR-009**: Le système MUST enregistrer dans chaque fiche une liste de **mets conseillés** (texte libre, éléments séparés ; 12 au maximum, doublons ignorés), facultative, modifiable dans le formulaire de la fiche et affichée sur la fiche détaillée.
- **FR-010**: Le projet Claude MUST proposer, à chaque lecture d'étiquette, 4 à 8 mets courts en français (plats, ingrédients, fromages), **strictement végétariens** en estimation d'après le vin, l'appellation, la couleur et le style, ou rien s'il n'est pas raisonnablement sûr ; la proposition les transmet dans un champ dédié, repris à la validation de la fiche et à la mise à jour d'une fiche existante (champ vide ou différent proposé, jamais écrasé sans accord).
- **FR-011**: Le système MUST proposer, sur l'Accueil, une zone « Quoi boire ce soir ? » où l'utilisateur saisit un plat ou un ingrédient et obtient les bouteilles **en stock** dont les mets correspondent, recherchées localement.
- **FR-012**: La recherche MUST être permissive : insensible à la casse, aux accents et aux ligatures (« bœuf » = « boeuf »), tolérante aux fautes de frappe (lettre oubliée, en trop, inversée ou fausse), aux pluriels et aux débuts de mot, et ignorer les mots courants (« un », « de », « pour »…), les nombres et les mentions de convives. Une bouteille est proposée dès qu'au moins la moitié des mots significatifs est retrouvée.
- **FR-012a**: Les résultats MUST être classés par qualité de correspondance (complète d'abord), puis par maturité (à boire maintenant et « à finir » avant les autres, trop tôt en dernier), et afficher le met correspondant, la maturité et la fenêtre de garde.
- **FR-012c**: Tout est géré en **mode végétarien** : les mets sont végétariens (ni viande, ni charcuterie, ni poisson, ni fruits de mer ; œufs, laitages et fromages acceptés). Un met non végétarien reçu dans une proposition est écarté avec un avertissement ; saisi à la main dans la fiche, il est refusé avec un message clair ; une recherche d'un plat non végétarien l'explique au lieu d'un simple « aucun résultat ».
- **FR-012b**: L'application n'appelle aucun service d'IA, ne contient aucune clé d'API ; l'intelligence vient uniquement des mets enregistrés à l'ajout de la bouteille.
- **FR-013**: Le système MUST proposer une fiche par personne, accessible depuis Réglages > Personnes, listant les bouteilles qu'elle a offertes : « En stock » (titre, quantité, emplacement) et « Déjà sorties » (titre, date et motif de sortie).
- **FR-014**: Le système MUST ajouter à la Liste un filtre « Offert par » (une personne), combinable avec les filtres existants, apparaissant comme filtre actif effaçable, et restreint aux bouteilles en stock.
- **FR-015**: Le système MUST calculer tout cela localement, hors-ligne, à partir des données déjà synchronisées, sans nouvelle colonne ni nouvel onglet dans la feuille ; un changement de données se reflète à l'affichage suivant.
- **FR-016**: Tous les nouveaux écrans MUST disposer d'états vides explicites, de libellés accessibles (contraste AA, graphiques doublés d'un texte ou d'un tableau lisible par lecteur d'écran), du mode sombre, et ne jamais défiler horizontalement sur iPhone.

### Key Entities *(include if feature involves data)*

- **Catégorie de maturité** : état d'une fiche en stock par rapport à sa fenêtre de garde et à l'année en cours (En retard, À boire maintenant, Bientôt, Trop tôt, Non évaluée), avec l'indicateur « à finir ». Calculée, jamais stockée.
- **Statistique de répartition** : décompte de bouteilles par valeur d'un axe (couleur, région/pays, millésime, appellation) ; calculée.
- **Consommation** : décompte des sorties par mois et par motif, issu de l'historique des sorties existant.
- **Cadeau par personne** : lien entre une personne, ses fiches « cadeau », les stocks restants et les sorties de ces fiches. Aucune nouvelle donnée : la fiche porte déjà « offert par ».
- **Mets conseillés** : liste de plats/ingrédients portée par la fiche (colonne `pairings` en schéma v4, dans `Vins` et `Propositions`), alimentée par le projet Claude à la lecture d'étiquette et corrigeable à la main.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En ouvrant l'application, l'utilisateur identifie les bouteilles à boire en priorité en moins de 10 secondes, sans aucune manipulation.
- **SC-002**: 100 % des fiches en stock apparaissent dans exactement une catégorie de maturité, y compris celles à fenêtre incomplète.
- **SC-003**: Sur un jeu de données de référence, 100 % des totaux affichés (répartitions, valeur, consommation) correspondent au calcul manuel.
- **SC-004**: Retrouver toutes les bouteilles offertes par une personne, en stock et déjà sorties, prend moins de 10 secondes.
- **SC-005**: Pour un plat saisi avec une ou deux fautes de frappe, les bonnes bouteilles sont proposées en moins de 10 secondes, sans réseau.
- **SC-006**: Avec 1000 fiches, l'Accueil s'affiche en moins de 1 seconde perçue et fonctionne intégralement sans réseau.
- **SC-007**: Un test sur iPhone confirme que les cinq onglets restent lisibles et tapables à une main, sans défilement horizontal.

## Assumptions

- Le classement de maturité utilise l'année civile en cours ; « Bientôt » signifie que la fenêtre s'ouvre l'année suivante, « Trop tôt » qu'elle s'ouvre plus tard (interprétation à confirmer à l'usage).
- Le prix d'achat est un prix par bouteille ; la valeur est une valeur d'achat, pas une cote de marché.
- Seuls les stocks actifs (quantité > 0) entrent dans l'« À boire », les répartitions et la valeur.
- Le marquage « cadeau » est porté par la fiche : toutes les bouteilles d'une fiche « cadeau » sont comptées comme offertes par la personne indiquée.
- L'historique des sorties existant (date, motif, fiche) est suffisant pour la consommation ; les sorties antérieures à l'existence de l'historique n'y figurent pas.
- Les mets sont des estimations de Claude, pas une vérité : l'utilisateur les corrige. Les fiches créées avant cette fonctionnalité n'ont pas de mets tant qu'on ne les complète pas ; aucune extraction rétroactive n'est faite par l'application.
- Ajout d'une colonne `pairings` à la feuille (constitution IV : documentée dans `contracts/sheet-schema.md`, migration automatique rétro-compatible, schéma v4).
- Hors périmètre : rappels de rachat, accords mets-vins calculés ou inventés par l'application (elle ne fait que chercher dans les mets enregistrés), graphiques interactifs avancés, export des statistiques, import automatique de mets sur les fiches existantes.
