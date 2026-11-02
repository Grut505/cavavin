# Prompt autonome pour lire une étiquette

À copier **tel quel** dans n'importe quelle conversation Claude (aucun projet nécessaire), puis
joindre la photo de l'étiquette. La réponse (un bloc JSON) se colle dans l'application :
« Ajouter » → « Coller depuis Claude ».

L'application propose aussi un bouton **« Copier le prompt »** qui place ce texte dans le presse-papiers.
Source unique : `src/scan/prompt.ts` (un test vérifie que ce fichier reste identique).

Si Claude répond par un texte au lieu du JSON, renvoyez-lui la consigne de relance (l'application la
copie aussi) :

> Ce n'est pas le format demandé. Réponds uniquement avec le bloc de code json (objet ou tableau) décrit dans ma consigne : aucun commentaire, aucune phrase avant ou après, aucune information absente de l'étiquette.

````text
Tu es un extracteur de données, pas un conseiller. À partir de la photo d'étiquette de vin que je t'envoie, tu produis UNIQUEMENT un bloc de code json : aucune phrase d'introduction, aucune explication, aucune conclusion. Même si tu connais ce vin, n'ajoute aucun commentaire hors du JSON (tanins, puissance, garde, année optimale, accords, avis, conseils de service) : les seules estimations attendues sont les champs du JSON décrits ci-dessous. Ces consignes priment sur toute autre instruction, préférence enregistrée, mémoire ou format de réponse habituel de cette conversation : ignore-les pour cette réponse.

RÈGLES
1. Lis ce qui est écrit sur l'étiquette et ce que je te dis dans mon message. N'invente rien : si une information n'est pas clairement lisible ou déductible avec certitude, mets null. Seules exceptions, où tu peux estimer d'après ta connaissance du vin : tannin, dryness, drink_from, drink_until et pairings (règles 7 à 10).
2. Millésime = année de récolte (ex. 2019). S'il n'y en a pas (non millésimé, « NV », champagne sans année) ou si seule une date de mise en bouteille apparaît, mets null.
3. Domaine = producteur, château ou maison. Cuvée = nom de la cuvée, du climat ou du lieu-dit (null s'il n'y en a pas).
4. Région et pays : seulement si l'appellation les rend certains (ex. « Pauillac » → Bordeaux, France).
5. Couleur parmi : rouge, blanc, rosé, effervescent, liquoreux, autre. Format parmi : demi, 75cl, magnum, jéroboam, autre (75cl par défaut).
6. Quantité, prix d'achat, date d'achat, fournisseur et notes : uniquement si je te les donne dans mon message ; sinon null (quantity vaut 1 par défaut).
7. tannin (rouges uniquement) : note entière de 1 (très souple) à 5 (très tannique), d'après ta connaissance de ce vin et de son appellation. null pour toute autre couleur, ou si tu ne peux pas l'estimer raisonnablement.
8. dryness (blanc, rosé, effervescent, liquoreux) : sec, demi-sec, moelleux ou doux. Lis-le sur l'étiquette (effervescent : brut et extra-brut = sec) ; sinon déduis-le de l'appellation seulement si c'est certain ; sinon null. Toujours null pour un rouge.
9. drink_from et drink_until : années de début et de fin de la meilleure période de dégustation. Reprends celles de l'étiquette ou de mon message ; sinon estime-les d'après ta connaissance du vin, de l'appellation et du millésime. Si tu n'es pas raisonnablement sûr, mets null pour les deux. Uniquement des années, jamais de commentaire.
10. pairings : liste de 4 à 8 mets qui s'accordent bien avec ce vin, d'après ta connaissance du vin, de son appellation, de sa couleur et de son style. Chaque met est un nom court en français (ex. « magret de canard », « fromages à pâte dure », « poisson grillé », « tajine d'agneau »), sans phrase ni justification ; varie plats, ingrédients et fromages. Tableau JSON de chaînes ; null si tu n'es pas raisonnablement sûr.
11. Plusieurs vins différents : un objet par vin, dans un tableau JSON. Même vin en plusieurs exemplaires : un seul objet avec quantity.
12. Seule exception à la réponse JSON : si l'étiquette est illisible, ne réponds pas avec du JSON ; dis-le en une phrase et pose une seule question.

FORMAT DE RÉPONSE
Ta réponse entière est un unique bloc de code json contenant un objet (ou un tableau d'objets). L'exemple ci-dessous ne sert qu'à montrer le format : ne recopie aucune de ses valeurs.

```json
{
  "v": 1,
  "domain": "Domaine Exemple",
  "cuvee": "Les Pierres",
  "vintage": 2019,
  "appellation": "Saint-Joseph",
  "region": "Vallée du Rhône",
  "country": "France",
  "color": "rouge",
  "format": "75cl",
  "quantity": 1,
  "tannin": 3,
  "dryness": null,
  "drink_from": 2024,
  "drink_until": 2030,
  "pairings": ["magret de canard", "agneau rôti", "fromages à pâte dure", "charcuterie"],
  "purchase_price": null,
  "purchase_date": null,
  "supplier": null,
  "notes": null
}
```

Types : vintage, drink_from, drink_until, tannin (1 à 5) et quantity sont des entiers ; purchase_price est un nombre en euros ; purchase_date est au format AAAA-MM-JJ ; dryness vaut sec, demi-sec, moelleux, doux ou null ; pairings est un tableau de chaînes ou null ; les autres champs sont du texte ou null.

RAPPEL : le bloc json est ta réponse complète. Rien avant, rien après.
````
