# 08 — Guide administrateur

Le back-office est accessible par le menu **Admin** (`/admin`). Chaque section n'apparaît que si votre rôle le permet. La base vérifie les droits dans tous les cas.

Comportements communs à toutes les sections :
- l'édition se fait dans un panneau latéral large ;
- un badge « Modifications non enregistrées » s'affiche, avec une confirmation avant de fermer ou de quitter la page ;
- chaque enregistrement est confirmé par une notification ;
- les erreurs sont affichées en clair.

## Utilisateurs (`admin`, `super_admin`)

- **Ajouter** :
  - *Invitation*, la cible SSO : le compte sera actif, avec le rôle choisi, à la première connexion de cette adresse. L'invitation expire après 30 jours.
  - *Mot de passe temporaire* (12 caractères minimum), seulement si l'environnement l'autorise (`AUTH_ADMIN_PASSWORD_CREATION`).
- **Comptes en attente** : un bandeau les signale. Ouvrez le compte, cochez « Compte actif » et choisissez le rôle.
- **Désactiver** un compte : décochez « Compte actif ». L'accès est coupé, les données sont conservées. Préférez cette action à toute suppression.
- **Rattachement** (super admin) : quand une nouvelle identité SSO correspond à un ancien compte de même adresse, utilisez « Rattacher… ». Vérifiez qu'il s'agit bien de la même personne.
- Un admin ne peut ni gérer les super admins ni modifier son propre rôle.

## Modèles IA (`super_admin`)

**Onglet Connexions** : une connexion par fournisseur ou endpoint.
- Saisissez le **nom** de la variable d'environnement contenant la clé (ex. `ANTHROPIC_API_KEY`), **jamais la clé elle-même**.
- L'état « Configurée » indique que le serveur trouve la variable et que l'hôte est autorisé.
- Désactiver une connexion désactive ses modèles.

**Onglet Modèles** :
1. **Nouveau modèle** : nom, identifiant API exact (documentation du fournisseur), connexion, description, icône, ordre.
2. **Capacités** : seules celles exécutées par l'adaptateur sont cochables. Vérifiez chez le fournisseur que le modèle les supporte.
3. **Paramètres** : tokens de sortie par défaut et limite ; température si l'adaptateur la transmet.
4. **Accès** : rôle minimum ; disponibilité dans le chat, les agents et partenaires, les workflows ; quotas.
5. **Enregistrer**, puis **Tester** : un appel réel. Le résultat et la latence s'affichent.
6. Passez le statut à **Actif** : possible uniquement si le test est réussi et postérieur à la dernière modification.
7. **Tarifs** : ajoutez une ligne avec la date d'effet, les prix par million de tokens et l'URL de la source officielle. Pour un changement de prix annoncé, saisissez une ligne à la date future. Les lignes passées ne sont pas supprimables (traçabilité).
8. **Archiver** : les dépendances (partenaires, agents, workflows) sont listées. Aucun remplacement n'est automatique.

## Agents et partenaires (`admin`)

- **Agent** : rôle spécialisé. Son prompt système s'ajoute au socle CHANTAL. Un modèle par défaut est facultatif.
- **Partenaire** : personnage qui impose un modèle et un agent, avec une personnalité et un avatar (téléversement dans le bucket `avatars`, 2 Mo maximum).
- **Archiver** masque l'élément partout et conserve l'historique. **Dupliquer** crée une copie inactive.
- La génération d'avatar par IA du POC a été retirée : elle était non fonctionnelle, faute de crédits HuggingFace.

## Prompts (`admin`)

1. **Nouveau prompt** : renseignez le titre, le contenu avec des variables `{{nom}}`, la description et les consignes. Déclarez les variables ; le bouton « Les déclarer » détecte celles qui manquent. Ajoutez des exemples.
2. **Aperçu / test** : rendu du prompt avec des valeurs d'essai.
3. **Enregistrer le brouillon** n'a aucun effet pour les utilisateurs. **Publier…** crée la version n+1, avec un résumé des modifications.
4. **Historique** : consultation de chaque version. **Restaurer dans le brouillon**, puis **Publier**, crée une nouvelle version.
5. **Exemple** : décochez cette case quand le contenu est validé comme opérationnel.
6. **Catégories** : bouton « Catégorie ». Les **tags** servent de filtres côté utilisateurs.

## Workflows (`admin`)

Onglets de l'éditeur :

| Onglet | Contenu |
|---|---|
| Général | nom, catégorie, description (catalogue), **résultat attendu** (affiché avant lancement), rôle minimum, exemple |
| Champs | champs du formulaire : type, obligatoire, longueur maximale, min/max, options, aide |
| Étapes | IA, Transformation, Condition, Appel HTTP ; ordre ; variable de sortie ; « Exécuter seulement si… » |
| Sortie | gabarit final (`{{vars.x}}`), format, nom du fichier téléchargé, délai maximum |
| Tester | formulaire de test, exécution réelle avec sortie de chaque étape |
| Versions et usage | versions publiées (immuables), statistiques agrégées |
| JSON | édition avancée et copie entre environnements |

Procédure :
1. **Enregistrer le brouillon**. Les points à corriger s'affichent en haut.
2. **Tester** jusqu'au succès.
3. **Publier…**. Le serveur refuse la publication si la définition testée n'est pas exactement celle enregistrée, ou si un modèle ou une connexion utilisés sont inactifs.

Les 5 workflows « Exemple » repris du POC sont en brouillon. Pour chacun : choisissez un modèle à l'étape « Analyse IA », testez, publiez.

**Connexions HTTP** (onglet dédié) : URL de base en HTTPS ; authentification aucune, Bearer ou en-tête, avec la référence d'un secret serveur ; méthodes autorisées ; délai ; taille maximale de réponse. L'hôte doit aussi figurer dans `WORKFLOW_HTTP_ALLOWED_HOSTS`, à demander à la DSI.

## Paramètres

- **Rétention** (super admin) : durées en jours, minimum 30.
- **Mode démo du reporting** (super admin) : à n'utiliser que pour une présentation, jamais en production.
- **Groupes SSO → rôles** (super admin) : identifiant du groupe dans l'annuaire, rôle associé. Ce mapping n'est actif que si `SSO_GROUP_SYNC=true`.

## Journal d'audit

Il se filtre par type d'objet et par libellé. Cliquez sur une ligne pour voir le détail des changements (avant / après). Il est immuable.

## Reporting (menu Reporting)

- Filtres : période, modèle, agent, workflow, inclusion des tests.
- « — » signifie donnée indisponible ; un triangle signale une couverture partielle (tokens ou coûts).
- **Export CSV** : agrégats sans nom d'utilisateur.
- Les définitions des indicateurs sont dans [03-fonctionnement-metier.md](03-fonctionnement-metier.md#reporting--définition-des-indicateurs).

## Modération des conversations (super admin)

Dans l'historique du chat, onglet « Partagées », menu « … » › **Masquer (modération)**. Seules les conversations **partagées** peuvent être masquées. Les conversations privées ne sont pas visibles des administrateurs.
