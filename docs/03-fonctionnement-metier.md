# 03 — Fonctionnement métier

## Rôles et matrice de permissions

Il y a quatre rôles hiérarchiques : `super_admin` > `admin` > `beta_tester` > `viewer`. Chaque rôle hérite des permissions du rôle inférieur.

La matrice existe en deux exemplaires strictement identiques :
- `src/lib/permissions.ts`, côté application ;
- la table `role_permissions`, côté base (migration `20261116000100_rbac_audit.sql`).

Le test `tests/unit/permissions.test.ts` échoue si les deux divergent. **La base fait foi** : la RLS et les fonctions `has_permission()` / `has_min_role()` s'appliquent quel que soit le client.

| Permission | viewer | beta_tester | admin | super_admin |
|---|:-:|:-:|:-:|:-:|
| `prompt.read` — consulter/utiliser les prompts publiés | ✓ | ✓ | ✓ | ✓ |
| `conversation.read_shared` — lire les conversations partagées | ✓ | ✓ | ✓ | ✓ |
| `workflow.read` — voir le catalogue de workflows | ✓ | ✓ | ✓ | ✓ |
| `formation.read` | ✓ | ✓ | ✓ | ✓ |
| `chat.use` — utiliser le chat IA | | ✓ | ✓ | ✓ |
| `conversation.share` — partager ses conversations | | ✓ | ✓ | ✓ |
| `workflow.run` — exécuter des workflows | | ✓ | ✓ | ✓ |
| `prompt.manage`, `workflow.manage`, `agent.manage`, `partner.manage` | | | ✓ | ✓ |
| `user.manage` (hors super admins), `ticket.manage`, `formation.manage` | | | ✓ | ✓ |
| `reporting.view`, `reporting.export`, `audit.view` | | | ✓ | ✓ |
| `model.manage` — catalogue IA et connexions | | | | ✓ |
| `conversation.moderate` — masquer une conversation partagée | | | | ✓ |
| `settings.manage` — rétention, mode démo | | | | ✓ |
| `user.manage_super` — gérer les super admins, mapping SSO, rattachement de comptes | | | | ✓ |

Protections complémentaires, assurées par le trigger `profiles_guard` :
- personne ne peut modifier son propre rôle ou son propre statut ;
- un `admin` ne peut ni créer, ni promouvoir, ni modifier un `super_admin` ;
- les champs d'identité (`email`, `identity_provider`, `external_subject`, `provisioning_source`) ne sont pas modifiables depuis le client.

Un profil **inactif** n'a accès à rien, pas même à ses propres données.

## Confidentialité des conversations

| Règle | Où elle est appliquée |
|---|---|
| Toute nouvelle conversation est **privée** | trigger `conversations_guard` : une création en `shared` est refusée |
| Seul le propriétaire écrit dans sa conversation (messages, pièces jointes, titre, partage, suppression) | policies RLS `conversations_*`, `messages_insert`, `message_attachments_*` ; route `/api/chat` (403 « lecture seule ») |
| Le partage est explicite, confirmé dans l'interface (`ShareDialog`) et réversible | colonne `visibility`, horodatage `shared_at` / `shared_by` |
| Une conversation partagée est lisible, en **lecture seule**, par les utilisateurs actifs ayant `conversation.read_shared` | fonction `can_read_conversation()` |
| Aucun accès automatique des admins ou super admins aux conversations privées | aucune exception de rôle dans les policies |
| Modération : un super admin peut masquer une conversation **partagée** uniquement | RPC `moderate_conversation()`, journalisée |
| Les réponses « assistant » sont écrites uniquement par le serveur | policy `messages_insert` (`role = 'user'`) |
| Pièces jointes : bucket `chat-files` privé, URL signées d'une heure, lecture si la conversation est lisible | policies `storage.objects` `chantal_chat_files_*` |
| Une recherche, un favori ou l'activité récente n'exposent jamais une conversation privée d'autrui | toutes ces fonctions passent par la RLS (`SECURITY INVOKER`) |
| Le reporting ne contient aucun contenu de conversation | `ai_usage_events` ne stocke que des métadonnées |

