# Contrat : proposition de fiche issue du projet Claude

La lecture d'étiquette est faite **hors de l'application**, par un projet Claude du compte Claude de l'utilisateur (consignes dans `claude-project/INSTRUCTIONS.md`). L'application n'appelle aucun service d'IA et ne détient aucune clé. Elle reçoit des **propositions**, par deux canaux techniques, qui partagent le même format.

## Format d'une proposition (version 1)

```json
{
  "v": 1,
  "target_wine_id": null,
  "domain": "Domaine X",
  "cuvee": "Les Y",
  "vintage": 2019,
  "appellation": "Z",
  "region": "Bourgogne",
  "country": "France",
  "color": "rouge",
  "format": "75cl",
  "quantity": 1,
  "purchase_price": null,
  "purchase_date": null,
  "supplier": null,
  "drink_from": null,
  "drink_until": null,
  "tannin": null,
  "dryness": null,
  "pairings": ["magret de canard", "agneau rôti", "fromages à pâte dure"],
  "notes": null,
  "confidence": { "domain": 0.95, "vintage": 0.9 }
}
```

- Tous les champs sauf `v` sont facultatifs ; inconnu = `null` (jamais inventé).
- `color` ∈ rouge, blanc, rosé, effervescent, liquoreux, autre ; `format` ∈ demi, 75cl, magnum, jéroboam, autre.
- `tannin` : entier de 1 (très souple) à 5 (très tannique), **rouges uniquement** ; `null` sinon.
- `dryness` : `sec`, `demi-sec`, `moelleux` ou `doux` (effervescent : brut et extra-brut = `sec`), pour les blancs, rosés, effervescents et liquoreux ; `null` pour un rouge.
- `drink_from` / `drink_until` : fenêtre de dégustation. Le projet Claude peut l'**estimer** d'après sa connaissance du vin (`null` s'il n'est pas raisonnablement sûr). `tannin`, `dryness` et la fenêtre de garde sont les seules estimations permises ; tout le reste vient de l'étiquette ou de l'utilisateur.
- `pairings` (v4, spec 002) : tableau de 4 à 8 mets courts en français qui s'accordent avec le vin (ou texte « a; b » dans la colonne de la feuille), **estimés** par le projet Claude d'après le vin, l'appellation, la couleur et le style ; `null` s'il n'est pas raisonnablement sûr. L'application en fait la base de « Quoi boire ce soir » (recherche tolérante aux fautes). Les estimations permises sont désormais `tannin`, `dryness`, la fenêtre de garde et `pairings`.
- La fenêtre de garde est **obligatoire** pour enregistrer la fiche dans l'application : si la proposition l'omet (`null`), le formulaire la demande.
- `target_wine_id` : si le projet Claude sait quelle fiche existante mettre à jour (id fourni par l'utilisateur ou trouvé dans la feuille), il le renseigne ; sinon l'application détecte le doublon par la clé normalisée (FR-004) et propose « ajouter » / « compléter ».
- Un message peut contenir un objet ou un **tableau** d'objets (plusieurs bouteilles).
- `confidence` est indicatif (aide à l'affichage), jamais bloquant.

## Canal 1 — dépôt dans la feuille (connecteur)

Le projet Claude **ajoute des lignes** à l'onglet `Propositions` (voir `sheet-schema.md`), une par proposition, avec `status = nouvelle` et `source = claude`. Il **n'écrit nulle part ailleurs** et ne modifie jamais une ligne existante. À la prochaine synchronisation, l'application affiche « N propositions à ranger ».

## Canal 2 — JSON collé

Bouton « Coller depuis Claude » : l'application lit le presse-papiers (ou un champ de collage), extrait le JSON (tolère du texte autour et un bloc ```json), valide le format ci-dessus et crée une proposition locale (`source = paste`). Erreur de format ⇒ message clair indiquant le champ fautif ; rien n'est créé.

## Traitement commun

1. Normalisation et validation (mêmes règles que `Wine`, data-model.md) ; valeurs invalides ⇒ champ ignoré avec avertissement.
2. Rapprochement : doublon probable ⇒ choix « ajouter une bouteille » / « compléter la fiche existante » (FR-004) ; pour « compléter », seuls les champs vides ou différents sont proposés, sans écrasement (FR-004a, FR-001a).
3. L'utilisateur choisit l'emplacement (étagère ou lieu) et la quantité, ajuste, puis valide ⇒ opération `proposal_accept` (fiche + stock créés ou complétés, proposition marquée `importée`). « Écarter » ⇒ `proposal_dismiss`.
4. Rien n'est créé ni modifié sans validation explicite.

## Contraintes

- Aucune photo n'est transmise par ce contrat : la miniature est ajoutée à la validation depuis l'appareil photo de l'application (facultatif).
- Aucun secret dans le dépôt ; la seule dépendance externe est le compte Claude de l'utilisateur, hors application.
- Vérifier que le connecteur Google Sheets du compte Claude permet l'écriture (canal 1) ; sinon le canal 2 suffit.
