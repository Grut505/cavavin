# Tasks: Accès renforcé

- [X] T001 [US1] Liste d'adresses autorisées : `src/auth/google-auth.ts` (`parseAllowedEmails`, `isEmailAllowed`, contrôle à la connexion, `enforceAllowlist` à l'ouverture), `sign-in.ts`, `main.ts`, variable `VITE_ALLOWED_EMAILS` (workflow, `.env.example`, README)
- [X] T002 [US2] Verrou WebAuthn : `src/auth/app-lock.ts`, `src/ui/components/lock-screen.ts`, `lock-settings.ts` (Réglages), sortie de secours (`main.ts`)
- [X] T003 Tests : `tests/unit/access.test.ts`
- [ ] T004 Vérifier sur iPhone (app installée) que Face ID se déclenche et que le reverrouillage après 1 minute fonctionne (SC-003)
