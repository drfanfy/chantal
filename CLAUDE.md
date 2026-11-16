# CHANTAL — Contexte projet Claude Code

## C'est quoi CHANTAL

Portail IA interne de **QUARTUS** (groupe immobilier) : centraliser les usages IA de l'entreprise.
Version de reprise DSI sur la branche `feature/dsi-handover` : **prête dans le code, non validée dans l'environnement QUARTUS**.
Documentation complète : `README.md` → `docs/01…10`. État de reprise : `docs/SUIVI_TRAVAUX.md`.

Projet Supabase du POC (production) : `chtwyqanehlehvpruego` — **ne jamais y appliquer de migration ni y écrire sans validation explicite**. Développer sur un projet Supabase distinct.

---

## Stack technique (réelle)

- React 19 + TypeScript strict + TanStack Router/Start 1.168 + Vite 7 + Tailwind 4 + shadcn/ui
- Serveur : routes TanStack Start `src/routes/api.*.ts` (`server.handlers`), Nitro `preset: "vercel"` (`vite.config.ts`), fonctions Node 300 s
- Supabase : Postgres + RLS (source de vérité des droits), Auth (mot de passe en dev, SSO SAML/OIDC préparé), Storage (`chat-files` privé, `avatars` public)
- IA : passerelle serveur `src/server/ai/gateway.ts` ; adaptateurs `anthropic` (SDK officiel), `openai`, `openai_compatible`, `google`, `mock` (tests uniquement)
- Tests : Vitest + PGlite (`tests/db`), unitaires (`tests/unit`)

## Commandes

```bash
npm run dev | npm run build | npm run typecheck | npm test | npm run test:db | npm run test:unit | npm run lint
```

## Règles impératives

- **Aucun secret dans une variable `VITE_*`** (envoyée au navigateur). Clés IA côté serveur uniquement ; en base, seulement le NOM de la variable (`secret_ref`, liste blanche `src/server/env.ts`).
- Tout appel IA passe par `runCompletion` (passerelle) : pas de bascule silencieuse de modèle, un événement d'usage par requête.
- Droits appliqués en base (RLS / triggers / RPC) ou en route serveur (`requireUser(request, permission)`) — l'UI ne fait qu'adapter l'affichage. Matrice : `src/lib/permissions.ts` = table `role_permissions` (test de cohérence).
- Conversations **privées par défaut** ; partage explicite ; aucun accès admin automatique aux conversations privées.
- Migrations : nouvelles, versionnées `AAAAMMJJHHMMSS_nom.sql`, idempotentes, non destructives ; testées par `npm run test:db`. Gardes en `SECURITY INVOKER` (voir docs/09).
- Composants définis **hors** des autres composants ; logique métier dans `src/lib` / `src/server` ; style sobre (Notion/Linear) ; `console.error` uniquement sur vraies erreurs.
- Commandes shell : éviter les accents graves dans des chaînes entre guillemets doubles (substitution de commande) — utiliser l'outil d'écriture de fichiers.

## Rôles

`super_admin` > `admin` > `beta_tester` > `viewer` (détail : docs/03). Catalogue IA, modération, paramètres, mapping SSO : `super_admin` uniquement.

## Routes

| Route | Description |
|---|---|
| `/home` | Accueil : recommandations, favoris (base), activité récente |
| `/chat`, `/chat/$id` | Chat (Mes conversations / Partagées) |
| `/app` | Workflows, Prompts, Partenaires, Formations, Reporting (selon `viewMode`) |
| `/admin` | Back-office (utilisateurs, modèles IA, agents, partenaires, prompts, workflows, paramètres, audit) |
| `/tickets` | Tickets support (`ticket.manage`) |
| `/login`, `/auth/callback` | Connexion mot de passe / SSO (PKCE) |
| `/api/*` | Routes serveur (voir docs/02) |

## Variables d'environnement

Voir `.env.example` (complet, sans secret). Serveur : `SUPABASE_SERVICE_ROLE_KEY`, clés fournisseurs, `CRON_SECRET`, `AI_ALLOWED_HOSTS`, `WORKFLOW_HTTP_ALLOWED_HOSTS`… Client : `VITE_SUPABASE_*`, `VITE_AUTH_*`, `VITE_APP_ENV`.

## Volontairement fictif / démonstration

- Prompts et workflows repris du POC : marqués « Exemple » (`is_demo`) ; workflows en brouillon.
- Reporting : données réelles ; mode démo isolé (`app_settings.reporting_demo_mode`, désactivé par défaut).
- Fournisseur `mock` : tests/démo, jamais en production.

## Prompts (TopNav) — comportement conservé

- Choix d'un prompt → saisie des variables → pré-remplissage du chat (`usePromptPrefill`) ; conversation en lecture seule ou hors `/chat` → nouveau chat puis prefill via `requestAnimationFrame`.
- Utilisation tracée avec la version exacte (`record_prompt_usage`).

## Dette connue

Voir `docs/09-reprise-developpeurs.md#dette-restante` (formations : sauvegarde qui perd la progression ; vérification navigateur ; Gemini à valider ; cron Vercel à vérifier).
