# CHANTAL — Contexte projet Claude Code

## C'est quoi CHANTAL

Portail IA interne de **QUARTUS** (groupe immobilier). Objectif : centraliser tous les usages IA de l'entreprise en un seul endroit.

Actuellement en **POC** — objectif : valider l'UX et convaincre la direction.

Projet Supabase : `chtwyqanehlehvpruego`  
Déployé sur Vercel. Dev local : `npm run dev`.

---

## Stack technique

- React 19 + TypeScript strict + TanStack Start + Vite + Tailwind CSS + shadcn/ui
- Supabase (auth, BDD, RLS, Edge Functions, Storage)
- Multi-LLM : **Groq** (`llama-3.1-8b-instant`, défaut), **OpenAI** (gpt-4o-mini), **Google** (Gemini)
- Déploiement : Vercel via **Nitro** (`preset: "vercel"` dans `vite.config.ts`)
- Rich text : **TipTap** (formations)

---

## Déploiement Vercel

Le build utilise `nitro({ preset: "vercel" })` dans `vite.config.ts`.  
Le build génère `.vercel/output/` (Build Output API v3) avec une serverless function SSR.  
`vercel.json` contient `outputDirectory: "dist/client"` mais est ignoré au profit de `.vercel/output/`.

**Si 404 sur Vercel** : vérifier que `npm run build` tourne bien et que `nitro` est installé.

---

## Routes

| Route | Description | Statut |
|---|---|---|
| `/home` | Dashboard accueil dynamique | ✅ |
| `/chat` | Chat IA multi-modèle avec historique Supabase | ✅ |
| `/app` | Workspace (workflows, prompts, partenaires, formations, reporting) | ✅ |
| `/admin` | Back-office : utilisateurs, modèles IA, agents, partenaires | ✅ |
| `/tickets` | Gestion des tickets support (admins) | ✅ |

---

## Système de rôles

`super_admin` > `admin` > `beta_tester` > `viewer`

Routes protégées par rôle : `/admin`, `/tickets`, `/reporting`  
Studio IA : retiré de la nav (accessible via Admin BO uniquement)

---

## Tables Supabase

| Table | Description |
|---|---|
| `profiles` | Utilisateurs (id, email, full_name, role, avatar_url, is_active) |
| `ai_models` | Modèles IA (name, provider, model_id, env_key, avatar_url, min_role) |
| `agents` | Agents IA (name, slug, description, system_prompt, icon, avatar_url, min_role) |
| `partners` | Partenaires IA (name, description, personality, system_prompt, avatar_url, ai_model_id, agent_id) |
| `conversations` | Conversations (user_id, title, ai_model_id, agent_id, partner_id, **is_hidden**) |
| `messages` | Messages (conversation_id, role, content, speaker_name, speaker_avatar_url, speaker_icon) |
| `tickets` | Tickets support (user_id→profiles FK, type, title, description, status, priority) |
| `ticket_messages` | Messages tickets (ticket_id, user_id→profiles FK, content, is_read) |
| `formations` | Formations (id TEXT PK, name, description, icon, intro, sort_order, is_custom, updated_at) |
| `formation_chapters` | Chapitres (id UUID PK, formation_id FK, title, content HTML, sort_order) |
| `formation_progress` | Progression (user_id FK, chapter_id FK, read_at) UNIQUE(user_id, chapter_id) |
| `prompts` | Bibliothèque de prompts (statique) |
| `workflows` | Catalogue de workflows (statique) |

**Migrations appliquées** (dans `supabase/migrations/`) :
- `20240605_tickets_profiles_fk.sql` — FK tickets/ticket_messages → profiles
- `20240605_formations.sql` — tables formations + formation_chapters + RLS
- `20240606_conversations_is_hidden.sql` — colonne is_hidden sur conversations
- `20240606_formation_progress.sql` — table formation_progress + RLS

---

## Architecture chat

**Router LLM** dans `ChatInterface.tsx` — route selon `ai_models.provider` :
- `"groq"` → `src/lib/groq.ts` — modèle défaut : `llama-3.1-8b-instant`
- `"openai"` → `src/lib/openai.ts`
- `"google"` → `src/lib/gemini.ts`

**Streaming** token par token. Messages d'erreur LLM précis (401/404/429/model décommissionné), persistés en DB avec speaker figé.

