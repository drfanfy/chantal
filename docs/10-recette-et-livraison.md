# 10 — Recette et livraison

## Synthèse : prêt dans le code / validé dans l'environnement QUARTUS

| Domaine | Prêt dans le code | Validé chez QUARTUS |
|---|:-:|:-:|
| Migrations et RLS (confidentialité, rôles, versions, reporting, provisionnement) | ✅ testé sur PGlite | ❌ non appliqué sur un projet Supabase |
| Appels IA côté serveur, passerelle, quotas, usage unique | ✅ testé (fournisseur fictif, SSE simulés) | ❌ aucun appel réel avec une clé |
| Adaptateur Anthropic (SDK officiel) | ✅ compilé, non testé unitairement | ❌ |
| Adaptateurs OpenAI / compatibles / Gemini | ✅ testés avec des flux simulés | ❌ (Gemini : format à confirmer) |
| Chat privé / partage / pièces jointes | ✅ RLS testée | ❌ parcours navigateur non exécuté |
| Favoris, activité, prompts, workflows, reporting | ✅ RLS et logique testées | ❌ parcours navigateur non exécuté |
| Back-office (tous écrans) | ✅ compile, typé | ❌ non vérifié visuellement (portable, petits écrans) |
| SSO SAML / OIDC | ✅ parcours et provisionnement codés | ❌ aucun IdP connecté |
| Déploiement Vercel | ✅ `npm run build` produit `.vercel/output` | ❌ non déployé ; cron à vérifier |

## Vérifications exécutées (16/11/2026, branche `feature/dsi-handover`)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm test` | ✅ 64/64 (9 fichiers) |
| `npm run test:db` | ✅ 29/29 : migrations sur base vierge et sur données POC simulées ; RLS conversations/messages/pièces jointes ; rôles et escalade ; audit immuable ; provisionnement et invitations ; rattachement ; catalogue IA et activation ; prompts versionnés ; workflows (publication serveur, immutabilité, idempotence, isolation) ; reporting (droits, 0 ≠ indisponible) ; favoris ; accès anonyme |
| `npm run test:unit` | ✅ 35/35 : matrice TS = SQL ; gabarits sans évaluation ; schéma de workflow ; conditions et transformations ; anti-SSRF ; noms de secrets autorisés ; coût (null si donnée manquante) ; adaptateurs OpenAI, compatibles et Gemini (usage, erreurs, masquage des clés) ; passerelle (usage unique, doublon, quotas, concurrence, pas de bascule, mock interdit en prod) ; exécuteur (étapes, condition, SSRF, annulation) |
| `npm run build` | ✅ ; aucun secret ni appel fournisseur dans `.vercel/output/static` (contrôle par `grep`) |
| `npm run lint` | ⚠️ 1 erreur héritée : `src/components/ui/chart.tsx` (`@ts-nocheck` shadcn) |

## Scénarios de recette (à dérouler sur le projet de recette)

Préparez trois comptes : **A** (beta_tester), **B** (beta_tester), **S** (super_admin), plus un compte **V** (viewer).

**Confidentialité**
1. A crée une conversation. B, V et S ne la voient pas dans « Partagées » ; l'URL `/chat/<id>` ouverte par B affiche « Conversation introuvable ».
2. A la partage, avec une confirmation affichée. B la lit dans « Partagées », en lecture seule, sans zone de saisie. Les pièces jointes s'ouvrent pour B.
3. A retire le partage : B ne la voit plus.
4. S masque une conversation partagée (modération) : B ne la voit plus, A la voit avec le badge « Masquée ».
5. V ne peut ni écrire dans le chat ni partager.

**Chat et modèles**
1. Un modèle sans clé apparaît « Non configuré » et ne peut pas être sélectionné ; un envoi forcé est refusé.
2. Un modèle testé et actif répond en streaming. Le bouton « Arrêter » interrompt la réponse, qui est marquée « interrompue ».
3. Une image est envoyée à un modèle avec vision (Claude) et prise en compte ; un PDF est envoyé à Claude.
4. Le reporting compte 1 requête par message, avec ses tokens et son coût.

**Workflows**
1. Admin : un workflow « Exemple » est complété (choix du modèle), testé, puis publié (v1). Une publication sans test est refusée.
2. A lance le workflow : les étapes progressent ; le résultat est copiable et téléchargeable ; il apparaît dans « Mes exécutions ».
3. Un double clic rapide ne crée qu'une seule exécution.
4. Échec provoqué (modèle désactivé) : message clair, bouton « Relancer », même version utilisée.
5. Une modification du brouillon n'affecte pas la v1 en ligne tant qu'elle n'est pas publiée.

