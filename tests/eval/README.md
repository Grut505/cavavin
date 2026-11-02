# Évaluation de la lecture d'étiquettes (SC-002)

Objectif : au moins **70 %** des propositions du projet Claude ont **domaine et millésime corrects**
sur des étiquettes lisibles.

## Protocole (manuel)

1. Choisir ~20 bouteilles réelles aux étiquettes variées (français/étranger, calligraphie, NV).
2. Noter la **vérité terrain** (domaine, millésime) dans `labels.md` (tableau ci-dessous), hors dépôt
   si les photos sont personnelles : seules les valeurs textuelles sont consignées ici.
3. Pour chaque photo : l'envoyer au projet Claude (`claude-project/INSTRUCTIONS.md`), récupérer la
   proposition, la comparer à la vérité terrain.
4. Un cas est **réussi** si domaine ET millésime sont corrects (la casse et les accents ne comptent pas).
5. Calculer le taux ; s'il est < 70 %, ajuster les consignes (exemples, règles de lecture) et recommencer.

## Grille de résultats (`labels.md`)

| # | Domaine attendu | Millésime attendu | Domaine proposé | Millésime proposé | OK ? |
|---|---|---|---|---|---|
| 1 | | | | | |
