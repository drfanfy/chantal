# 09 — Reprise par les développeurs

## Conventions

- TypeScript strict, sans `any` (`npm run typecheck`). Le formatage est assuré par Prettier via ESLint (`npm run lint`, `npx eslint --fix`).
- Composants React définis **au niveau module**, jamais à l'intérieur d'un autre composant : cela évite les remontages et les pertes de focus. Le back-office s'appuie sur le kit `src/components/admin/ui.tsx`.
- Logique métier hors de l'interface : `src/lib/*` (partagé) et `src/server/*` (serveur uniquement).
- Langue : interface et messages d'erreur en français.
- `console.error` uniquement sur les erreurs réelles, jamais de journalisation de secret ou de contenu.
- Toute règle d'accès est appliquée **en base** (RLS, triggers, RPC) ou dans une **route serveur**. L'interface ne fait qu'adapter l'affichage (`hasPermission` côté client).
- Fonctions SQL :
  - les **gardes** sont des triggers `SECURITY INVOKER`. Dans une fonction `SECURITY DEFINER`, `current_user` vaut le propriétaire : `is_service_context()` serait alors toujours vrai ;
  - les RPC sensibles sont `SECURITY DEFINER` avec un contrôle explicite (`has_permission`, ou `request_jwt_role()` pour service_role).
- Une policy SELECT évaluée sur `INSERT … RETURNING` ne doit pas dépendre d'une sous-requête sur la table elle-même. Voir `conversations_select`, dont le prédicat est écrit en ligne.
- Migrations : nouvelles, versionnées (`AAAAMMJJHHMMSS_nom.sql`), idempotentes et non destructives. Pour réinitialiser les policies d'une table : `select public._chantal_reset_policies('table')`.

## Structure du code

```
src/
  routes/            pages (TanStack Router, fichiers) et routes API (api.*.ts → server.handlers)
  server/            serveur uniquement : auth.ts, http.ts, env.ts, netGuard.ts, chat.ts, authSync.ts, maintenance.ts
    ai/              gateway.ts (point d'entrée unique), registry.ts, cost.ts, sse.ts, types.ts, adapters/*
    workflows/       executor.ts (exécution), ops.ts (opérations pures), service.ts (lancement, test, publication)
    admin/           ai.ts (statut, tests), users.ts (création / invitation)
  lib/               permissions.ts, api.ts (fetch authentifié + SSE), appContext.tsx, authContext.tsx, authConfig.ts,
                     favorites.tsx, prompts.ts, useAIConfig.ts, useConversation.ts, useRunTracker.ts,
                     workflowsClient.ts, workflows/{schema,template}.ts (partagés client/serveur)
  components/        ChatInterface, ConversationSidebar, HomeDashboard, WorkflowView, PromptsView, AdminDashboard (reporting)…
    admin/           sections du back-office
supabase/migrations/ schéma versionné
tests/db/            harness.ts (PGlite + stub Supabase), security.test.ts, legacy-migration.test.ts
tests/unit/          adaptateurs, passerelle et exécuteur (fakeSupabase.ts), SSRF, coûts, schéma, permissions
```

## Points d'extension

| Besoin | Où intervenir |
|---|---|
| Nouveau fournisseur IA | `src/server/ai/adapters/` + registre (voir [04](04-integrations-ia.md#ajouter-un-fournisseur)) |
| Nouvelle opération de transformation | `TRANSFORM_OPERATIONS` (`src/lib/workflows/schema.ts`) + `runTransform` (`src/server/workflows/ops.ts`) + test |
| Nouveau type d'étape de workflow | schéma (`stepSchema`), `executeRun` (switch), éditeur `StepsEditor` (`WorkflowsSection.tsx`), `RunPanel` (libellé) |
| Nouvelle permission | `src/lib/permissions.ts` **et** nouvelle migration qui insère dans `role_permissions` (le test de cohérence l'exige) |
| Nouvel indicateur de reporting | RPC `report_usage` (nouvelle migration `create or replace`) + `AdminDashboard.tsx` |
| Exécution asynchrone des workflows | appeler `executeRun` depuis un worker (voir [07](07-exploitation.md#traitements-longs-au-delà-de-300-s)) |
| Nouveau type de favori | contrainte `user_favorites.resource_type` + `get_my_favorites` + `FavoriteType` |

## Tests

```bash
npm test            # tout (64 tests, ~10 s ; aucun réseau)
npm run test:db     # migrations + RLS sur PGlite (29 tests)
npm run test:unit   # adaptateurs, passerelle, exécuteur, SSRF, coûts, schéma, permissions (35 tests)
```

- `tests/db/harness.ts` recrée les rôles `anon`, `authenticated` et `service_role`, le schéma `auth` (`auth.uid()` lit `request.jwt.claims`) et applique **toutes** les migrations. `asUser(id, fn)` exécute du SQL avec les droits réels d'un utilisateur.
- `tests/unit/fakeSupabase.ts` est un faux client PostgREST en mémoire, sans RLS, utilisé pour la passerelle et l'exécuteur avec l'adaptateur `mock`.
- Les routes HTTP elles-mêmes et l'interface ne sont pas couvertes par des tests automatisés : il n'y a pas d'outillage E2E.

## Dette restante

| Sujet | Détail | Priorité |
|---|---|---|
| Vérification navigateur | aucun parcours n'a été exécuté contre un vrai projet Supabase | **haute** |
| Formations | `FormationView.saveFormation` supprime puis recrée les chapitres, ce qui perd la progression (`formation_progress` en cascade) ; passer à des mises à jour par `id` | haute |
| E2E | pas de Playwright ; scénarios manuels décrits dans [10](10-recette-et-livraison.md) | moyenne |
| Gemini | `?alt=sse`, `systemInstruction` et les images/PDF à confirmer par un test réel ; Google recommande désormais l'*Interactions API* | moyenne |
| OpenAI PDF | part `file` non activée (forme JSON non vérifiée) | basse |
| Outils (function calling) | non implémentés ; capacité désactivée | basse |
| Workflows longs | pas de file ni de worker (> 290 s impossible) | selon besoin |
| Concurrence | comptée via les événements `started` en base : approximative en cas de forte charge simultanée | basse |
| Paliers tarifaires | « long contexte » non modélisés dans l'estimation | basse |
| Cron Vercel | prise en compte de `vercel.json` avec la sortie Nitro à vérifier | moyenne |
| Lint | `src/components/ui/chart.tsx` (`@ts-nocheck`, fichier shadcn d'origine) | basse |
| Vestiges | `@cloudflare/vite-plugin`, `wrangler.jsonc`, `bun.lockb`, Edge Function `generate-avatar` (HuggingFace) non utilisés ; Edge Function `create-user` remplacée par `/api/admin/users` | basse |
| Tickets | module repris sans refonte (policies explicitées dans `…000100`) | basse |
| Index de recherche | recherche de conversations côté client (200 dernières) | basse |
