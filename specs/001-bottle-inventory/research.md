# Research — Inventaire de la cave

Aucun `NEEDS CLARIFICATION` ne subsiste. Un point reste à **vérifier sur appareil** (§3) et un à **vérifier sur la feuille réelle** (§4).

## 1. Stack front

- **Decision**: TypeScript + Vite, DOM natif (petits modules), SVG inline pour le schéma de cave.
- **Rationale**: ~8 écrans, aucun état complexe ; zéro runtime de framework ; build statique pour GitHub Pages ; typage utile pour le schéma de données et la synchronisation.
- **Alternatives**: JS sans build (pas de PWA/tests aisés) ; Preact/Svelte (utile mais surdimensionné au démarrage, réintroductible sans douleur car `domain/` est indépendant de l'UI).

## 2. Hébergement et installation

- **Decision**: GitHub Pages (workflow GitHub Actions), PWA (manifest, icônes, Service Worker) ajoutée à l'écran d'accueil.
- **Rationale**: demandé par l'utilisateur ; gratuit ; HTTPS requis pour le Service Worker et la caméra.
- **Alternatives**: packaging natif (Capacitor) — hors priorité.

## 3. Authentification et autorisation

- **Decision**: Google Identity Services, *token model* (jeton d'accès, portée Sheets + email). Les deux comptes autorisés sont ceux avec lesquels la feuille est partagée ; un compte non partagé reçoit 403 de l'API → écran « accès refusé » (FR-017, SC-006).
- **Rationale**: aucun backend, aucun mot de passe, aucun secret ; la feuille est l'autorité d'accès.
- **Risque**: le jeton dure 1 h, sans refresh token. Le renouvellement silencieux dépend du cookie de session Google, potentiellement non partagé entre Safari et la PWA iOS (ITP). **Atténuation**: toutes les fonctions de lecture/saisie marchent hors-ligne sur le cache ; quand le jeton expire, la synchronisation s'arrête avec un bandeau « Reconnecter » (un tap) ; la file d'attente n'est jamais perdue. **À valider** sur iPhone (quickstart §6) ; si inacceptable, repli : relais Apps Script étendu à la lecture/écriture de la feuille (compte propriétaire), avec contrôle d'email.
- **Alternatives**: flux « code » avec secret (nécessite un backend) ; lien secret (rejeté en clarification).

## 4. Données : structure de la feuille

- **Decision**: l'onglet d'origine est **conservé tel quel** (lecture seule pour l'application, jamais modifié). L'import crée des fiches dans des onglets normalisés propres à l'application (`contracts/sheet-schema.md`), avec référence à la ligne d'origine (`legacy_ref`). Après import, les onglets applicatifs font foi.
- **Rationale**: le modèle « une fiche, N emplacements, sorties, cave configurable » ne tient pas dans un tableau plat ; préserver l'onglet d'origine garantit FR-004b (aucune ligne modifiée).
- **À vérifier**: la feuille est privée (HTTP 401 depuis ici) ; ses colonnes réelles n'ont pas pu être relues. Première tâche : exporter les en-têtes (ou partager un CSV) pour finaliser la table de correspondance de l'import.
- **Alternatives**: étendre l'onglet d'origine par colonnes (impossible pour N emplacements/sorties sans doublonner) ; une seule feuille dénormalisée (conflits de quantité ingérables).

## 5. Synchronisation et conflits

- **Decision**: copie locale + **outbox d'opérations** (`create`, `patch`, `qty_delta`, `move`, `delete`), appliquées à la feuille dans l'ordre, chacune avec `op_id` enregistré dans un onglet **Journal** (idempotence en cas d'interruption, audit). Lignes avec `id` (UUID), `rev`, `updated_at`, suppression logique.
  - `qty_delta` : relit la quantité courante, applique le delta (plancher 0, avec avertissement) → deux sorties sur deux appareils se cumulent (FR-016).
  - `patch` : si le champ a changé côté feuille depuis `base_rev`, la modification la plus récente gagne (`updated_at`) et un avis « remplacé » est conservé (FR-016).
  - Pull : `batchGet` des onglets, comparaison par `rev`, puis rejouage de l'outbox par-dessus.
- **Rationale**: Sheets n'a ni transaction ni verrou ; pour 2 utilisateurs, lecture-puis-écriture avec `rev` est suffisante ; les deltas évitent les écrasements de stock.
- **Limite assumée**: deux écritures dans la même seconde sur la même ligne peuvent se croiser ; probabilité négligeable à deux utilisateurs, détectée au pull suivant par `rev`.
- **Alternatives**: CRDT (disproportionné) ; dernier-écrit-gagne global (perte de sorties).

## 6. Lecture d'étiquette

- **Decision**: la lecture est faite **hors de l'application** par un **projet Claude** du compte Claude classique de l'utilisateur (aucune clé d'API, aucun relais, aucun backend). Le projet contient des consignes (`claude-project/INSTRUCTIONS.md`) : lire l'étiquette, produire une proposition au format `contracts/label-proposal.md`, ne jamais inventer un champ, proposer des mises à jour de fiches existantes. Trois canaux au choix de l'utilisateur, convergeant vers le même écran de validation :
  1. **Dépôt dans la feuille** : si le compte Claude dispose d'un connecteur Google Sheets en écriture, Claude ajoute une ligne à l'onglet `Propositions` ; l'application l'affiche à la prochaine synchro.
  2. **JSON collé** : Claude rend un bloc JSON ; bouton « Coller depuis Claude » dans l'application.
  3. **Saisie manuelle** : formulaire seul (photo facultative pour la miniature).
- **Rationale**: pas de clé d'API disponible ; supprime le relais Apps Script et l'exception à la constitution (principe I) ; aucune clé ni service tiers dans l'application (principe V) ; l'utilisateur garde la main (rien n'est créé sans validation).
- **Hors-ligne**: l'application reste utilisable (saisie manuelle, photo conservée pour la miniature). La proposition Claude est naturellement asynchrone (elle nécessite le réseau de l'app Claude) ; elle attend dans l'onglet `Propositions` ou dans le presse-papiers jusqu'à validation (FR-001a).
- **À valider**: (a) disponibilité d'un connecteur Google Sheets **en écriture** sur le compte Claude (canal 1) — sinon canal 2 seul ; (b) fiabilité du format JSON produit par le projet (tâche d'évaluation T081, SC-002).
- **Alternatives**: relais Apps Script + API (clé indisponible) ; OCR embarqué Tesseract.js (qualité/poids) ; clé dans le navigateur (viole le principe V).

## 7. Miniatures d'étiquettes

- **Decision**: miniature JPEG ~240 px, qualité 0,6 (≈ 10–20 Ko), encodée en base64 dans un onglet `Photos` (une ligne par fiche, découpage en segments de 40 000 caractères si nécessaire). Chargement paresseux et mise en cache IndexedDB.
- **Rationale**: tient dans la feuille (limite de 50 000 caractères par cellule), reste privée, aucun autre service (principe IV).
- **Alternatives**: Google Drive (portée supplémentaire, second point d'autorisation) ; photo pleine qualité (rejetée en clarification).

## 8. Recherche, tri, filtre

- **Decision**: en mémoire sur la copie locale ; normalisation sans accents/casse ; index simple concaténant domaine, cuvée, appellation, millésime, lieu.
- **Rationale**: ≤ 1 000 fiches ; < 100 ms trivial ; pas de dépendance.

## 9. Tests

- **Decision**: Vitest ; `domain/` en tests unitaires ; `sync-engine` en tests de contrat contre une fausse API Sheets en mémoire (deltas concurrents, LWW, reprise après interruption, idempotence du Journal) ; import testé avec un échantillon CSV de la feuille réelle.
- **Rationale**: constitution (workflow) : la logique de parsing, tri/filtre et file de synchronisation doit être testée automatiquement.

## 10. Design

- **Decision**: jetons CSS (couleur, typographie, espacement, rayon) ; palette sobre (neutres + un accent bordeaux), thèmes clair/sombre via `prefers-color-scheme`, contraste AA, `env(safe-area-inset-*)`, cibles ≥ 44 px, animations discrètes (réduites si `prefers-reduced-motion`). Schéma de cave en SVG interactif (meubles → étagères tactiles avec compteur de bouteilles).