**Accès techniques privilégiés restant possibles dans l'infrastructure** (à encadrer par la DSI) :
- détenteurs de la clé `service_role` ;
- comptes ayant accès au projet Supabase (SQL Editor, sauvegardes, Table Editor) ;
- accès Vercel aux logs et variables.

Ces accès contournent la RLS par conception. Ils sont à restreindre et à tracer côté infrastructure.

**Migration des données POC** : toutes les conversations existantes deviennent **privées**. L'état antérieur est conservé dans `legacy_visibility` (`poc_visible_to_all` ou `poc_hidden`). Aucune suppression. Chaque propriétaire peut re-partager ses conversations.

## Favoris et activité récente

- Les favoris sont stockés dans `user_favorites`, par utilisateur et synchronisés entre appareils. Types : partenaire, agent, workflow, prompt, conversation.
- Une ressource devenue inaccessible (archivée, droits retirés, supprimée) s'affiche « Ressource indisponible », sans titre.
- Les anciens favoris `localStorage` du POC ne sont importés qu'après un clic « Importer » de l'utilisateur connecté, avec dédoublonnage. Les identifiants non-UUID des anciens partenaires statiques sont ignorés.
- L'activité récente (`get_recent_activity`) rassemble les conversations, exécutions de workflows et utilisations de prompts de l'utilisateur. Elle est triée par date et paginée par lots de 8.

## Prompts

- Le **brouillon** (`prompt_templates.draft`) est modifiable. La **publication** (`publish_prompt`) crée une version immuable n+1 dans `prompt_versions`.
- **Restauration** : une ancienne version est recopiée dans le brouillon (`restore_prompt_version`), puis publiée. Une nouvelle version est créée avec `restored_from_version`. L'historique n'est jamais réécrit.
- Les utilisateurs ne voient que la version publiée courante, selon `min_role`.
- Chaque utilisation est tracée dans `prompt_usages`, avec la version exacte (`record_prompt_usage`).
- Les variables s'écrivent `{{nom}}`. Le moteur de gabarits (`src/lib/workflows/template.ts`) ne fait que des substitutions, sans jamais évaluer de code.
- Les 17 prompts du POC sont repris, publiés en v1 et marqués « Exemple » (`is_demo`).

## Workflows

Une définition est un JSON déclaratif, validé par `src/lib/workflows/schema.ts`. Elle comprend :
- des **champs** (texte, texte long, nombre, liste, date, case à cocher) avec leurs validations ;
- des **étapes** :
  - `llm` : modèle, agent facultatif, consignes ;
  - `transform` : gabarit, trim, majuscules, minuscules, troncature, extraction JSON, découpage ou assemblage de lignes ;
  - `condition` : comparaisons ; en cas de faux, continuer ou arrêter ;
  - `http` : connexion pré-configurée et chemin relatif ;
- une **sortie** : gabarit, format Markdown, texte ou JSON ;
- un **délai maximum** de 10 à 290 s.

Chaque étape peut être conditionnée (`when`). Aucun code arbitraire n'est exécuté.

Cycle de vie :
1. Brouillon.
2. **Test** du brouillon (`POST /api/admin/workflows`, `action: "test"`).
3. **Publication**. Le serveur exige un test réussi de la définition **exacte** (empreinte SHA-256), avec des modèles actifs et des connexions HTTP activées.
4. La version est immuable (`workflow_versions`).
5. Chaque exécution référence `version_id`. Une relance réutilise la **même** version et les mêmes données, dans la limite de 3 tentatives.

Protections :
- idempotence (`unique(user_id, idempotency_key)`) ;
- plafond d'exécutions actives par utilisateur (`WORKFLOW_MAX_ACTIVE_RUNS_PER_USER`) ;
- délais par étape et par workflow ;
- exécutions orphelines passées en `timed_out` ;
- appels HTTP soumis à la liste blanche `WORKFLOW_HTTP_ALLOWED_HOSTS`, en HTTPS, sans IP privée ni redirection, avec une taille de réponse bornée. Le secret reste côté serveur.

