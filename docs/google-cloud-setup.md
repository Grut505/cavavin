# Configuration Google Cloud (connexion à la Google Sheet)

L'application se connecte à Google depuis le navigateur (Google Identity Services, jeton d'accès).
Aucun secret n'est nécessaire : seul l'**ID client OAuth** (public par nature) est utilisé.

## 1. Projet et API

1. Console Google Cloud → créer un projet `cavavin` (compte `<ton compte Google>`).
2. « API et services » → « Bibliothèque » → activer **Google Sheets API**.

## 2. Écran de consentement OAuth

1. « Google Auth Platform » / « Écran de consentement OAuth » → type **Externe**.
2. Nom `Cavavin`, e-mail de support.
3. Ajouter comme **utilisateurs de test** : `<ton compte Google>` (et le compte de l'épouse plus tard).
4. Au premier lancement, Google affiche « application non vérifiée » : *Avancé → Continuer* (usage personnel).

## 3. Identifiants

1. « Identifiants » → « Créer des identifiants » → **ID client OAuth** → type **Application Web**.
2. **Origines JavaScript autorisées** :
   - `http://localhost:5173` (développement local)
   - l'URL GitHub Pages une fois déployée (ex. `https://<compte>.github.io`)
3. Laisser vide « URI de redirection autorisés » (flux « jeton » sans redirection).

## 4. Variables d'environnement

Copier `.env.example` vers `.env.local` (ignoré par git) :

```
VITE_GOOGLE_CLIENT_ID=<ID client>.apps.googleusercontent.com
VITE_SHEET_ID=<identifiant de la feuille>
```

Pour le déploiement GitHub Pages, définir les mêmes noms dans
*Settings → Secrets and variables → Actions → Variables* (ce ne sont pas des secrets).

## 5. Partage de la feuille

La feuille doit être **partagée en édition** avec chaque compte autorisé (le sien et celui de
l'épouse). Un compte sans accès recevra « accès refusé » (HTTP 403) : c'est le mécanisme
d'autorisation de l'application.
