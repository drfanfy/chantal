# CHANTAL — portail IA interne QUARTUS

Chat IA multi-fournisseurs, partenaires et agents, bibliothèque de prompts versionnée, workflows administrables, formations et reporting d'usage.

Stack : React 19 · TypeScript · TanStack Start (Nitro → Vercel) · Supabase (Postgres/RLS, Auth, Storage) · Tailwind/shadcn.

```bash
npm ci && cp .env.example .env   # compléter .env (projet Supabase de développement)
npx supabase link --project-ref <ref-dev> && npx supabase db push
npm run dev
npm test && npm run typecheck && npm run build
```

> État : **prêt dans le code, non validé dans l'environnement QUARTUS** (migrations non appliquées, SSO et appels IA réels non testés). Voir [10 — Recette et livraison](docs/10-recette-et-livraison.md).

## Documentation de reprise

1. [Démarrage rapide](docs/01-demarrage-rapide.md)
2. [Architecture](docs/02-architecture.md)
3. [Fonctionnement métier](docs/03-fonctionnement-metier.md) — rôles et permissions, confidentialité, prompts, workflows, reporting, rétention
4. [Intégrations IA](docs/04-integrations-ia.md) — modèles retenus, adaptateurs, ajout d'un fournisseur
5. [SSO](docs/05-sso.md) — paramètres DSI, URI, rattachement des comptes, bascule et retour arrière
6. [Migration](docs/06-migration.md) — sauvegarde, application, contrôles, retour arrière
7. [Exploitation](docs/07-exploitation.md) — déploiement, secrets, logs, quotas, incidents
8. [Guide administrateur](docs/08-guide-administrateur.md)
9. [Reprise par les développeurs](docs/09-reprise-developpeurs.md) — conventions, extensions, dette
10. [Recette et livraison](docs/10-recette-et-livraison.md) — tests exécutés, scénarios, checklist « À configurer par la DSI »

Annexes : [vérification des modèles IA (16/11/2026)](docs/annexes/verification-modeles-2026-11-16.md) · [suivi des travaux](docs/SUIVI_TRAVAUX.md) · [variables d'environnement](.env.example)