L'historique des exécutions est **strictement personnel**. Aucun rôle ne lit les entrées ou sorties d'autrui. Les administrateurs voient seulement des agrégats (`workflow_usage_stats`).

Les 5 workflows du POC sont repris **en brouillon** (« Exemple »). Ils nécessitent le choix d'un modèle réel, un test, puis une publication.

**Intégration d'un moteur externe** (n8n, Make, API métier) : créer une connexion HTTP, puis une étape `http` qui appelle son webhook. CHANTAL ne dépend d'aucun moteur externe.

## Reporting — définition des indicateurs

Source : `ai_usage_events`. Un événement correspond à **une requête logique** au fournisseur, et non à un fragment de streaming. Il est créé à l'état `started` et finalisé une seule fois ; l'unicité de `request_id` évite le double comptage. Les événements `started` ne sont pas comptés. Les tests d'administration (`admin_test`) sont exclus par défaut.

| Indicateur | Calcul |
|---|---|
| Utilisateurs actifs | utilisateurs distincts ayant ≥ 1 requête IA ou ≥ 1 exécution de workflow sur la période |
| Requêtes IA | événements finalisés (`success` + `error` + `cancelled`) |
| Conversations créées | `conversations.created_at` dans la période (aucun contenu lu) |
| Exécutions / réussies / échecs / relances | `workflow_runs` hors tests ; échecs = `failed` + `timed_out` ; relances = `parent_run_id` non nul |
| Latence | moyenne et p95 du délai jusqu'au **premier token** (`latency_ms`) ; durée = requête complète |
| Tokens | somme des tokens **renvoyés par le fournisseur** ; « — » si aucun ; couverture = requêtes renseignées / total |
| Coût estimé | (tokens d'entrée hors cache × tarif d'entrée + tokens en cache × tarif cache + tokens de sortie × tarif de sortie) / 10⁶, avec le tarif en vigueur **à la date de la requête** ; « — » si le tarif ou les tokens manquent ; jamais 0 par défaut |

Limites affichées dans l'interface :
- les paliers « long contexte » des fournisseurs ne sont pas modélisés ;
- seule la facture du fournisseur fait foi.

Filtres disponibles : période (7, 30, 90 jours ou personnalisée, 400 jours maximum), modèle, agent, workflow, inclusion des tests. L'export CSV (séparateur `;`, UTF-8 avec BOM) contient des agrégats par jour et par dimension, sans nom d'utilisateur.

**Mode démo** : le paramètre `reporting_demo_mode` vaut `false` par défaut. Activé, il affiche des données fictives sous un bandeau « MODE DÉMONSTRATION » et désactive l'export.

## Rétention

Les durées sont configurables dans Admin › Paramètres (table `app_settings`). La purge est faite par `purge_expired_data()`, appelée par `/api/cron/maintenance`.

| Donnée | Clé | Défaut |
|---|---|---|
| Événements d'usage IA | `usage_retention_days` | 395 jours |
| Exécutions de workflows terminées | `run_retention_days` | 395 jours |
| Journal d'audit | `audit_retention_days` | 1095 jours |

Les conversations, messages et favoris ne sont pas purgés automatiquement : la suppression appartient à l'utilisateur. Cette décision de conservation est à arrêter par la DSI et le DPO (voir [10-recette-et-livraison.md](10-recette-et-livraison.md)).

## Journal d'audit

La table `admin_audit_log` est alimentée par triggers et par le serveur. Elle est immuable : aucune mise à jour ni suppression hors purge. Elle est lisible avec `audit.view`.

Elle couvre :
- les rôles et statuts des utilisateurs ;
- les connexions, modèles et tarifs IA ;
- les agents, partenaires, prompts et versions, workflows et publications, connexions HTTP ;
- les invitations, le mapping SSO, la modération, les tests de modèles et le rattachement de comptes.

Les longues valeurs sont tronquées à 2000 caractères. Les champs dont le nom évoque un secret sont masqués ; aucune colonne ne contient de secret par conception.
