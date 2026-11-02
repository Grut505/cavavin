# Quickstart — validation de bout en bout

Prérequis : Node ≥ 20 ; un projet Google Cloud avec un client OAuth « Application Web » (origines autorisées : `http://localhost:5173` et l'URL GitHub Pages) ; la feuille partagée avec les deux comptes ; le projet Claude créé dans ton compte Claude (`claude-project/README.md`). Les identifiants (client ID, id de la feuille) vont dans `.env.local` (ignoré par git), jamais commités.

## 1. Installation et tests automatiques

```bash
npm install
npm test            # unitaires + contrats de synchronisation
npm run dev         # http://localhost:5173
```

Attendu : tous les tests passent, notamment « deux sorties concurrentes ⇒ −2 ».

## 2. Initialisation (US0, US6)

1. Ouvrir l'application, « Se connecter avec Google » avec un compte autorisé.
2. « Initialiser ma cave » ⇒ onglets créés, lignes de l'onglet d'origine importées (`needs_review` pour les incomplètes), onglet d'origine inchangé (comparer avant/après).
3. Compte non autorisé ⇒ « accès refusé », aucune donnée visible.

## 3. Configurer la cave (US0)

Créer un meuble de 5 étagères et une pièce « Cellier » ; ajouter/supprimer une étagère ; tenter de supprimer une étagère non vide ⇒ déplacement/confirmation exigé.

## 4. Référencer une bouteille (US1)

Faire lire une étiquette par le projet Claude puis, au choix : **canal 1** (Claude ajoute une ligne à `Propositions`, vérifier qu'elle apparaît à la synchro) ou **canal 2** (coller le JSON). Champs pré-remplis ; choisir une étagère dans le schéma ; valider ⇒ fiche + stock dans la feuille, proposition passée en `importée`. Une proposition pour une fiche existante ⇒ choix « ajouter » / « compléter ». **Canal 3** : saisie manuelle complète. Chronométrer : < 45 s (SC-001).

## 5. Saisie hors-ligne puis retour réseau (US1, US5)

Mode avion ⇒ saisir à la main (photo pour la miniature), valider ⇒ « en attente ». Réseau rétabli ⇒ sync automatique. Ensuite, soumettre une proposition Claude pour la même fiche ⇒ elle ne propose que les champs vides/différents, sans écrasement.

## 6. Installation iPhone et jeton (US6, risque research §3)

Safari → Partager → « Sur l'écran d'accueil ». Se connecter, attendre > 1 h ou révoquer le jeton, ré-ouvrir : l'application reste consultable ; le bandeau « Reconnecter » rétablit la sync en un tap. **Noter si le renouvellement silencieux fonctionne** : sinon appliquer le repli décrit dans research.md §3.

## 7. Conflits (US5)

Sur deux appareils hors-ligne, sortir une bouteille de la même fiche ⇒ après sync, quantité −2 ; modifier la même note des deux côtés ⇒ la plus récente gagne et un avis s'affiche.

## 8. Performance et accessibilité (SC-004, SC-007)

Jeu de 500 fiches : tri/filtre/recherche < 0,5 s perçu ; aucun défilement horizontal ni zoom sur iPhone ; contraste AA ; mode sombre.
