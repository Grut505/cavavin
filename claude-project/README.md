# Projet Claude « Cavavin » — mise en place

L'application n'appelle aucun service d'IA et ne contient aucune clé d'API : la lecture des
étiquettes est faite par **un projet de votre compte Claude**, qui produit des *propositions* que
vous validez dans l'application.

> **Après chaque mise à jour des consignes** (`INSTRUCTIONS.md`), recopiez-les dans le projet Claude, sinon il ne produira pas les nouveautés (ex. liens de pré-remplissage).
> L'application a un bouton **« Ouvrir mon projet Claude »** : saisissez l'adresse du projet dans Réglages (par appareil).

## 1. Créer le projet

1. Dans Claude (claude.ai ou l'application), créez un **projet** nommé « Cavavin ».
2. Collez le contenu de [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) dans les *instructions du projet*.

## 2. Choisir le canal de livraison

| Canal | Prérequis | Usage |
|---|---|---|
| **1. Dépôt dans la feuille** | Un connecteur Google Sheets **avec écriture** activé sur votre compte Claude, et la feuille Cavavin accessible | Claude ajoute une ligne à l'onglet `Propositions` ; elle apparaît dans l'application à la synchronisation (« Ajouter » → « Propositions à ranger »). |
| **2. JSON collé** | Aucun | Claude répond avec un bloc JSON ; dans l'application : « Ajouter » → « Coller depuis Claude ». |
| **3. Lien de pré-remplissage** | Aucun (consignes à jour dans le projet) | Claude ajoute, après le JSON, un lien par bouteille qui ouvre le formulaire d'ajout déjà rempli (sur iPhone : bandeau « Envoyer à ma cave » / « Copier »). |

La **saisie manuelle** (« Ajouter » → « Saisie manuelle », photos facultatives) reste toujours possible.

Vérifiez si le canal 1 est disponible : demandez à Claude d'ajouter une ligne de test à l'onglet
`Propositions`, puis supprimez-la à la main dans la feuille. Sinon, utilisez le canal 2.

> **Sans projet** : le prompt autonome [`PROMPT.md`](./PROMPT.md) fonctionne dans n'importe quelle
> conversation Claude (et l'application le copie pour vous : « Ajouter » → « Copier le prompt pour Claude »).

## 3. Utilisation

1. Photographiez l'étiquette dans la conversation du projet (« J'en ai 2 » si besoin).
2. Récupérez la proposition (canal 1 ou 2), ouvrez-la dans l'application, vérifiez et corrigez.
3. Choisissez l'étagère dans le schéma de la cave, indiquez la quantité, enregistrez.

Rien n'est créé dans votre cave sans votre validation. Un doublon est détecté automatiquement :
l'application vous propose « Ajouter une bouteille » ou « Compléter la fiche existante ».

## 4. Évaluer la qualité de lecture (objectif SC-002 : ≥ 70 %)

Voir `tests/eval/README.md` (à exécuter quand les consignes sont en place).
