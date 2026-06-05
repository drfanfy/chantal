# CHANTAL — Contexte projet Claude Code

## C'est quoi CHANTAL

Portail IA interne de **QUARTUS** (groupe immobilier). Objectif : centraliser tous les usages IA de l'entreprise en un seul endroit.

Actuellement en **POC** — objectif : valider l'UX et convaincre la direction.

Projet Supabase : `chtwyqanehlehvpruego`  
Déployé sur Vercel. Dev local : `npm run dev`.

---

## Stack technique

- React 19 + TypeScript strict + TanStack Router + Vite + Tailwind CSS + shadcn/ui
- Supabase (auth, BDD, RLS, Edge Functions, Storage)
- Multi-LLM : **Groq** (llama3, défaut), **OpenAI** (gpt-4o-mini), **Google** (Gemini)
- Déploiement : Vercel

---

## Routes

| Route | Description | Statut |
|---|---|---|
| `/chat` | Chat IA multi-modèle avec historique Supabase | ✅ fonctionnel |
| `/app` | Workspace (workflows, prompts, partenaires, formations, reporting, studio) | ✅ |
| `/admin` | Back-office : utilisateurs, modèles IA, agents, partenaires | ✅ fonctionnel |
| `/tickets` | Gestion des tickets support (admins) | ✅ fonctionnel |
| `/home` | Dashboard accueil | ✅ |

---

## Système de rôles

`super_admin` > `admin` > `beta_tester` > `viewer`

Routes protégées par rôle : `/admin`, `/tickets`, `/studio`, `/reporting`

---

## Tables Supabase existantes

| Table | Description |
|---|---|
| `profiles` | Utilisateurs (id, email, full_name, role, avatar_url, is_active) |
| `ai_models` | Modèles IA configurables (name, provider, model_id, env_key, avatar_url, min_role) |
| `agents` | Agents IA (name, slug, description, system_prompt, icon, avatar_url, min_role) |
| `partners` | Partenaires IA (name, description, personality, system_prompt, avatar_url, ai_model_id, agent_id) |
| `conversations` | Conversations chat (user_id, title, ai_model_id, agent_id, partner_id) |
| `messages` | Messages (conversation_id, role, content, speaker_name, speaker_avatar_url, speaker_icon) |
| `tickets` | Tickets support (user_id, type, title, description, status, priority) |
| `ticket_messages` | Messages de tickets (ticket_id, user_id, content, is_read) |
| `prompts` | Bibliothèque de prompts |
| `workflows` | Catalogue de workflows |
| `usage_logs` | Logs d'usage |

---

## Architecture chat

Le chat est entièrement fonctionnel avec streaming token par token.

**Router LLM** dans `ChatInterface.tsx` — route selon `ai_models.provider` :
- `"groq"` → `src/lib/groq.ts` (VITE_GROQ_API_KEY)
- `"openai"` → `src/lib/openai.ts` (VITE_OPENAI_API_KEY)
- `"google"` → `src/lib/gemini.ts` (VITE_GEMINI_API_KEY)

**Persistance** : conversations + messages sauvegardés en Supabase à chaque envoi. Chargés au montage de `ChatInterface`.

**Speaker figé par message** : `speakerName`, `speakerAvatarUrl`, `speakerIcon` stockés dans chaque message au moment de l'envoi (pas mis à jour si on change de sélecteur).

**Sélecteurs** : `SelectorPills` (partenaire/modèle/agent) dans la barre de saisie, à gauche du textarea. Hors du `chat-input-container` stylistiquement.

---

## Ce qui est fonctionnel

✅ Auth complète (login, rôles, activation/désactivation)  
✅ Chat multi-LLM avec streaming (Groq/OpenAI/Gemini)  
✅ Persistance conversations Supabase  
✅ Avatars figés par message  
✅ Pièces jointes multiples (upload Supabase Storage bucket `chat-files`)  
✅ Auto-titre GPT-4o-mini après premier échange  
✅ Admin BO : cards + modales pour Modèles/Agents/Partenaires  
✅ Génération avatar IA via Edge Function `generate-avatar` (HuggingFace FLUX)  
✅ Upload avatar vers bucket `avatars`  
✅ Page Partenaires branchée sur DB  
✅ Formations : mode édition CMS + card créer (in-memory, non persisté)  
✅ Tickets : FeedbackButton draggable (icône Bug), panel envoi, page /tickets admin, Realtime  
✅ Navigation Tickets dans TopNav (admins)  

---

## Ce qui est volontairement fictif (POC)

- Reporting → données simulées
- Workflows → exemples fictifs
- Studio IA → fictif

**Ne pas "corriger" ces données fictives sans instruction explicite.**

---

## Tables Supabase existantes (suite)

| Table | Description |
|---|---|
| `formations` | Formations (id TEXT PK, name, description, icon, intro, sort_order, is_custom) |
| `formation_chapters` | Chapitres (id UUID PK, formation_id FK, title, content, sort_order) |

Migrations à appliquer dans le dashboard Supabase :
- `supabase/migrations/20240605_tickets_profiles_fk.sql` — FK tickets/ticket_messages → profiles
- `supabase/migrations/20240605_formations.sql` — tables formations + formation_chapters + RLS

---

## Points en attente / bugs connus

🟡 Génération avatar IA bloquée (HuggingFace nécessite crédits Inference Providers)  
🟡 Migrations SQL à appliquer manuellement dans le dashboard Supabase (voir ci-dessus)

---

## Variables d'environnement (.env)

```
VITE_SUPABASE_URL=https://chtwyqanehlehvpruego.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_GROQ_API_KEY=gsk_...         # Chat (défaut)
VITE_OPENAI_API_KEY=sk-proj-...   # GPT-4o-mini (auto-titre)
VITE_GEMINI_API_KEY=...           # Gemini (si modèle configuré)
VITE_HF_TOKEN=hf_...              # HuggingFace (génération avatar)
```

---

## Edge Functions Supabase déployées

- `create-user` — création compte via admin (upsert profil, is_active: true)
- `generate-avatar` — génération image via HuggingFace → upload Storage `avatars`

---

## Règles de développement

- TypeScript strict — pas de `any`
- Composants définis **hors** des autres composants (évite remount/perte de focus)
- Logique métier séparée de l'UI
- Style : Notion + Linear + ChatGPT — sobre, premium, zéro fioriture

---

## Objectif V1

Plateforme crédible pour présentation direction QUARTUS comme futur portail IA interne.
