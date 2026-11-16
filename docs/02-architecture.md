# 02 — Architecture

## Vue d'ensemble

```
Navigateur (React 19, TanStack Router)
   │  supabase-js (jeton utilisateur)            │  fetch /api/* (Authorization: Bearer <jeton>)
   ▼                                             ▼
Supabase PostgREST ── RLS ──► Postgres     Fonctions serveur TanStack Start (Nitro → Vercel Functions, Node)
   ▲                                             │  service_role (après contrôle des droits)
   └─────────────────────────────────────────────┤
                                                 ▼
                                Fournisseurs IA (Anthropic, OpenAI, Google, compatibles OpenAI)
                                Services HTTP externes des workflows (liste blanche)
```

| Composant | Technologie (réelle, constatée dans le dépôt) |
|---|---|
| Interface | React 19, TypeScript strict, TanStack Router/Start 1.168, Tailwind 4, shadcn/ui (Radix), sonner, recharts |
| Serveur | Routes serveur TanStack Start (`server.handlers`), compilées par **Nitro** (`nitro({ preset: "vercel" })` dans `vite.config.ts`) → Vercel Build Output API (`.vercel/output/`), durée max 300 s |
| Données | Supabase : Postgres, RLS, Auth, Storage (`chat-files` privé, `avatars` public) |
| IA | SDK officiel `@anthropic-ai/sdk` 1.3.0 ; API REST documentées pour OpenAI / compatibles et Gemini |
| Tests | Vitest 3.2.4 ; PGlite 0.3.7 (Postgres WASM) pour les migrations et la RLS |

`@cloudflare/vite-plugin` et `wrangler.jsonc` sont des vestiges de l'outil Lovable, non utilisés pour Vercel.

## Frontière client / serveur

| Côté navigateur (public) | Côté serveur uniquement |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_*`, `VITE_APP_ENV` | `SUPABASE_SERVICE_ROLE_KEY`, clés fournisseurs, `CRON_SECRET`, listes blanches réseau |
| Lectures/écritures simples sous RLS (favoris, brouillons de prompts, catalogue…) | Appels IA, exécution des workflows, tests de modèles, création de comptes, publication de workflows, synchronisation SSO, maintenance |

Le build a été contrôlé : aucune référence à `SUPABASE_SERVICE_ROLE_KEY`, aux clés ou aux hôtes des fournisseurs dans `.vercel/output/static`. Le POC appelait les fournisseurs depuis le navigateur avec des clés `VITE_*` ; ce code a été supprimé (`src/lib/groq.ts`, `openai.ts`, `gemini.ts`).

## Routes API (`src/routes/api.*.ts`)

| Route | Méthode | Permission | Rôle (code) |
|---|---|---|---|
| `/api/chat` | POST (SSE) | `chat.use` | `src/server/chat.ts` |
| `/api/ai/models` | GET | utilisateur actif | modèles actifs visibles + état « configuré » |
| `/api/workflows/run` | POST | `workflow.run` | `src/server/workflows/service.ts#startRun` |
| `/api/admin/workflows` | POST `validate`/`test`/`publish` | `workflow.manage` | `service.ts#testDraft/publishDraft` |
| `/api/admin/ai-status` | GET | `model.manage` | `src/server/admin/ai.ts#getAiStatus` |
| `/api/admin/ai-test` | POST | `model.manage` | `src/server/admin/ai.ts#testModel` |
| `/api/admin/users` | GET/POST | `user.manage` | `src/server/admin/users.ts` |
| `/api/auth/session` | POST | jeton valide | `src/server/authSync.ts` |
| `/api/cron/maintenance` | GET | `Authorization: Bearer $CRON_SECRET` | `src/server/maintenance.ts` |

Chaque route : vérification du jeton auprès de Supabase Auth → profil **actif** → permission (`src/server/auth.ts#requireUser`) → validation Zod du corps (`src/server/http.ts#readBody`) → erreurs JSON en français sans détail interne.

## Flux principaux

**Chat** (`POST /api/chat`)
1. Le serveur résout le partenaire et l'agent au nom de l'utilisateur (RLS), puis le modèle via `resolveModel`.
2. Il vérifie que la conversation appartient à l'utilisateur ; sinon, réponse 403 « lecture seule ».
3. Il charge les pièces jointes depuis le Storage et contrôle les capacités du modèle.
4. Il insère le message utilisateur (RLS), puis appelle `runCompletion`, qui renvoie la réponse en SSE.
5. Il enregistre la réponse (service_role) et, si `CHAT_TITLE_MODEL` est défini, génère un titre.

**Workflow** (`POST /api/workflows/run`)
1. Le serveur lit la version publiée (RLS) et valide la définition et les saisies.
2. L'idempotence repose sur `(user_id, idempotency_key)`, et le nombre d'exécutions actives est plafonné.
3. `executeRun` exécute les étapes séquentiellement et persiste chacune dans `workflow_run_steps`.
4. Pendant l'exécution, le client interroge les étapes pour afficher la progression.

**Passerelle IA** (`src/server/ai/gateway.ts`) : point d'entrée unique des appels aux fournisseurs. Elle vérifie le statut du modèle, le rôle, la disponibilité par usage, la connexion et le secret, puis les quotas et la concurrence. Elle applique un délai d'expiration et l'annulation, et enregistre **un** événement d'usage par requête.

## Schéma de données (principales tables)

| Domaine | Tables | Migration |
|---|---|---|
| Existant POC | `profiles`, `conversations`, `messages`, `ai_models`, `agents`, `partners`, `tickets`, `ticket_messages`, `formations`, `formation_chapters`, `formation_progress` | `20240601…` à `20240606…` |
| RBAC / audit / paramètres | `role_permissions`, `admin_audit_log`, `app_settings` ; vue `profile_directory` | `…000100_rbac_audit` |
| Confidentialité | colonnes `conversations.visibility/shared_*/hidden_*/legacy_visibility`, `message_attachments` | `…000200` |
| Catalogue IA | `ai_provider_connections`, colonnes ajoutées à `ai_models`, `ai_model_pricing` | `…000300` |
| Prompts | `prompt_categories`, `prompt_templates`, `prompt_versions`, `prompt_usages` | `…000400` |
| Workflows | `workflow_definitions`, `workflow_versions`, `workflow_http_connections`, `workflow_runs`, `workflow_run_steps` | `…000500` |
| Usage / reporting | `ai_usage_events` ; RPC `report_usage`, `report_usage_rows`, `purge_expired_data` | `…000600` |
| Favoris / activité | `user_favorites` ; RPC `get_my_favorites`, `get_recent_activity`, `import_legacy_favorites` | `…000700` |
| Provisionnement | `user_invitations`, `sso_group_role_mappings` ; trigger `on_auth_user_created` ; RPC `merge_user_accounts` | `…000800` |
| Contenus de démo | 17 prompts publiés et 5 workflows en brouillon (`is_demo = true`) | `…000900` |

Les noms `prompts` et `workflows` mentionnés dans l'ancien `CLAUDE.md` n'ont pas été réutilisés. Le schéma réel de ces tables en production étant inconnu, les nouvelles tables portent des préfixes pour éviter toute collision.

## Décisions structurantes

Les décisions D1 à D6 sont détaillées dans [SUIVI_TRAVAUX.md](SUIVI_TRAVAUX.md) :
- appels IA côté serveur uniquement ;
- tables préfixées ;
- tests sur PGlite ;
- bascule protectrice des conversations ;
- secrets jamais en base ;
- workflows exécutés de façon synchrone avec étapes persistées.