**Speaker figé par message** : `speakerName/AvatarUrl/Icon` stockés à l'envoi.

**Sélecteurs** : `SelectorPills` — largeur auto sur le contenu, dropdown sans scroll.

---

## Formations (CMS)

- Contenu en DB (`formations` + `formation_chapters`), plus rien de hardcodé
- **Seeding automatique** au 1er accès admin si tables vides (5 formations par défaut)
- **Éditeur TipTap** : gras/italique/barré + insertion image (base64 inline, pas de storage)
- **Progression par user** : `formation_progress` — Intersection Observer (60% visible = lu)
- **Badges grille** : Nouveau / barre de progression / Terminé
- **Temps de lecture dynamique** : ~200 mots/min calculé sur le contenu réel

---

## Conversations — accès partagé

- Toutes les conversations non-masquées sont **visibles par tous les utilisateurs authentifiés**
- **Lecture seule** pour les conversations des autres : zone de saisie + sélecteurs masqués, bandeau "— lecture seule"
- `isOwn: boolean` stocké dans chaque `Conversation` (comparaison `user_id` à la DB, pas par nom)
- Noms et avatars des auteurs chargés via requête séparée sur `profiles` (sans FK)
- RLS SQL requis : `conversations_read_all` (is_hidden = false) + `messages_read_all` + `profiles_read_all`

## Conversations sidebar (super_admin)

- **Clic droit** : masquer (`is_hidden = true`) ou supprimer définitivement
- Conversations masquées : invisibles pour non-super-admins, visibles en opacité réduite pour super_admins
- Chargement déclenché sur accès direct par URL (fix infinite loading au refresh)

---

## Homepage dynamique

- **Recommandé** : partenaire DB le + utilisé (par count conversations.partner_id), workflow populaire, 1ère formation non lue
- **Favoris** : chargés depuis table `partners` (UUIDs DB), persistés `localStorage`
- **Activité récente** : conversations 7 derniers jours depuis Supabase
- **FavChip** : avatar + job (description) + mood (personality)

---

## Tickets

- Noms auteurs depuis join `profiles` (plus d'UUID tronqués)
- Messages système (clôture/réouverture) avec ligne séparatrice horodatée
- Bouton Rouvrir fonctionnel

---

## Ce qui est volontairement fictif (POC)

- Reporting → données simulées
- Workflows → exemples fictifs

**Ne pas "corriger" ces données fictives sans instruction explicite.**

---

## Points en attente

🟡 Génération avatar IA bloquée (HuggingFace nécessite crédits Inference Providers)  
🟡 PJ chat : fichiers uploadés mais contenu non transmis au LLM (post-POC)

## Prompts (TopNav dropdown)

- Clic sur un prompt → prefill du chat actuel si conversation propre
- Si conversation en lecture seule ou hors `/chat` → navigation vers nouveau chat + prefill via `requestAnimationFrame` (évite la consommation par l'ancien composant)
- `consumePrefill()` en appContext utilise un pattern setState updater — lire `pendingPrefill` directement depuis le contexte dans l'effet, pas depuis la valeur retournée par `consumePrefill()`

---

## Variables d'environnement (.env)

```
VITE_SUPABASE_URL=https://chtwyqanehlehvpruego.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_GROQ_API_KEY=gsk_...         # Chat (défaut llama-3.1-8b-instant)
VITE_OPENAI_API_KEY=sk-proj-...   # GPT-4o-mini (auto-titre)
VITE_GEMINI_API_KEY=...           # Gemini (si modèle configuré)
VITE_HF_TOKEN=hf_...              # HuggingFace (génération avatar)
```

---

## Edge Functions Supabase déployées

- `create-user` — création compte via admin (auth.admin.createUser + upsert profil)
- `generate-avatar` — génération image via HuggingFace → upload Storage `avatars`

⚠️ Ces fichiers sont en **Deno** — `// @ts-nocheck` en tête pour éviter les erreurs IDE Node.js.

---

## Règles de développement

- TypeScript strict — pas de `any`
- Composants définis **hors** des autres composants (évite remount/perte de focus)
- Logique métier séparée de l'UI
- Style : Notion + Linear + ChatGPT — sobre, premium, zéro fioriture
- `console.log` de debug supprimés — seuls les `console.error` sur vraies erreurs sont conservés

---

## Objectif V1

Plateforme crédible pour présentation direction QUARTUS comme futur portail IA interne.
