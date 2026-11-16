# 04 — Intégrations IA

> Statut :
> - **Prêt dans le code** : les adaptateurs OpenAI et compatibles OpenAI, et Gemini, sont testés avec des flux SSE simulés ; la passerelle est testée avec le fournisseur fictif.
> - **Non validé en conditions réelles** : aucun appel n'a été fait avec une vraie clé. Le bouton « Tester » du back-office constitue ce test.

## Trois niveaux séparés

| Niveau | Où | Qui le modifie |
|---|---|---|
| **Adaptateur** : traduction vers l'API d'un fournisseur | `src/server/ai/adapters/*.ts`, registre `src/server/ai/registry.ts` | développeurs (code) |
| **Connexion** : endpoint, version d'API, région, déploiement, **nom** de la variable contenant la clé | table `ai_provider_connections` | super admin (back-office) |
| **Modèle** : identifiant API, capacités, paramètres, tarifs, quotas, disponibilité | tables `ai_models`, `ai_model_pricing` | super admin (back-office), sans redéploiement |

## Adaptateurs livrés

| Id | Fichier | Mode d'appel | Capacités réellement exécutées |
|---|---|---|---|
| `anthropic` | `adapters/anthropic.ts` | SDK officiel `@anthropic-ai/sdk` 1.3.0 (API version 2026-10-21), `messages.stream` | texte, streaming, images, PDF |
| `openai` | `adapters/openai.ts` | REST Chat Completions SSE, `stream_options.include_usage`, `max_completion_tokens`, sans `temperature` | texte, streaming, images, sortie JSON (`json_object`) |
| `openai_compatible` | `adapters/openai.ts` | même format ; URL de base obligatoire, `max_tokens`, `temperature` si définie | texte, streaming, images, JSON — **à confirmer par endpoint** |
| `google` | `adapters/google.ts` | REST `models/{id}:streamGenerateContent?alt=sse`, clé dans l'en-tête `x-goog-api-key` | texte, streaming (images/PDF non activés : syntaxe non vérifiée) |
| `mock` | `adapters/mock.ts` | aucun réseau ; **jamais en production** (`AI_ENABLE_MOCK_PROVIDER=true` et `APP_ENV≠production`) | tests et démonstration |

Les « outils » (function calling) ne sont exécutés par aucun adaptateur en V1 : la case est désactivée dans le back-office.

Capacité effective = capacité **déclarée** par l'administrateur **ET** capacité **supportée** par l'adaptateur (`effectiveCapabilities`). Une case cochée ne suffit jamais : le serveur refuse une image envoyée à un modèle sans vision, et l'interface masque le type de fichier correspondant.

## Modèles retenus (catalogue initial)

Ils ont été vérifiés le 16/11/2026 sur les documentations officielles : voir [annexes/verification-modeles-2026-11-16.md](annexes/verification-modeles-2026-11-16.md). Ils sont insérés **désactivés** par la migration `20261116000300_ai_catalog.sql`, avec leurs tarifs datés.

| Modèle | ID API | Rôle dans le catalogue |
|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | raisonnement avancé, rédaction longue, analyse de documents (PDF) |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | usage courant et workflows, meilleur rapport qualité/coût |
| GPT-6 Astra | `gpt-6-astra` | second fournisseur de premier plan (réversibilité) |
| GPT-6 Luna | `gpt-6-luna` | volume, titres automatiques, tâches simples (coût très bas) |
| Gemini 3.8 Flash | `gemini-3.8-flash` | troisième fournisseur, multimodal rapide (texte seul en V1) |

Justification de la sélection :
- trois fournisseurs de premier plan pour la réversibilité ;
- deux niveaux de coût par fournisseur principal ;
- prise en charge des PDF via Claude, utile aux dossiers immobiliers.

Points **à vérifier** avant activation, détaillés dans l'annexe :
- format exact du streaming Gemini ;
- forme de la part `file` d'OpenAI (non activée) ;
- paliers tarifaires « long contexte ».

**Reprise du POC** : les modèles existants sont rattachés automatiquement à une connexion « Groq (POC) », « OpenAI (POC) » ou « Google Gemini (POC) » et conservent leur statut. Le modèle par défaut du POC, `llama-3.1-8b-instant`, est annoncé **arrêté le 16/08/2026** par Groq : il échouera avec une erreur explicite. Il faut le désactiver et choisir un autre modèle.

