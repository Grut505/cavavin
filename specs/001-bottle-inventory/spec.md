# Feature Specification: Inventaire de la cave (référencer et retrouver ses bouteilles)

**Feature Branch**: `001-bottle-inventory`

**Created**: 2026-11-01

**Status**: Delivered (vérifications iPhone en attente)

**Input**: User description: "Application web mobile (iPhone 16 minimum) pour gérer mon stock de vin : scanner l'étiquette d'une bouteille, indiquer son emplacement dans la cave, et c'est référencé. Recherche, liste avec tri et filtres. Utilisable hors-ligne. Données dans la Google Sheet existante. Accès réservé à moi et ma femme. Visuel simple, sobre et pro."

> Périmètre de cette première fonctionnalité : le socle « référencer + retrouver ». Les fonctions suivantes (top à boire, accord mets-vins végétarien, statistiques, rappels de rachat) feront l'objet de spécifications séparées.

## Clarifications

### Session 2026-11-01

- Q: Que fait le scan d'étiquette sans réseau ? → A: Hors-ligne, la photo est conservée et la fiche saisie à la main ; au retour du réseau, la lecture automatique propose des champs à compléter ou corriger. [Précisé par la session 3 : la lecture est assurée par un projet Claude de l'utilisateur, pas par l'application.]
- Q: Comment représenter plusieurs exemplaires d'un même vin rangés à des endroits différents ? → A: Une fiche par vin (domaine, cuvée, millésime) avec un ou plusieurs emplacements, chacun portant sa quantité.
- Q: Comment les deux comptes s'identifient-ils ? → A: Connexion avec le compte Google de chacun ; la feuille est partagée avec ces deux comptes uniquement.
- Q: Comment décrire l'emplacement d'une bouteille ? → A: Structuré, au niveau de l'étagère (pas de position précise), avec une cave configurée au préalable et représentée visuellement ; étagères ajoutables/supprimables ; d'autres lieux (pièces, etc.) peuvent aussi servir d'emplacement. Une indication de position sur l'étagère (gauche/droite, dessus/dessous) est facultative et purement indicative, car retirer une bouteille décale les autres et l'utilisateur ne veut pas ressaisir les positions.
- Q: Que faire en cas de modification simultanée d'une même fiche (conflit de synchronisation) ? → A: Fusion automatique : les quantités sont combinées (deltas cumulés) ; pour tout autre champ modifié des deux côtés, la dernière modification gagne et l'utilisateur en est informé.

### Session 2026-11-01 (2)

- Q: Quels champs capturer dès maintenant pour les futures fonctions (à boire, stats, rachats) ? → A: Fenêtre de garde (à boire à partir de / avant), prix d'achat, date d'achat, note personnelle sur 5 et fournisseur ; tous facultatifs.
- Q: Que faire des bouteilles déjà présentes dans la feuille ? → A: Import automatique des lignes existantes (champs manquants laissés vides, emplacements existants proposés comme lieux à rattacher à la cave) ; l'utilisateur pourra rescanner une bouteille déjà présente pour compléter sa fiche sans en augmenter la quantité.
- Q: Quelle ambition pour les photos d'étiquettes ? → A: Une photo réduite (miniature lisible) conservée par fiche et affichée sur la fiche et dans la liste ; la photo d'origine pleine qualité n'est pas conservée.
- Q: Quelles unités et conventions (monnaie, dates, formats) ? → A: Euros uniquement, dates au format français (jj/mm/aaaa), formats de bouteille standards (demi, 75 cl, magnum, etc.).
- Q: Que enregistrer à chaque sortie de stock ? → A: Un motif au choix (bue par défaut, offerte, cassée/bouchonnée, autre), la date, et une note facultative.

### Session 2026-11-02 (3)

