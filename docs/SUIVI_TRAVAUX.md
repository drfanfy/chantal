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
- [x] Couche serveur (auth, permissions, adaptateurs IA, usage, chat SSE, moteur workflows, routes /api/*) — 35 tests unitaires
- [x] Chat privé / partage (serveur SSE, PJ réellement transmises, partage confirmé, onglets Mes/Partagées, modération)
- [x] Favoris + activité récente (base, import localStorage sur accord explicite, pagination)
- [x] Prompts versionnés (utilisateur + admin : brouillon/publication/historique/restauration)
- [x] Workflows (catalogue, formulaire, progression réelle, historique, relance ; admin : éditeur, test, publication)
- [x] Reporting réel (RPC, filtres, export CSV, coûts estimés datés, mode démo isolé)
- [x] Administration (utilisateurs, modèles/connexions/tarifs, agents, partenaires, prompts, workflows, paramètres, audit)
- [x] Préparation SSO (login SAML/OIDC configurable, callback PKCE, comptes en attente, invitations, mapping groupes, rattachement explicite)
- [x] Tests (64) / typage / build OK — lint : 1 erreur héritée dans src/components/ui/chart.tsx (shadcn, @ts-nocheck)
- [ ] Documentation DSI

## Journal

- 2026-11-16 : branche créée, diagnostic posé.
- 2026-11-16 : migrations 20261116000100→000900 écrites et testées (RLS, gardes, versions, reporting, provisioning). Pièges notés : fonctions de garde en SECURITY INVOKER (sinon current_user=postgres), policy SELECT conversations inline (INSERT…RETURNING).
- 2026-11-16 : couche serveur src/server/* + routes src/routes/api.*.ts ; build OK, aucun code serveur dans le bundle client. Prochaine étape : refonte client (chat, accueil, prompts, workflows, reporting, admin, login).
- 2026-11-16 : client refondu + back-office complet ; .env.example ; vercel.json (cron maintenance). Développement terminé.

## Reste à faire (prochaine session)

1. **Documentation DSI** (docs/01…10 + lien depuis README) — non commencée. Seule l'annexe docs/annexes/verification-modeles-2026-11-16.md existe.
2. **Vérification navigateur** : nécessite un projet Supabase de DEV avec les migrations appliquées (`npx supabase link` sur un projet dédié puis `npx supabase db push` — jamais la prod).
3. Points connus :
   - sauvegarde des formations : supprime/recrée les chapitres (perte de progression) — à corriger ;
   - cron Vercel déclaré dans vercel.json : prise en compte avec la sortie Nitro (Build Output API) à vérifier ;
   - adaptateur Google : `?alt=sse`, `systemInstruction` à valider par un test réel ;
   - lint : 1 erreur héritée dans src/components/ui/chart.tsx (`@ts-nocheck` shadcn).
4. Déploiement : sauvegarde de la base prod → migrations → variables serveur Vercel → test des modèles → activation. Jamais sans validation explicite.

## Incident de session

- 2026-11-16 : une commande de mise à jour de ce fichier a déclenché par erreur `npx supabase db push` (substitution shell). La commande a échoué immédiatement (sous-commande invalide, aucun projet lié — vérifié : « Cannot find project ref »). Aucun effet sur une base.