## Variables (serveur uniquement)

- **Clés** : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `AZURE_OPENAI_API_KEY`, ou tout nom préfixé `CHANTAL_SECRET_`. Une connexion ne peut **pas** référencer une autre variable du serveur, par exemple `SUPABASE_SERVICE_ROLE_KEY` (`src/server/env.ts#isAllowedSecretName`).
- `AI_ALLOWED_HOSTS` : hôtes autorisés pour les URL de base personnalisées, par exemple `api.groq.com,*.openai.azure.com`. Les hôtes officiels des adaptateurs sont toujours autorisés. Le contrôle anti-SSRF est fait **à chaque appel** : HTTPS, port 443, pas d'IP littérale ni d'adresse privée après résolution DNS, pas de redirection.
- `AI_REQUEST_TIMEOUT_MS` (120 000 par défaut, 290 000 au maximum), `AI_MAX_CONCURRENT_PER_USER` (3 par défaut).
- `CHAT_TITLE_MODEL` : identifiant API d'un modèle **actif** pour les titres. Vide : pas de titre IA, la conversation garde les 60 premiers caractères du message.

Sans clé présente, le modèle est affiché « **Non configuré** » avec la raison (visible des super admins) et l'appel est refusé (HTTP 503 `not_configured`). **Aucune bascule** vers un autre modèle ou fournisseur n'a lieu.

## Limites et quotas

Les paramètres suivants se règlent par modèle dans le back-office :
- tokens de sortie par défaut et limite ;
- température par défaut, minimale et maximale, seulement si l'adaptateur la transmet ;
- requêtes par utilisateur et par jour ;
- tokens par mois, tous utilisateurs confondus ;
- requêtes simultanées par utilisateur, bornées par la variable d'environnement.

Le serveur contrôle ces limites avant chaque appel (réponse 429 avec un message explicite).

## Activation d'un modèle (garde-fou base de données)

Le passage au statut `active` est refusé par le trigger `ai_models_guard` sauf si :
- la connexion est activée et non archivée ;
- `last_test_status = 'success'` et le test est postérieur à la dernière modification de configuration (`config_updated_at`).

Changer l'identifiant API, la connexion, les paramètres ou les capacités invalide le test. Seul le serveur écrit les résultats de test (route `/api/admin/ai-test`). Désactiver une connexion désactive ses modèles actifs.

Avant l'archivage d'un modèle, la RPC `model_dependencies()` liste ses dépendances (partenaires, agents, workflows publiés ou en brouillon). L'historique est conservé.

## Ajouter un fournisseur

**Cas 1 — endpoint compatible OpenAI** (Mistral, Azure OpenAI v1, vLLM, passerelle d'entreprise…) : aucun code.
1. Ajoutez l'hôte à `AI_ALLOWED_HOSTS` et la clé dans une variable `CHANTAL_SECRET_<NOM>`, sur Vercel.
2. Créez une connexion `openai_compatible` avec l'URL de base et la référence du secret.
3. Créez le modèle, testez-le, puis activez-le.

**Cas 2 — nouvelle API** :
1. Créez `src/server/ai/adapters/<id>.ts` en implémentant `ProviderAdapter` (`src/server/ai/types.ts`). La méthode `stream()` doit émettre `text`, `usage` (valeurs cumulées, `inputTokens` incluant le cache) et `finish`. Elle traduit les erreurs en `ProviderError` via `errorCodeFromStatus` et nettoie les détails avec `sanitizeDetail`.
2. Déclarez honnêtement `supported`, `supportsTemperature`, `requiresBaseUrl` et `officialHosts`.
3. Enregistrez l'adaptateur dans `ADAPTERS` (`registry.ts`) et ajoutez l'identifiant dans `ADAPTER_IDS` (`types.ts`).
4. Ajoutez une migration qui étend la contrainte `ai_provider_connections_adapter_check`, et un test dans `tests/unit/adapters.test.ts` sur le modèle des tests existants.
5. Si le fournisseur propose un SDK officiel TypeScript, privilégiez-le.