- Q: Quels champs sont obligatoires ? → A: Dans la partie principale de la fiche, **cuvée, millésime (année ou NV), appellation, couleur et format** sont obligatoires ; tout le reste (domaine, région, pays, tanin, sucre, fenêtre de garde « à boire à partir de / avant », et toutes les autres informations) est facultatif. Cela remplace l'obligation de la fenêtre de garde de la session précédente (la fenêtre reste dans la partie principale mais n'est plus obligatoire).
- Q: Comment éviter des valeurs presque identiques (appellation, région, pays) ? → A: Autocomplétion alimentée par la cave elle-même (et un jeu de départ de pays et de régions), reprise automatique de la graphie existante pour une variante de casse, d'accents ou de tiret, confirmation quand la valeur ressemble à une valeur existante (faute de frappe probable), et région/pays proposés automatiquement pour une appellation déjà connue.
- Q: Comment présenter « Cadeau » ? → A: Un interrupteur éteint par défaut ; activé, il fait apparaître « Offert par ».
- Les erreurs de saisie d'un champ disparaissent dès que l'utilisateur recommence à saisir dans ce champ.

### Session 2026-11-02 (2)

- Q: Où saisir la fenêtre de garde et est-elle facultative ? → A: Dans la partie principale de la fiche et **obligatoire** (à boire à partir de / avant) pour toute saisie ; les fiches importées sans fenêtre restent marquées « à compléter ».
- Q: Comment gérer les cadeaux ? → A: Case « Cadeau » dans « Plus d'informations » ; si cochée, on peut choisir la personne qui a **offert** la bouteille dans une liste paramétrable (Réglages › Personnes), avec ajout à la volée depuis la fiche.

### Session 2026-11-02

- Q: Quelles informations de style supplémentaires et comment obtient-on la fenêtre de garde ? → A: Tanin des rouges (note de 1 à 5) et niveau de sucre des blancs, rosés, effervescents et liquoreux (sec, demi-sec, moelleux, doux) ; la fenêtre de garde (à boire à partir de / avant) peut être estimée par le projet Claude d'après sa connaissance du vin (null s'il n'est pas raisonnablement sûr), puis corrigée par l'utilisateur.

### Session 2026-11-01 (3)

- Q: Comment l'étiquette est-elle lue sans clé d'API ? → A: Par un projet Claude de l'utilisateur (compte Claude classique), hors de l'application, via trois canaux au choix : (1) Claude ajoute une proposition dans la feuille via un connecteur, (2) Claude produit un JSON que l'utilisateur colle dans l'application, (3) saisie manuelle seule. Dans tous les cas, l'application présente la proposition, l'utilisateur choisit l'emplacement et valide ; rien n'est créé ni écrasé sans validation.

## User Scenarios & Testing *(mandatory)*

### User Story 0 - Configurer ma cave (Priority: P1)

Avant de ranger quoi que ce soit, je décris ma cave : je crée des casiers/meubles et leurs étagères, visualisés sous forme de schéma, et je peux ajouter ou supprimer des étagères à tout moment. Je peux aussi déclarer d'autres lieux de stockage (une pièce, un placard, etc.).

**Why this priority**: l'emplacement est choisi parmi cette configuration ; sans elle, on ne peut pas référencer une bouteille.

**Independent Test**: créer un meuble de 5 étagères et une pièce « Cellier », puis ajouter une étagère et en supprimer une vide ; le schéma reflète chaque changement.

**Acceptance Scenarios**:

1. **Given** une cave vide, **When** je crée un meuble avec un nombre d'étagères, **Then** un schéma visuel des étagères s'affiche.
2. **Given** une cave configurée, **When** j'ajoute ou supprime une étagère, **Then** le schéma est mis à jour.
3. **Given** une étagère contenant des bouteilles, **When** je tente de la supprimer, **Then** l'application m'invite à déplacer ces bouteilles ou à confirmer explicitement, sans perte de données.
4. **Given** la cave configurée, **When** je crée un lieu « pièce », **Then** il est disponible comme emplacement au même titre qu'une étagère.
5. **Given** le schéma de la cave, **When** je touche une étagère, **Then** je vois les bouteilles qu'elle contient.

---

### User Story 1 - Référencer une bouteille par scan d'étiquette (Priority: P1)

