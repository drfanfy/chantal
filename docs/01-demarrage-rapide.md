# 01 — Démarrage rapide

> Statut : **prêt dans le code**. Le parcours complet dans un navigateur n'a pas encore été validé sur un projet Supabase QUARTUS (voir [10-recette-et-livraison.md](10-recette-et-livraison.md)).

## Prérequis

| Outil | Version constatée | Remarque |
|---|---|---|
| Node.js | 26.x (Node ≥ 22 recommandé) | `node -v` |
| npm | 11.x | lockfile `package-lock.json` (le fichier `bun.lockb` est un vestige Lovable, non maintenu) |
| CLI Supabase | 2.101.0 (devDependency, `npx supabase`) | aucune installation globale nécessaire |
| Docker | facultatif | requis uniquement pour `npx supabase start` (base locale) |
| Projet Supabase de **développement** | — | jamais le projet de production pour le développement |

## Installation

```bash
git clone <dépôt> chantal && cd chantal
git checkout feature/dsi-handover
npm ci
cp .env.example .env      # puis compléter (voir ci-dessous)
```

## Configuration minimale (`.env`)

Le détail de chaque variable est dans [`.env.example`](../.env.example). Minimum pour un poste de développement :

```dotenv
VITE_SUPABASE_URL=https://<projet-dev>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon/publishable du projet dev>
SUPABASE_URL=https://<projet-dev>.supabase.co
SUPABASE_ANON_KEY=<idem>
SUPABASE_SERVICE_ROLE_KEY=<clé service_role du projet dev>   # SECRET, jamais VITE_
APP_ENV=development
VITE_APP_ENV=development
VITE_AUTH_PASSWORD_ENABLED=true
# Au moins une clé fournisseur pour tester un modèle réel, par exemple :
ANTHROPIC_API_KEY=<clé>
```

Règle absolue : **une variable préfixée `VITE_` est envoyée au navigateur.** Aucune clé secrète ne doit porter ce préfixe. En développement, `vite.config.ts` copie les autres variables du `.env` dans `process.env` pour les routes `/api/*`.

## Base de données (projet de développement)

```bash
npx supabase login                      # interactif, une fois
npx supabase link --project-ref <ref-projet-dev>
npx supabase db push                    # applique supabase/migrations/* dans l'ordre
```

Si la CLI réclame un fichier `supabase/config.toml`, lancez d'abord `npx supabase init` : cela crée un fichier local sans effet sur la base.

Bucket de stockage : la migration `20261116000200_conversations_privacy.sql` crée ou rend privé le bucket `chat-files`. Le bucket `avatars`, public, utilisé pour les avatars d'agents et de partenaires, doit exister. Créez-le dans la console Supabase s'il est absent.

## Premier administrateur

Aucune inscription libre n'est possible : un compte inconnu est créé **inactif**. Pour obtenir un premier super administrateur sur un projet vierge :

1. Supabase › Authentication › Users › *Add user* (e-mail et mot de passe).
2. Supabase › SQL Editor :

```sql
update public.profiles set role = 'super_admin', is_active = true,
       provisioning_source = 'admin' where email = 'prenom.nom@quartus.fr';
```

Les comptes suivants se créent depuis **Admin › Utilisateurs**, par invitation ou par mot de passe temporaire.

## Lancement

```bash
npm run dev          # ouvrir l'URL locale affichée dans le terminal
```

Ensuite :
1. Admin › **Modèles IA** › connexion « Anthropic » : cochez « Connexion activée ».
2. Sur un modèle, par exemple Claude Sonnet 5.5, cliquez sur **Tester**, puis passez le statut à **Actif**.
3. Le modèle est alors proposé dans le chat.

## Vérifications

```bash
npm run typecheck    # TypeScript strict
npm test             # 64 tests (base PGlite + unitaires), aucun accès réseau ni Supabase requis
npm run build        # génère .vercel/output (Nitro, preset vercel)
npm run lint         # 1 erreur connue et héritée : src/components/ui/chart.tsx (@ts-nocheck shadcn)
```

## Arborescence utile

| Chemin | Contenu |
|---|---|
| `src/routes/` | pages (`*.tsx`) et routes API serveur (`api.*.ts`) |
| `src/server/` | code exclusivement serveur (passerelle IA, chat, workflows, auth) |
| `src/lib/` | code partagé et client (permissions, schémas, hooks) |
| `src/components/admin/` | back-office |
| `supabase/migrations/` | schéma versionné |
| `tests/db`, `tests/unit` | tests |
| `docs/` | cette documentation ; `docs/SUIVI_TRAVAUX.md` = état de reprise |