**Prompts** : création, publication de la v1, modification puis publication de la v2, restauration de la v1 (crée la v3). A utilise le prompt : la ligne `prompt_usages` référence la bonne version.

**Accueil** : ajout et retrait d'un favori sur deux navigateurs différents (synchronisés) ; favori vers une ressource archivée affiché « indisponible » ; import des anciens favoris locaux ; activité récente avec « Voir plus ».

**Administration** : création d'un utilisateur par invitation ; activation d'un compte en attente ; un admin tente de promouvoir un super admin (refusé) ; journal d'audit alimenté ; paramètre de rétention modifié ; ergonomie vérifiée à 1366×768 et 1280×720, au clavier (Tab, Échap ferme les panneaux, avertissement en cas de modification non enregistrée).

**Reporting** : état vide sans activité ; filtres ; export CSV ouvert dans Excel ; mode démo activé, avec un bandeau visible et l'export désactivé.

**Maintenance** : appel de `/api/cron/maintenance` sans secret (401), puis avec secret (JSON du bilan).

## À configurer par la DSI

### Variables et secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (serveur), `VITE_SUPABASE_*` (client), par environnement.
- [ ] Clés fournisseurs : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`… ou `CHANTAL_SECRET_*`.
- [ ] **Renouveler** les clés exposées par le POC (`VITE_OPENAI_API_KEY`, `VITE_GROQ_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_HF_TOKEN`) et supprimer ces variables.
- [ ] `CRON_SECRET` (≥ 16 caractères aléatoires).
- [ ] `APP_ENV` / `VITE_APP_ENV` par environnement ; `AI_ALLOWED_HOSTS`, `WORKFLOW_HTTP_ALLOWED_HOSTS` ; `CHAT_TITLE_MODEL` (facultatif).
- [ ] SSO : `VITE_AUTH_SSO_MODE`, `VITE_AUTH_SSO_DOMAIN` ou `VITE_AUTH_SSO_PROVIDER_ID`, ou `VITE_AUTH_OIDC_PROVIDER` ; `VITE_AUTH_PASSWORD_ENABLED`, `AUTH_ADMIN_PASSWORD_CREATION`, `SSO_GROUP_SYNC`, `VITE_AUTH_SSO_LOGOUT_URL`.

### Services et infrastructure
- [ ] Projets Supabase distincts pour la recette et la production ; vérifier l'offre (SSO SAML, PITR).
- [ ] Bucket `avatars` (public) présent ; `chat-files` privé, créé par la migration.
- [ ] Vercel : variables par environnement, domaine, cron de maintenance effectif (à vérifier), plafonds de dépense chez les fournisseurs.
- [ ] Désactiver l'inscription publique dans Supabase Auth ; déclarer les *Redirect URLs* `/auth/callback`.
- [ ] Supervision : alertes sur le taux d'erreur, les exécutions `timed_out` et l'échec de la maintenance (voir [07](07-exploitation.md)).
- [ ] Optionnel : file ou worker pour les workflows de plus de 290 s.

### Décisions métier et sécurité
- [ ] Liste des modèles autorisés et des fournisseurs (contrats, localisation et rétention des données chez chaque fournisseur, conformité RGPD et DPA).
- [ ] Rôle par défaut et politique d'activation des comptes (invitation ou groupes SSO) ; correspondance groupes → rôles.
- [ ] Durées de rétention (usage, exécutions, audit, **conversations**, aujourd'hui sans purge automatique).
- [ ] Quotas par modèle et budget.
- [ ] Hôtes externes autorisés pour les workflows.
- [ ] Encadrement des accès techniques privilégiés (clé service_role, console Supabase, Vercel).
- [ ] Statut des contenus « Exemple » (prompts et workflows) : les valider ou les retirer.
- [ ] Communication aux utilisateurs : conversations devenues privées.

### Tests nécessitant les accès QUARTUS
- [ ] Application des migrations sur la recette avec une copie des données POC, puis contrôles de [06](06-migration.md#4-contrôles-après-migration).
- [ ] Test réel de chaque modèle du catalogue (bouton « Tester »), dont la validation du format Gemini.
- [ ] Scénarios de recette ci-dessus dans un navigateur.
- [ ] Tests SSO listés dans [05](05-sso.md#tests-nécessitant-les-accès-quartus).
- [ ] Déploiement Vercel de recette, puis vérification du cron.
- [ ] Mise en production selon [06](06-migration.md#5-production), après sauvegarde.
