# 05 — SSO d'entreprise

> **Statut : préparé dans le code, NON validé.** Aucune connexion réelle à l'annuaire QUARTUS n'a été testée. Le SSO ne doit pas être annoncé comme opérationnel avant les tests listés en fin de document.

## Cible recommandée

**Conserver Supabase Auth** comme socle d'identité et y brancher l'IdP de la DSI.

| Option | Quand | Configuration CHANTAL |
|---|---|---|
| **SAML 2.0** via Supabase SSO (recommandé si l'IdP est Entra ID, ADFS, Okta…) | rattachement par domaine e-mail, gestion centralisée | `VITE_AUTH_SSO_MODE=saml` + `VITE_AUTH_SSO_DOMAIN` ou `VITE_AUTH_SSO_PROVIDER_ID` |
| **OAuth/OIDC** via un fournisseur Supabase (ex. `azure`, `keycloak`) | IdP déjà intégré nativement à Supabase | `VITE_AUTH_SSO_MODE=oidc` + `VITE_AUTH_OIDC_PROVIDER` |

Pourquoi ce choix : aucune réécriture n'est nécessaire. La RLS repose sur `auth.uid()` ; changer de fournisseur d'identité n'impacte ni les données ni les autorisations.

**À vérifier par la DSI** : le SSO SAML de Supabase est réservé à certaines offres payantes. Consultez l'offre souscrite et la documentation « Single Sign-On with SAML 2.0 » de Supabase.

## Séparation identité / profil / autorisations

| Couche | Stockage | Rôle |
|---|---|---|
| Identité | `auth.users` (Supabase) | authentification (mot de passe, SAML ou OIDC) |
| Profil applicatif | `public.profiles` (`is_active`, `identity_provider`, `external_subject`, `provisioning_source`, `last_sign_in_at`) | statut et rattachement |
| Autorisations | `profiles.role` + `role_permissions` | permissions appliquées par la RLS et les routes serveur |

## Parcours livré

1. `/login` (`src/routes/login.tsx`) affiche le bouton SSO et/ou le formulaire mot de passe, selon `VITE_AUTH_PASSWORD_ENABLED` et `VITE_AUTH_SSO_MODE`. Un bandeau signale les environnements autres que la production.
2. Redirection vers l'IdP :
   - SAML : `supabase.auth.signInWithSSO({ domain | providerId })` ;
   - OIDC : `signInWithOAuth`.
3. Retour sur `/auth/callback` (`src/routes/auth.callback.tsx`) : échange du code PKCE (`flowType: "pkce"`, `src/lib/supabase.ts`), puis redirection vers `/home`. Les erreurs de l'IdP sont affichées sans détail technique.
4. À la première connexion, le trigger `handle_new_user` (migration `…000800`) crée le profil :
   - **actif** avec le rôle prévu si une **invitation** valide existe pour l'adresse (Admin › Utilisateurs › Ajouter › Invitation) ;
   - **inactif, en attente** (`pending_approval`, rôle `viewer`) sinon. **Il n'y a donc pas d'inscription libre.**
5. À chaque session, `POST /api/auth/session` (`src/server/authSync.ts`) :
   - met à jour `last_sign_in_at` ;
   - si `SSO_GROUP_SYNC=true`, applique le mapping groupes → rôle (`sso_group_role_mappings`, Admin › Paramètres). Le rôle le plus élevé est retenu, et un compte en attente est activé si un groupe correspond.
6. Un compte en attente ou désactivé voit un écran dédié et peut seulement se déconnecter (`src/components/auth/ProtectedRoute.tsx`).
7. Déconnexion : `supabase.auth.signOut()`, puis redirection vers `VITE_AUTH_SSO_LOGOUT_URL` si elle est définie (déconnexion globale de l'IdP).

**Désactivation** : un administrateur décoche « Compte actif ». L'accès est coupé immédiatement à la prochaine requête (RLS et serveur), et les données sont conservées. Le provisionnement automatique (SCIM) n'est **pas** implémenté.

**Lecture des groupes** : `extractGroups()` lit `app_metadata.groups`, `user_metadata.groups` et les `custom_claims` des identités, y compris le claim Microsoft `…/claims/groups`. Le format réel dépend de l'IdP et du mapping d'attributs SAML. **À valider lors du test.**

## Rattachement des comptes existants (pas de fusion automatique par e-mail)

Une identité SSO crée un **nouveau** compte `auth.users`, même si un compte mot de passe existe avec la même adresse. CHANTAL ne les fusionne **jamais** automatiquement.

- Admin › Utilisateurs affiche aux super admins les « rattachements possibles » (`pending_account_matches`).
- Le bouton **Rattacher…** appelle `merge_user_accounts(ancien, nouveau)`. Après confirmation, il transfère conversations, pièces jointes, favoris, utilisations de prompts, exécutions, événements d'usage, tickets et progression des formations. Il reprend le rôle de l'ancien compte, désactive celui-ci, et journalise l'opération.

## Paramètres attendus de la DSI

| Élément | Valeur à fournir ou configurer |
|---|---|
| Type d'IdP et protocole | SAML 2.0 ou OIDC ; nom de l'IdP (Entra ID ou autre, sans présupposé) |
| SAML : métadonnées IdP | URL ou XML de métadonnées ; domaine(s) e-mail rattachés (ex. `quartus.fr`) |
| SAML : attributs | e-mail (obligatoire), nom affiché (`name` ou `full_name`), groupes (si mapping de rôles souhaité) |
| OIDC : application | Client ID, secret (configurés dans Supabase, jamais dans CHANTAL), tenant ou URL d'émetteur |
| Groupes → rôles | liste des groupes (identifiants, pas seulement les noms) et rôle CHANTAL associé |
| Politique de création | invitation obligatoire ou activation par groupe (`SSO_GROUP_SYNC`) |
| Déconnexion | URL de déconnexion globale de l'IdP (facultative) |

## URI à déclarer

URI Supabase, à confirmer dans la console Supabase du projet cible (Authentication › Providers / SSO) :
- SAML, ACS (Reply URL) : `https://<ref>.supabase.co/auth/v1/sso/saml/acs`
- SAML, Entity ID / métadonnées SP : `https://<ref>.supabase.co/auth/v1/sso/saml/metadata`
- OIDC, Redirect URI : `https://<ref>.supabase.co/auth/v1/callback`

URI de l'application, à ajouter dans Supabase › Authentication › URL Configuration › *Redirect URLs* :
- `https://<domaine-chantal>/auth/callback` (production) ;
- `https://<domaine-recette>/auth/callback` ;
- `http://localhost:<port>/auth/callback` (développement, projet dev uniquement).

Commande CLI pour le SAML (projet lié, offre compatible) :

```bash
npx supabase sso add --type saml --metadata-url '<url-metadonnees-idp>' --domains quartus.fr
npx supabase sso list      # récupère l'identifiant → VITE_AUTH_SSO_PROVIDER_ID (facultatif)
```

Désactivez également l'inscription publique dans Supabase › Authentication › Sign In / Providers (« Allow new users to sign up »). Vérifiez que ce réglage n'empêche pas la création des comptes SSO sur l'offre souscrite. Le trigger rend de toute façon inactif tout compte non invité.

## Bascule (recette, puis production)

1. **Recette** : projet Supabase de recette avec les migrations appliquées.
   - Configurer l'IdP de test, `VITE_AUTH_SSO_MODE`, `VITE_AUTH_PASSWORD_ENABLED=true` (transition).
   - Inviter quelques comptes, puis dérouler les tests ci-dessous.
2. **Production**, fenêtre annoncée :
   - configurer le SSO dans Supabase ;
   - déployer avec `VITE_AUTH_SSO_MODE` et `VITE_AUTH_PASSWORD_ENABLED=true` ;
   - créer les invitations ou les mappings de groupes.
3. À la première connexion SSO des utilisateurs existants, les super admins **rattachent** les anciens comptes depuis Admin › Utilisateurs.
4. Une fois tous les comptes rattachés : `VITE_AUTH_PASSWORD_ENABLED=false` et `AUTH_ADMIN_PASSWORD_CREATION=false`, puis redéploiement. Gardez un compte de secours (break-glass) dont le mot de passe est conservé dans le coffre de la DSI : il reste utilisable via la console Supabase.

**Retour arrière** :
- repasser `VITE_AUTH_PASSWORD_ENABLED=true` et `VITE_AUTH_SSO_MODE=none`, puis redéployer ;
- les comptes mot de passe d'origine fonctionnent tant qu'ils n'ont pas été rattachés, puis désactivés ;
- après rattachement, un super admin réactive l'ancien compte (Admin › Utilisateurs). Les données transférées restent sur le nouveau compte : le rattachement n'est pas automatiquement réversible.

**Accès de développement** : la connexion par mot de passe reste disponible sur les environnements `development` et `staging`, sur des projets Supabase distincts de la production. Un bandeau signale l'environnement.

## Tests nécessitant les accès QUARTUS

1. Connexion SSO d'un compte **invité** : profil actif, bon rôle, `identity_provider` = `sso:…`.
2. Connexion SSO d'un compte **non invité** : écran « en attente », aucune donnée accessible.
3. Claims de groupes reçus et mapping appliqué (`SSO_GROUP_SYNC=true`), y compris le cas d'un utilisateur dans plusieurs groupes.
4. Rattachement d'un compte POC existant : données visibles sur la nouvelle identité.
5. Désactivation, puis tentative d'accès : refus. Déconnexion globale (si une URL est fournie).
6. Comportement de « Allow new users to sign up = off » avec le SSO sur l'offre souscrite.
