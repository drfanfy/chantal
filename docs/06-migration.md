# 06 — Migration du POC vers cette version

> **Aucune migration n'a été appliquée** sur le projet Supabase du POC (`chtwyqanehlehvpruego`). Elles ont été testées uniquement sur PGlite (`npm run test:db`), y compris sur un jeu de données POC simulé (`tests/db/legacy-migration.test.ts`).

## Ce que changent les migrations

| Fichier | Effet notable sur une base POC existante |
|---|---|
| `20240601000000_baseline_poc_schema.sql` | Recrée les tables POC **si absentes** (idempotent) ; schéma reconstitué à partir du code |
| `20240605…`, `20240606…` | Migrations POC existantes, **renommées** (versions uniques exigées par la CLI) ; contenu inchangé |
| `20261116000100_rbac_audit.sql` | **Remplace toutes les policies** des tables reprises (POC non versionnées) ; rôles invalides → `viewer` ; contrainte de rôle ; colonnes de profil ; audit ; paramètres |
| `…000200_conversations_privacy.sql` | **Toutes les conversations deviennent privées** (`legacy_visibility` garde l'état POC) ; bucket `chat-files` rendu **privé** |
| `…000300_ai_catalog.sql` | Connexions créées pour les fournisseurs POC ; modèles POC rattachés (statut conservé) ; catalogue initial désactivé |
| `…000400` à `…000700` | Nouvelles tables (prompts, workflows, usage, favoris) |
| `…000800_auth_provisioning.sql` | **Remplace** le trigger `handle_new_user` / `on_auth_user_created` : tout nouveau compte non invité est **inactif** |
| `…000900_demo_content.sql` | Prompts POC publiés (« Exemple ») ; workflows POC en brouillon |

Impacts utilisateurs à annoncer :
- conversations privées par défaut, à re-partager si besoin ;
- les URL publiques des pièces jointes du POC cessent de fonctionner (bucket privé, URL signées) ;
- le modèle `llama-3.1-8b-instant` est arrêté par Groq ;
- les favoris locaux sont importés sur demande.

## 1. Inspection préalable (lecture seule)

Dans le SQL Editor du projet **POC** :

```sql
select count(*) as conversations, count(*) filter (where is_hidden) as masquees from public.conversations;
select role, is_active, count(*) from public.profiles group by 1, 2 order by 1;
select provider, model_id, is_active from public.ai_models order by provider;
select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'storage') order by 2, 3;
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal and tgrelid = 'auth.users'::regclass;
select id, public from storage.buckets;
select * from supabase_migrations.schema_migrations order by version;   -- peut ne pas exister
```

Comparez aussi le schéma réel avec la reconstitution :

```bash
npx supabase link --project-ref chtwyqanehlehvpruego
npx supabase db dump --schema public -f poc-schema.sql      # lecture seule
```

Différences à vérifier :
- colonnes absentes de `20240601000000_baseline_poc_schema.sql` ;
- tables `prompts` / `workflows` existantes, non utilisées par le code ;
- triggers personnalisés.

## 2. Sauvegarde

1. Supabase › Database › Backups : vérifiez la sauvegarde quotidienne et, si l'offre le permet, la restauration à un instant donné (PITR).
2. Faites une sauvegarde logique indépendante :

```bash
npx supabase db dump -f backup-roles.sql --role-only
npx supabase db dump -f backup-schema.sql
npx supabase db dump -f backup-data.sql --data-only
```

3. Exportez le contenu du bucket `chat-files` si nécessaire (console ou API Storage).

## 3. Application sur un projet de DÉVELOPPEMENT / RECETTE

1. Créez un projet Supabase distinct.
2. Optionnel : restaurez-y la sauvegarde du POC (`psql "<url-dev>" -f backup-schema.sql -f backup-data.sql`) pour tester sur des données réelles.
3. Appliquez :

```bash
npx supabase link --project-ref <ref-dev>
npx supabase db push
```

4. Si les migrations POC ont été appliquées à la main sur une copie de la prod (pas d'historique), déclarez-les comme déjà appliquées **avant** `db push` :

```bash
npx supabase migration repair --status applied 20240601000000 20240605000000 20240605000100 20240606000000 20240606000100 20240606000200
```

## 4. Contrôles après migration

```sql
-- toutes les conversations privées, rien de perdu
select visibility, legacy_visibility, count(*) from public.conversations group by 1, 2;
-- modèles rattachés à une connexion
select m.name, m.status, c.name as connexion, c.secret_ref from public.ai_models m left join public.ai_provider_connections c on c.id = m.connection_id;
-- contenus de démo
select count(*) from public.prompt_templates where is_demo and status = 'published';   -- 17
select count(*) from public.workflow_definitions where is_demo;                        -- 5
-- bucket privé
select id, public from storage.buckets where id = 'chat-files';                        -- public = false
-- matrice de permissions
select role, count(*) from public.role_permissions group by 1;   -- viewer 4, beta_tester 7, admin 17, super_admin 21
```

Puis déroulez les scénarios de [10-recette-et-livraison.md](10-recette-et-livraison.md), notamment les tests de confidentialité avec deux comptes.

## 5. Production

Ordre recommandé, avec une fenêtre de maintenance annoncée :

1. Sauvegarde (étape 2), puis contrôle qu'elle est exploitable.
2. Variables serveur sur Vercel (production) : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV=production`, `VITE_APP_ENV=production`, clés fournisseurs, `CRON_SECRET`, listes blanches. Voir [07-exploitation.md](07-exploitation.md).
3. `npx supabase link --project-ref chtwyqanehlehvpruego`, puis `migration repair` si nécessaire (étape 3.4), puis `npx supabase db push`.
4. Contrôles SQL (étape 4).
5. Déploiement Vercel de la branche validée (merge vers `main`).
6. Admin › Modèles IA :
   - activez les connexions configurées, testez les modèles, puis activez-les ;
   - désactivez le modèle POC `llama-3.1-8b-instant` ;
   - réaffectez les partenaires à un modèle actif.
7. Communication aux utilisateurs (impacts ci-dessus).

## Retour arrière

**Application** : redéployez la version précédente sur Vercel (*Instant Rollback*). **Attention** : l'ancien code POC lit les conversations sans filtre de visibilité. Avec la nouvelle RLS, chaque utilisateur ne voit plus que les siennes et celles qui sont partagées. L'ancien code appelle aussi les fournisseurs depuis le navigateur avec des clés `VITE_*`, ce qui reste à proscrire.

**Base**, deux options :
- **Restauration complète** (recommandée en cas d'incident majeur) : PITR ou sauvegarde de l'étape 2. Les données créées depuis la migration sont perdues.
- **Retour partiel** sans restauration : les migrations n'ont rien supprimé. Pour rétablir la visibilité POC sans revenir en arrière sur le reste, un DBA peut exécuter :

```sql
update public.conversations set visibility = 'shared' where legacy_visibility = 'poc_visible_to_all';
```

Les nouvelles tables peuvent rester en place : l'ancien code les ignore.

## Limites connues

- Le schéma de base est **reconstitué** depuis le code : à confronter au `db dump` réel.
- `20240605000000_tickets_profiles_fk.sql` utilise `ADD CONSTRAINT` sans `IF NOT EXISTS` : il échoue s'il est rejoué sur la prod. D'où l'étape `migration repair`.
- Les fichiers du bucket `chat-files` uploadés par le POC ne sont rattachés à aucune ligne de `message_attachments` : ils restent accessibles à leur propriétaire (dossier `<user_id>/`) mais ne s'affichent plus dans les anciennes conversations.