À la cave, je prends une bouteille, je fais lire son étiquette par mon projet Claude, qui me fournit les informations (domaine, cuvée, appellation, millésime…) sous forme de proposition ; je les corrige si besoin dans l'application, j'indique l'emplacement où je la range, et je valide. La bouteille est référencée dans ma cave.

**Why this priority**: c'est le geste fondateur : sans bouteilles saisies, aucune autre fonction n'a de valeur.

**Independent Test**: scanner une étiquette, compléter l'emplacement, valider ; la bouteille apparaît dans la cave avec toutes les informations saisies.

**Acceptance Scenarios**:

1. **Given** je suis sur l'écran d'ajout, **When** je colle le JSON produit par mon projet Claude (ou j'ouvre une proposition que Claude a ajoutée à la feuille), **Then** les champs reconnus sont pré-remplis et modifiables.
2. **Given** les informations sont pré-remplies, **When** je choisis une étagère (ou un autre lieu) dans le schéma de la cave et je valide, **Then** la bouteille est enregistrée et visible dans la liste.
3. **Given** l'étiquette n'est pas reconnue, **When** la lecture échoue ou que je n'utilise pas Claude, **Then** je peux saisir les informations manuellement et ajouter ma photo.
4. **Given** je suis hors-ligne, **When** je photographie une étiquette, **Then** la photo est conservée, je saisis la fiche à la main ; plus tard, une proposition de mon projet Claude peut compléter ou corriger des champs sans écraser mes saisies.
5. **Given** je possède plusieurs exemplaires identiques, **When** j'ajoute la bouteille, **Then** je peux indiquer pour chaque emplacement la quantité qui y est rangée.

---

### User Story 2 - Parcourir et filtrer ma cave (Priority: P1)

Je consulte la liste de mes bouteilles, que je peux trier (millésime, appellation, domaine, emplacement, date d'ajout…) et filtrer (couleur, région, millésime, quantité…).

**Why this priority**: c'est la raison d'être de l'inventaire : savoir ce que j'ai.

**Independent Test**: avec quelques bouteilles enregistrées, appliquer un tri puis un filtre ; la liste reflète immédiatement le résultat attendu.

**Acceptance Scenarios**:

1. **Given** une cave contenant plusieurs bouteilles, **When** j'ouvre la liste, **Then** je vois pour chacune au minimum domaine, cuvée, millésime, couleur et quantité.
2. **Given** la liste affichée, **When** je change le tri, **Then** l'ordre est mis à jour instantanément.
3. **Given** la liste affichée, **When** j'active un ou plusieurs filtres, **Then** seules les bouteilles correspondantes restent affichées, avec le nombre de résultats.
4. **Given** aucun résultat ne correspond, **When** les filtres sont actifs, **Then** un message clair propose de les réinitialiser.

---

### User Story 3 - Rechercher et localiser une bouteille (Priority: P2)

Je tape quelques lettres (nom du domaine, appellation, millésime, emplacement…) et je retrouve la bouteille ainsi que l'endroit exact où elle est rangée.

**Why this priority**: gain de temps au quotidien, mais la liste filtrée couvre déjà une partie du besoin.

**Independent Test**: saisir un terme présent dans une bouteille ; elle apparaît en tête avec son emplacement.

**Acceptance Scenarios**:

1. **Given** des bouteilles enregistrées, **When** je saisis un terme, **Then** les résultats se mettent à jour pendant la frappe, sans tenir compte des accents ni de la casse.
2. **Given** un résultat affiché, **When** je l'ouvre, **Then** je vois sa fiche complète avec l'emplacement mis en évidence.

---

### User Story 4 - Gérer le cycle de vie d'une bouteille (Priority: P2)

Je peux modifier une fiche, déplacer une bouteille, ou indiquer que j'en ai sorti une, bue par défaut, ou offerte, cassée, etc. (la quantité diminue ; à zéro elle sort du stock actif mais reste dans l'historique).

**Why this priority**: sans cela, l'inventaire devient faux au fil du temps.

**Independent Test**: marquer une bouteille comme bue ; la quantité baisse et l'historique conserve la trace.

**Acceptance Scenarios**:

1. **Given** une fiche avec quantité 3, **When** je sors une bouteille (motif « bue » par défaut), **Then** la quantité passe à 2 et la date et le motif sont conservés.
2. **Given** une fiche avec quantité 1, **When** je la marque comme bue, **Then** elle disparaît du stock actif mais reste consultable dans l'historique.
3. **Given** une bouteille rangée, **When** je change son emplacement, **Then** la nouvelle position est immédiatement reflétée partout.

---

### User Story 5 - Utiliser l'application hors connexion (Priority: P2)

À la cave, sans réseau, je consulte, recherche et filtre ma cave, et je peux même ajouter ou modifier des bouteilles ; tout est synchronisé dès que la connexion revient.

**Why this priority**: la couverture réseau en cave est incertaine ; c'est un confort majeur mais l'application reste utile en ligne seule.

**Independent Test**: passer l'appareil en mode avion, ajouter une bouteille, rétablir le réseau ; la bouteille est présente dans la feuille de données.

**Acceptance Scenarios**:

1. **Given** l'application a déjà été ouverte en ligne, **When** je l'ouvre sans réseau, **Then** ma cave est consultable, triable, filtrable et recherchable.
2. **Given** je suis hors-ligne, **When** j'ajoute ou modifie une bouteille, **Then** le changement est conservé et signalé comme « en attente de synchronisation ».
3. **Given** des changements en attente, **When** la connexion revient, **Then** ils sont synchronisés automatiquement et l'indicateur disparaît.
4. **Given** deux bouteilles bues sur deux appareils sur la même fiche, **When** la synchronisation a lieu, **Then** les deux sorties sont cumulées (−2) et non écrasées.
5. **Given** un même champ (hors quantité) modifié des deux côtés, **When** la synchronisation a lieu, **Then** la dernière modification est retenue et un message m'indique ce qui a été remplacé.

---

### User Story 6 - Accès privé pour moi et ma femme (Priority: P3)

Seuls mon compte et celui de ma femme peuvent consulter et modifier la cave.

**Why this priority**: indispensable à la mise en ligne, mais ne conditionne pas la valeur fonctionnelle elle-même.

**Independent Test**: un compte non autorisé qui tente d'accéder n'obtient aucune donnée.

**Acceptance Scenarios**:

1. **Given** je ne suis pas connecté, **When** j'ouvre l'application, **Then** aucune donnée de la cave n'est affichée et je suis invité à me connecter.
2. **Given** un compte non autorisé, **When** il tente de se connecter, **Then** l'accès est refusé avec un message clair.
3. **Given** je me suis connecté une fois avec mon compte Google, **When** je rouvre l'application les jours suivants, **Then** je n'ai pas à me reconnecter à chaque fois.

---

### Edge Cases

- Étiquette floue, tronquée, en langue étrangère ou photographiée de travers : repli sur saisie manuelle.
- Bouteille déjà référencée (même domaine, cuvée, millésime) : choix explicite entre ajouter une bouteille (quantité +1) et compléter la fiche existante, sans créer de doublon.
- Lignes importées incomplètes ou inexploitables (millésime manquant, emplacement inconnu) : fiche créée avec champs vides, signalée comme « à compléter ».
- Suppression d'une étagère ou d'un lieu contenant des bouteilles : déplacement obligatoire ou confirmation explicite.
- Étagère très remplie : aucune limite de capacité bloquante (la capacité n'est pas modélisée).
- Millésime absent (non millésimé) ou format de bouteille atypique (magnum, demi…).
- Autorisation d'accès à l'appareil photo refusée : saisie manuelle toujours possible.
- Hors-ligne depuis longtemps : les données affichées indiquent la date de dernière synchronisation.
- Plusieurs centaines de bouteilles : tri, filtre et recherche restent fluides.
- Modification manuelle directe de la feuille de données (ajout, suppression, colonnes) : l'application doit la prendre en compte à la prochaine synchronisation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST accepter, sans clé d'API ni service tiers propre à l'application, une proposition de fiche issue de la lecture d'étiquette par le projet Claude de l'utilisateur (domaine, cuvée, appellation, millésime, couleur, région/pays lorsque disponibles), par trois canaux : proposition ajoutée à la feuille par Claude, JSON collé dans l'application, ou saisie manuelle.
- **FR-001a**: Hors-ligne, le système MUST conserver la photo et permettre la saisie manuelle ; toute proposition ultérieure (collée ou déposée dans la feuille) ne MUST jamais écraser des valeurs saisies : elle propose uniquement les valeurs pour les champs vides ou différents. Les propositions reçues restent en attente tant que l'utilisateur ne les a pas validées ou écartées.
- **FR-002**: Le système MUST afficher les informations extraites dans un formulaire modifiable avant validation, et permettre une saisie entièrement manuelle.
- **FR-002a**: Le système MUST permettre de renseigner, de façon facultative et sans jamais bloquer la validation, le prix d'achat, la date d'achat, une note personnelle sur 5, le fournisseur (caviste, domaine…), le tanin d'un rouge (note de 1 à 5) et le niveau de sucre des autres couleurs (sec, demi-sec, moelleux, doux), à l'ajout comme en modification ; la fenêtre de garde peut être proposée par le projet Claude (estimation) et corrigée par l'utilisateur ; ces données sont conservées pour les fonctions futures (top à boire, statistiques, rachats).
- **FR-002b**: Le système MUST exprimer les prix en euros uniquement, afficher les dates au format jj/mm/aaaa, et proposer une liste de formats de bouteille standards (demi, 75 cl, magnum, etc.).
- **FR-002c**: Le système MUST exiger, dans la partie principale de la fiche, uniquement le millésime (une année, ou « NV » si non millésimé), l'appellation, la couleur et le format ; la cuvée (*facultative depuis 2026-11-03 : souvent introuvable, enregistrée « — » si absente*), le domaine, la région, le pays, le tanin, le sucre et la fenêtre de garde (années « à boire à partir de » et « à boire avant », dont la première ne dépasse pas la seconde quand elles sont données) sont facultatifs.
- **FR-002e**: Le système MUST proposer une autocomplétion pour le millésime, l'appellation, la région et le pays, alimentée par les valeurs déjà présentes dans la cave (les plus utilisées d'abord) et par un jeu de départ de pays et de régions ; MUST reprendre la graphie existante quand la saisie n'en diffère que par la casse, les accents ou la ponctuation ; MUST demander confirmation quand la saisie ressemble à une valeur existante sans lui être identique (faute de frappe probable) ; et MUST pré-remplir région et pays d'une appellation déjà connue sans écraser une saisie.
- **FR-002f**: Le système MUST effacer le message d'erreur d'un champ dès que l'utilisateur recommence à saisir ou à choisir une valeur dans ce champ.
- **FR-002d**: Le système MUST permettre de marquer une bouteille comme **cadeau** (interrupteur éteint par défaut dans « Plus d'informations ») et, dans ce cas, de renseigner la personne qui l'a offerte, choisie dans une liste de personnes paramétrable (ajout, renommage, suppression dans Réglages › Personnes, et ajout à la volée depuis la fiche) ; supprimer une personne ne retire pas la mention « cadeau » des fiches concernées.
- **FR-003**: Le système MUST modéliser un vin par une seule fiche (domaine, cuvée, millésime) associée à un ou plusieurs emplacements, chacun portant sa propre quantité ; la quantité totale de la fiche est la somme des quantités par emplacement.
- **FR-003a**: Le système MUST permettre de configurer la cave en amont : meubles/casiers composés d'étagères, représentés visuellement ; ajout et suppression d'étagères à tout moment.
- **FR-003b**: Un emplacement MUST être soit une étagère, soit un autre lieu nommé (pièce, placard, etc.) ; la précision de l'emplacement s'arrête au niveau de l'étagère ou du lieu.
- **FR-003c**: Le système MAY proposer, de façon facultative, une indication de position sur l'étagère (gauche/droite, dessus/dessous) ; elle est purement indicative et n'est jamais requise ni réajustée automatiquement.
- **FR-003d**: Le système MUST empêcher la perte de données lors de la suppression d'une étagère ou d'un lieu non vide (déplacement ou confirmation explicite).
- **FR-004**: Le système MUST détecter les doublons probables (fiche existante correspondant à l'étiquette) et proposer explicitement deux choix : « ajouter une bouteille » (augmente la quantité) ou « compléter la fiche existante » (met à jour les champs sans changer la quantité).
- **FR-004a**: Lors d'une mise à jour d'une fiche existante par rescan, le système MUST proposer les valeurs reconnues uniquement pour les champs vides ou différents, et ne rien écraser sans validation de l'utilisateur.
- **FR-004b** *(abandonné le 2026-11-02 : la cave est ressaisie, aucun import)* : À la première ouverture, le système MUST importer les lignes déjà présentes dans la feuille en tant que fiches, en laissant vides les informations manquantes, et proposer leurs emplacements existants comme lieux à rattacher à la cave configurée ; aucune ligne existante ne MUST être modifiée ou supprimée par l'import.
- **FR-005**: Le système MUST conserver, pour chaque fiche, une version réduite de la photo de l'étiquette (miniature lisible), l'afficher sur la fiche et dans la liste, et la rendre disponible hors-ligne ; la photo d'origine pleine qualité n'est pas conservée après traitement.
- **FR-006**: Le système MUST afficher la liste des bouteilles en stock avec les informations clés de chaque fiche.
- **FR-007**: Le système MUST permettre de trier la liste selon au moins : domaine, appellation, millésime, emplacement, date d'ajout, quantité.
- **FR-008**: Le système MUST permettre de filtrer la liste selon au moins : couleur, région/pays, millésime, quantité, emplacement ; plusieurs filtres combinables et réinitialisables.
- **FR-009**: Le système MUST proposer une recherche texte insensible à la casse et aux accents, mise à jour pendant la saisie.
- **FR-010**: Le système MUST afficher une fiche détaillée par bouteille incluant son emplacement.
- **FR-011**: Le système MUST permettre de modifier une fiche et de déplacer une bouteille.
- **FR-012**: Le système MUST permettre de sortir une bouteille du stock en précisant l'emplacement concerné et un motif (bue par défaut, offerte, cassée/bouchonnée, autre), avec une note facultative (décrément de la quantité de cet emplacement, date conservée ; un emplacement à zéro est retiré de la fiche), et conserver un historique de ces sorties.
- **FR-013**: Le système MUST stocker toutes les données dans la feuille Google Sheets du projet, les colonnes existantes étant conservées ; toute colonne ajoutée MUST être documentée.
- **FR-014**: Le système MUST fonctionner hors-ligne pour la consultation, la recherche, le tri, le filtre, l'ajout et la modification, et synchroniser automatiquement au retour du réseau.
- **FR-015**: Le système MUST indiquer en permanence l'état de synchronisation (à jour, en attente avec le nombre de modifications, hors-ligne, non connecté, accès refusé, erreur) dans l'en-tête de chaque écran, ainsi que la date de dernière synchronisation (en info-bulle et dans les réglages).
- **FR-015a**: Le système MUST synchroniser automatiquement, sans action de l'utilisateur : à l'ouverture, peu après chaque modification, au retour du réseau et au retour au premier plan, avec au moins 15 secondes entre deux cycles et un recul progressif (15 s, 30 s, 1 min… plafonné à 5 min) en cas d'erreur ; l'utilisateur peut aussi la lancer à la demande. Une session expirée ou un accès refusé arrête les tentatives sans jamais perdre les modifications en attente.
- **FR-016a**: Les avis produits par la fusion automatique MUST être regroupés par fiche et par type pour une même synchronisation, conservés jusqu'à ce que l'utilisateur les acquitte (individuellement ou en bloc), et consultables depuis l'indicateur d'état.
- **FR-016**: En cas de modification simultanée d'une même fiche, le système MUST fusionner automatiquement : les variations de quantité sont cumulées ; pour tout autre champ modifié des deux côtés, la dernière modification l'emporte et l'utilisateur en est informé ; aucune modification ne MUST être perdue silencieusement.
- **FR-017**: Le système MUST authentifier les utilisateurs par leur compte Google et restreindre l'accès aux deux comptes autorisés (l'utilisateur et son épouse), avec lesquels la feuille est partagée ; aucune donnée ne MUST être divulguée aux autres comptes.
- **FR-018**: Le système MUST proposer une interface en français, optimisée pour iPhone 16, installable sur l'écran d'accueil, sobre et professionnelle (mode sombre pris en charge, états vide/chargement/erreur soignés).

### Key Entities

- **Bouteille (fiche)** : un vin référencé, unique par domaine (facultatif) + cuvée + millésime : appellation, couleur, région/pays, format, miniature d'étiquette, date d'ajout, notes, fenêtre de garde (à boire à partir de / avant), prix d'achat, date d'achat, note personnelle (/5), fournisseur, tanin (rouges, 1 à 5), niveau de sucre (autres couleurs), cadeau (oui/non) et personne qui l'a offert — hors fenêtre de garde obligatoire, ces derniers champs étant facultatifs ; quantité totale = somme des quantités par emplacement.
- **Personne** : une personne de la liste paramétrable (nom unique) qui peut être désignée comme donateur d'une bouteille cadeau.
- **Meuble/casier** : élément de la cave regroupant des étagères, avec une représentation visuelle.
- **Emplacement** : une étagère d'un meuble ou un autre lieu nommé (pièce, placard…) ; lie une fiche à une quantité à cet endroit, avec une indication de position facultative.
- **Sortie (historique)** : événement de sortie de stock : fiche, emplacement, motif (bue, offerte, cassée/bouchonnée, autre), date, note facultative.
- **Utilisateur autorisé** : l'un des deux comptes ayant accès à la cave.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Référencer une bouteille (scan, vérification, emplacement, validation) prend moins de 45 secondes dans 90 % des cas.
- **SC-002**: Pour des étiquettes lisibles, au moins 70 % des propositions produites par le projet Claude ont domaine et millésime corrects.
- **SC-003**: Retrouver une bouteille précise via la recherche prend moins de 10 secondes.
- **SC-004**: Tri, filtre et recherche répondent de façon perçue comme instantanée (moins de 0,5 s) sur une cave de 500 bouteilles.
- **SC-005**: Hors connexion, 100 % des fonctions de consultation et de saisie restent disponibles, et 100 % des modifications faites hors-ligne sont retrouvées après resynchronisation.
- **SC-006**: Aucune donnée de la cave n'est accessible à un compte non autorisé.
- **SC-007**: Les utilisateurs trouvent l'application agréable et lisible : un test sur iPhone confirme que tous les parcours principaux se réalisent sans zoom ni défilement horizontal.

## Assumptions

- Les utilisateurs sont l'auteur et, potentiellement, son épouse ; pas de gestion de rôles au-delà de l'accès autorisé.
- La feuille Google fournie par l'utilisateur est la base de départ ; sa structure exacte sera relue et documentée au moment du plan, et des colonnes pourront être ajoutées.
- La configuration de la cave (meubles, étagères, lieux) est créée par l'utilisateur dans l'application ; si la feuille existante contient déjà des emplacements, ils seront repris lors du plan.
- Les positions précises sur l'étagère ne sont pas suivies : elles se décalent à chaque retrait et ne seront pas maintenues.
- Seule une miniature de l'étiquette est conservée par fiche, en respectant l'exigence d'accès privé ; la photo d'origine est jetée après réduction.
- La lecture d'étiquette est assurée par un projet Claude du compte Claude de l'utilisateur, hors de l'application ; l'application n'appelle aucun service d'IA et ne détient aucune clé d'API. Le projet Claude fournit une proposition ; l'application ne crée rien sans validation de l'utilisateur.
- Appareil cible minimal : iPhone 16 (Safari) ; les autres appareils sont supportés au mieux.
- Hors périmètre ici : top des bouteilles à boire, suggestions d'accords végétariens, statistiques, rappels de rachat, packaging natif — traités dans des spécifications ultérieures.
- Une connexion est nécessaire au moins une fois pour la première synchronisation et l'authentification.
