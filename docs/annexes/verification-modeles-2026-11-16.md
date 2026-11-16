# Vérification des modèles IA — 16/11/2026

Relevé effectué sur les documentations officielles le 16/11/2026. Tout ce qui est
marqué **NON VÉRIFIÉ** doit être confirmé par un test d'intégration réel
(bouton « Tester » du back-office) avant activation en production.

## Anthropic (source : documentation officielle Claude API / skill officiel, cache du 06/10/2026)

| Modèle | ID API | Contexte | Prix entrée / sortie (USD / 1M tokens) |
|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | 1M | 4,00 / 20,00 (lecture cache 0,20) |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 2,00 / 10,00 (lecture cache 0,20) |
| Claude Haiku 5.5 | `claude-haiku-5-5` | 1M | 0,10 / 0,50 (≤100K tokens de prompt ; 0,50 / 2,50 au-delà) |

Points d'API retenus :
- SDK officiel `@anthropic-ai/sdk` (version 1.3.0 épinglée) → version d'API `2026-10-21`.
- `temperature`, `top_p`, `top_k` **refusés (400)** sur tous les modèles en version 2026-10-21 → CHANTAL ne les envoie jamais à Anthropic.
- Réflexion (thinking) toujours active sur Opus 5.5 ; profondeur réglée par `output_config.effort` (défaut `medium`).
- Pas de « prefill » assistant.
- Images (`image` base64) et PDF (`document` base64) supportés.
- Usage en streaming : `message_start.message.usage.input_tokens` (+ `cache_read_input_tokens`), `message_delta.usage.output_tokens`.
- `stop_reason: "refusal"` possible : traité comme une erreur explicite (pas de bascule silencieuse).

## OpenAI (sources : developers.openai.com/api/docs/models, …/pricing, …/guides/latest-model, …/guides/pdf-files, référence Chat Completions)

| | `gpt-6-astra` (phare) | `gpt-6-luna` (rapide / économique) |
|---|---|---|
| Chat Completions | Oui | Oui |
| Streaming | Oui | Oui |
| Images en entrée | Oui | Oui |
| Sorties structurées | Oui | Oui |
| Contexte / sortie max | 1 050 000 / 128 000 | 1 050 000 / 128 000 |
| Prix entrée / cache / sortie | 10 / 1 / 50 | 0,10 / 0,01 / 0,50 |
| Prix > 272K tokens d'entrée | 20 / 2 / 75 | 0,20 / 0,02 / 0,75 |

- `max_tokens` déprécié → CHANTAL envoie `max_completion_tokens` pour OpenAI.
- `temperature` à retirer quand l'effort de raisonnement n'est pas `none` → CHANTAL n'envoie pas `temperature` à l'adaptateur OpenAI officiel.
- `stream_options.include_usage` supporté ; champs `usage.prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`.
- PDF en Chat Completions : supporté via part `file`, **forme JSON exacte NON VÉRIFIÉE** → capacité « fichiers » non activée pour OpenAI dans CHANTAL V1.
- Autres modèles listés : `gpt-6.1-sol` (2 / 0,10 / 10), `gpt-6.1-terra` (1 / 0,05 / 5).
- Endpoints régionaux / résidence des données : +10 %.

## Google Gemini (sources : aistudio.google.com/docs/models, …/pricing, …/api-reference/generate-content)

| | `gemini-4-carbon` (Stable) | `gemini-3.8-flash` (Stable) |
|---|---|---|
| Contexte | 1 048 576 (partagé entrée/sortie) | 1 048 576 |
| Sortie max | 65 536 | 65 536 |
| Entrées | texte, image, vidéo, audio, PDF | idem |
| Prix entrée / sortie / cache | 2 / 10 / 0,10 jusqu'au 30/11/2026, **puis 4 / 20 / 0,20** dès le 01/12/2026 | 0,75 / 3,75 / 0,075 jusqu'au 31/12/2026, **puis 1,50 / 7,50 / 0,15** dès le 01/01/2027 |

- Authentification par en-tête `x-goog-api-key` : confirmée.
- `generateContent` / `streamGenerateContent` : désormais « legacy » mais supportés ; Google recommande la nouvelle Interactions API. **Le suffixe `?alt=sse` sur `streamGenerateContent`, le champ `systemInstruction` et la syntaxe `inline_data` sont NON VÉRIFIÉS sur les pages actuelles** → l'adaptateur Google de CHANTAL utilise la forme historique documentée ; à valider par le test de connexion. Capacités images/fichiers non activées pour Google tant que ce test n'est pas passé.
- `usageMetadata` : `promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`, `thoughtsTokenCount` confirmés.
- `gemini-2.5-pro` / `gemini-2.5-flash` : dépréciés (redirection automatique à partir du 01/12/2026).

## Groq (endpoint compatible OpenAI `https://api.groq.com/openai/v1`)

- `llama-3.1-8b-instant` (modèle par défaut du POC) : **arrêté le 16/08/2026** d'après la page des dépréciations (encore listé « Contact Sales » sur la page modèles) → considéré inutilisable. Remplaçant indiqué : `openai/gpt-oss-20b` (0,075 / 0,30 ; 131 072 de contexte).
- `openai/gpt-oss-120b` : 0,15 / 0,60.

## Sélection retenue pour le catalogue initial (tous créés **désactivés**)

| Rôle | Modèle | Justification |
|---|---|---|
| Polyvalent haut de gamme | Claude Opus 5.5 | Raisonnement, rédaction longue, analyse de documents |
| Usage courant / workflows | Claude Sonnet 5.5 | Bon compromis qualité / coût |
| Phare OpenAI | GPT-6 Astra | Second fournisseur de premier plan (réversibilité) |
| Volume / tâches simples (titres) | GPT-6 Luna | Coût très bas |
| Multimodal Google | Gemini 3.8 Flash | Troisième fournisseur, coût maîtrisé |

Les tarifs ci-dessus sont saisis dans `ai_model_pricing` avec leur date d'effet et
leur URL source ; ceux qui changent à une date connue ont deux lignes.
