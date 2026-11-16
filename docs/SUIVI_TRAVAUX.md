# Suivi des travaux — reprise DSI

> Fichier de reprise : à mettre à jour à chaque étape. Branche : `feature/dsi-handover`.
> Contrainte : aucune action sur le projet Supabase de production (`chtwyqanehlehvpruego`), aucun push.

## Décisions structurantes

| # | Décision | Raison |
|---|---|---|
| D1 | Appels IA uniquement côté serveur (routes `/api/*` TanStack Start, runtime Node sur Vercel) | Les clés `VITE_*` étaient embarquées dans le bundle navigateur |
| D2 | Nouvelles tables préfixées (`prompt_templates`, `workflow_definitions`…) | Les tables `prompts`/`workflows` citées dans CLAUDE.md existent peut-être en prod avec un schéma inconnu : pas de collision |
| D3 | Migrations testées sur PGlite (Postgres WASM) avec un stub du schéma `auth` Supabase | Pas de Docker sur le poste → pas de `supabase start` |
| D4 | Conversations existantes basculées en `private` | Comportement protecteur demandé ; aucune suppression |
| D5 | Secrets jamais en base : `secret_ref` = nom d'une variable d'environnement serveur autorisée (`CHANTAL_SECRET_*` ou liste blanche) | Pas de gestionnaire de secrets imposé ; la DSI peut brancher Vercel env / Vault |
| D6 | Exécution des workflows synchrone dans la requête serveur, étapes persistées, idempotence par clé | Vercel Functions jusqu'à 300 s ; worker optionnel documenté |

## État d'avancement

- [x] Analyse du dépôt et diagnostic
- [x] Migrations + harnais de test PGlite (`npm run test:db`, 29 tests verts)
- [ ] Couche serveur (auth, permissions, adaptateurs IA, usage)
- [ ] Chat privé / partage
- [ ] Favoris + activité récente
- [ ] Prompts versionnés
- [ ] Workflows
- [ ] Reporting
- [ ] Administration (catalogue modèles, utilisateurs, audit…)
- [ ] Préparation SSO
- [ ] Tests / lint / build
- [ ] Documentation DSI

## Journal

- 2026-11-16 : branche créée, diagnostic posé.
- 2026-11-16 : migrations 20261116000100→000900 écrites et testées (RLS, gardes, versions, reporting, provisioning). Pièges notés : fonctions de garde en SECURITY INVOKER (sinon current_user=postgres), policy SELECT conversations inline (INSERT…RETURNING).
