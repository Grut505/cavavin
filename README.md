# Cavavin

Inventaire de cave à vin : PWA statique (TypeScript + Vite) hébergée sur GitHub Pages. Les données
vivent dans **votre Google Sheet**, lue et écrite depuis le navigateur ; une copie locale (IndexedDB)
rend l'application utilisable hors-ligne, et les modifications sont synchronisées au retour du réseau.
Aucun serveur, aucune clé d'API.

Spécification, plan et contrats : [`specs/001-bottle-inventory/`](specs/001-bottle-inventory/).

## Installation

Prérequis : Node ≥ 20.

```bash
npm install
cp .env.example .env.local   # puis renseigner les deux variables ci-dessous
npm run dev                  # http://localhost:5173
```

Commandes : `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | ID client OAuth « Application Web » (public par nature) |
| `VITE_SHEET_ID` | Identifiant de la feuille (entre `/d/` et `/edit` dans l'URL) |
| `VITE_BASE` | Chemin de base (fixé par le workflow de déploiement : `/<nom-du-dépôt>/`) |

En local : `.env.local` (ignoré par git). En production : **Repository variables** GitHub
(*Settings → Secrets and variables → Actions → Variables*), lues au moment du build.

## Google Cloud (une seule fois)

1. Activer l'API **Google Sheets** dans le projet.
2. Écran de consentement : type *External*, mode *Testing*, ajouter les comptes utilisateurs en *Test users*
   (scopes `spreadsheets` et `userinfo.email`). En mode Testing, le consentement expire au bout de 7 jours.
3. Créer un **OAuth client ID** de type *Web application* avec les origines JavaScript autorisées
   `http://localhost:5173` et `https://<utilisateur>.github.io` (sans chemin ni slash final).
4. Partager la feuille en édition avec chaque compte autorisé : un compte non partagé obtient « Accès refusé »
   et ne voit aucune donnée.

## Déploiement GitHub Pages

*Settings → Pages → Source : GitHub Actions*. Chaque push sur `main` lance
[`deploy.yml`](.github/workflows/deploy.yml) : lint, tests, build, déploiement. Après un changement de
variables, relancer le workflow (*Run workflow*) : elles sont figées au build.

Les données locales sont propres à chaque **origine** (`localhost` et `github.io` ont chacun leur base) :
saisir sur l'une puis synchroniser pour les retrouver sur l'autre.

## Projet Claude (lecture d'étiquettes)

La lecture d'étiquette se fait hors de l'application, dans un projet de votre compte Claude, qui produit
des propositions que vous validez. Mise en place : [`claude-project/README.md`](claude-project/README.md).

## Ajouter des colonnes à la feuille

L'application lit par **nom d'en-tête**, pas par position : ajoutez vos propres colonnes **à droite**,
elles sont ignorées et jamais écrasées. L'onglet d'origine n'est jamais modifié. Les évolutions du schéma
(ajout de colonnes ou d'onglets, rétro-compatibles) sont migrées automatiquement à la synchronisation ;
voir [`contracts/sheet-schema.md`](specs/001-bottle-inventory/contracts/sheet-schema.md).

## Session Google

Le jeton d'accès dure environ une heure et n'a pas de refresh token. À l'ouverture, l'application tente un
renouvellement silencieux ; sinon le bandeau **Reconnecter** (un tap) relance la connexion. Les
modifications locales sont conservées et reprennent leur envoi dès la reconnexion.
