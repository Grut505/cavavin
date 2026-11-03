<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-bottle-inventory/plan.md`
<!-- SPECKIT END -->

## État du projet

- Vue d'ensemble, fonctions, variables d'environnement, déploiement : `README.md`. Historique des versions : `CHANGELOG.md`.
- Specs : `specs/001`…`005` (la 005 couvre les évolutions v0.8 → v0.12). Nouvelle évolution → nouvelle spec courte + `tasks.md`.
- Règles de travail : lint (`npm run lint`) et tests (`npx vitest run`, vérifier le **code de sortie**) au vert avant tout push ; incrémenter `version` dans `package.json` à chaque livraison ; une entrée au `CHANGELOG.md`.
- Pas de clé d'API : la lecture d'étiquette passe par un projet Claude (`claude-project/`).
