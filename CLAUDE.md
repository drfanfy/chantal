# CHANTAL — Contexte projet Claude Code

## C'est quoi CHANTAL

Portail IA interne de **QUARTUS**. Objectif : centraliser tous les usages IA de l'entreprise en un seul endroit.

Actuellement en **POC** — l'objectif est de valider l'expérience utilisateur et convaincre la direction avant de connecter les vraies briques IA.

---

## Stack technique

### Front
- React 19
- TypeScript (strict)
- TanStack Router
- Vite
- Tailwind CSS
- shadcn/ui

### Back
- Supabase (auth, BDD, RLS, Edge Functions)

### Déploiement
- Vercel

---

## Structure des routes

| Route | Description | Statut |
|---|---|---|
| `/home` | Dashboard accueil | ✅ |
| `/chat` | Simulation assistant IA | ✅ (fictif) |
| `/app` | Workspace principal | ✅ |
| `/prompts` | Bibliothèque de prompts | ✅ |
| `/workflows` | Catalogue de workflows IA | ✅ (fictif) |
| `/formations` | Centre de ressources IA | ✅ |
| `/partenaires` | Référentiel partenaires IA | ✅ (fictif) |
| `/reporting` | Dashboard d'usage | ✅ (fictif) |
| `/studio` | Studio IA (admins) | ✅ (fictif) |
| `/admin` | Back-office utilisateurs | ✅ fonctionnel |

---

## Système de rôles

| Rôle | Accès |
|---|---|
| `super_admin` | Tout |
| `admin` | Tout (restrictions futures possibles) |
| `beta_tester` | Accès utilisateur classique |
| `viewer` | Lecture seule |

Routes protégées : `/admin`, `/reporting`, `/studio`

---

## Authentification

- Email + mot de passe uniquement
- Pas d'inscription publique — comptes créés par un admin
- Edge Function Supabase pour : créer un utilisateur, attribuer un rôle, activer/désactiver
- Flow : Login → Auth Supabase → Profil → Contrôle rôles → Menus autorisés

---

## Ce qui est volontairement fictif (POC)

- Reporting → données simulées
- Workflows → exemples fictifs
- Partenaires → fictifs
- Studio IA → fictif
- Chat → pas de vrai LLM connecté

**Ne pas "corriger" ces données fictives sans instruction explicite.**

---

## Ce qui est fonctionnel

✅ Auth complète  
✅ Gestion des rôles  
✅ Navigation (TopNav + AppShell)  
✅ Gestion utilisateurs (admin)  
✅ Déploiement Vercel  

---

## En cours

🟡 Amélioration UI  
🟡 Reporting plus crédible  
🟡 Données réalistes  
🟡 Expérience utilisateur  

---

## Vision long terme (ne pas implémenter sans validation)

🔵 Agents IA réels  
🔵 Connecteurs métiers (CRM, M365)  
🔵 Automatisations  
🔵 Base documentaire IA  
🔵 Recherche sémantique  

---

## Règles de développement

### Architecture
- Composants réutilisables
- TypeScript strict — pas de `any`
- Pages découplées
- Logique métier séparée de l'UI

### Style UI
- Moderne, sobre, premium
- Inspiration : **Notion + Linear + ChatGPT**
- Zéro fioriture inutile

### UX
- Simplicité avant tout
- Rapidité perçue
- Zéro formation utilisateur nécessaire

---

## Objectif V1

Disposer d'une plateforme suffisamment crédible pour être présentée à la **direction QUARTUS** comme le futur portail IA interne de l'entreprise.