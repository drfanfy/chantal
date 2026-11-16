-- =============================================================================
-- Contenus de démonstration repris du POC (src/lib/data.ts)
-- =============================================================================
-- Marqués is_demo = true : affichés avec le badge « Exemple » et distinguables
-- des contenus opérationnels. Les prompts sont publiés (v1) pour préserver
-- l'existant ; les workflows sont créés en BROUILLON car ils exigent le choix
-- d'un modèle réel par un administrateur avant publication.
-- Idempotent : rien n'est créé si le slug existe déjà.
-- =============================================================================

insert into public.prompt_categories(name, sort_order) values
  ('Marketing', 10),
  ('Commercial', 20),
  ('Finance', 30),
  ('Produit immobilier', 40),
  ('Data / Analyse', 50),
  ('Communication', 60)
on conflict (name) do nothing;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p1-redige-un-argumentaire-de-vente-pour-un-programme-', (select id from public.prompt_categories where name = 'Produit immobilier'), '{populaire}'::text[],
         'draft', true, 'viewer', '{"title":"Rédige un argumentaire de vente pour un programme immobilier haut de gamme","description":"Pitch commercial premium, prêt à être adapté.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Rédige un argumentaire de vente pour un programme immobilier haut de gamme\n\n- Ville : {{ville}}\n- Nom du programme : {{nom_du_programme}}\n- Type de bien : {{type_de_bien}}","variables":[{"name":"ville","label":"Ville","required":true,"description":"","default":""},{"name":"nom_du_programme","label":"Nom du programme","required":true,"description":"","default":""},{"name":"type_de_bien","label":"Type de bien","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p1-redige-un-argumentaire-de-vente-pour-un-programme-');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p1-redige-un-argumentaire-de-vente-pour-un-programme-' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p2-analyse-les-performances-marketing-d-une-campagne', (select id from public.prompt_categories where name = 'Marketing'), '{populaire}'::text[],
         'draft', true, 'viewer', '{"title":"Analyse les performances marketing d''une campagne","description":"KPIs, recommandations, comparaison benchmark.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Analyse les performances marketing d''une campagne\n\n- Nom de la campagne : {{nom_de_la_campagne}}\n- Période : {{periode}}\n- Canal : {{canal}}","variables":[{"name":"nom_de_la_campagne","label":"Nom de la campagne","required":true,"description":"","default":""},{"name":"periode","label":"Période","required":true,"description":"","default":""},{"name":"canal","label":"Canal","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p2-analyse-les-performances-marketing-d-une-campagne');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p2-analyse-les-performances-marketing-d-une-campagne' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p3-propose-3-noms-premium-pour-un-programme-immobilie', (select id from public.prompt_categories where name = 'Produit immobilier'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Propose 3 noms premium pour un programme immobilier","description":"Naming raffiné, avec rationale.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Propose 3 noms premium pour un programme immobilier\n\n- Ville : {{ville}}\n- Style : {{style}}\n- Cible : {{cible}}","variables":[{"name":"ville","label":"Ville","required":true,"description":"","default":""},{"name":"style","label":"Style","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p3-propose-3-noms-premium-pour-un-programme-immobilie');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p3-propose-3-noms-premium-pour-un-programme-immobilie' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p4-cree-un-email-de-relance-client', (select id from public.prompt_categories where name = 'Communication'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Crée un email de relance client","description":"Email court, personnalisé, taux d''ouverture optimisé.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Crée un email de relance client\n\n- Nom du client : {{nom_du_client}}\n- Programme : {{programme}}\n- Motif : {{motif}}","variables":[{"name":"nom_du_client","label":"Nom du client","required":true,"description":"","default":""},{"name":"programme","label":"Programme","required":true,"description":"","default":""},{"name":"motif","label":"Motif","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p4-cree-un-email-de-relance-client');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p4-cree-un-email-de-relance-client' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p5-fais-une-synthese-de-reunion', (select id from public.prompt_categories where name = 'Communication'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Fais une synthèse de réunion","description":"Compte-rendu structuré avec actions et décisions.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Fais une synthèse de réunion\n\n- Date : {{date}}\n- Participants : {{participants}}\n- Sujet : {{sujet}}","variables":[{"name":"date","label":"Date","required":true,"description":"","default":""},{"name":"participants","label":"Participants","required":true,"description":"","default":""},{"name":"sujet","label":"Sujet","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p5-fais-une-synthese-de-reunion');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p5-fais-une-synthese-de-reunion' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p6-genere-un-plan-media', (select id from public.prompt_categories where name = 'Marketing'), '{nouveau}'::text[],
         'draft', true, 'viewer', '{"title":"Génère un plan média","description":"Répartition multi-canaux selon budget et cible.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Génère un plan média\n\n- Budget : {{budget}}\n- Cible : {{cible}}\n- Durée : {{duree}}","variables":[{"name":"budget","label":"Budget","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""},{"name":"duree","label":"Durée","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p6-genere-un-plan-media');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p6-genere-un-plan-media' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p7-analyse-un-marche-local-immobilier', (select id from public.prompt_categories where name = 'Data / Analyse'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Analyse un marché local immobilier","description":"Étude de zone : prix, demande, opportunités.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Analyse un marché local immobilier\n\n- Ville : {{ville}}\n- Type de bien : {{type_de_bien}}\n- Rayon : {{rayon}}","variables":[{"name":"ville","label":"Ville","required":true,"description":"","default":""},{"name":"type_de_bien","label":"Type de bien","required":true,"description":"","default":""},{"name":"rayon","label":"Rayon","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p7-analyse-un-marche-local-immobilier');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p7-analyse-un-marche-local-immobilier' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p8-optimise-un-tunnel-de-conversion', (select id from public.prompt_categories where name = 'Marketing'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Optimise un tunnel de conversion","description":"Audit funnel + recommandations UX/CRO.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Optimise un tunnel de conversion\n\n- Url : {{url}}\n- Objectif : {{objectif}}\n- Cible : {{cible}}","variables":[{"name":"url","label":"Url","required":true,"description":"","default":""},{"name":"objectif","label":"Objectif","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p8-optimise-un-tunnel-de-conversion');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p8-optimise-un-tunnel-de-conversion' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p9-propose-un-storytelling-produit', (select id from public.prompt_categories where name = 'Communication'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Propose un storytelling produit","description":"Narration émotionnelle, ancrée valeurs marque.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Propose un storytelling produit\n\n- Nom du produit : {{nom_du_produit}}\n- Cible : {{cible}}\n- Valeurs : {{valeurs}}","variables":[{"name":"nom_du_produit","label":"Nom du produit","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""},{"name":"valeurs","label":"Valeurs","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p9-propose-un-storytelling-produit');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p9-propose-un-storytelling-produit' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p10-cree-un-post-linkedin-impactant', (select id from public.prompt_categories where name = 'Communication'), '{populaire}'::text[],
         'draft', true, 'viewer', '{"title":"Crée un post LinkedIn impactant","description":"Format optimisé portée organique.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Crée un post LinkedIn impactant\n\n- Sujet : {{sujet}}\n- Tonalité : {{tonalite}}\n- Cta : {{cta}}","variables":[{"name":"sujet","label":"Sujet","required":true,"description":"","default":""},{"name":"tonalite","label":"Tonalité","required":true,"description":"","default":""},{"name":"cta","label":"Cta","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p10-cree-un-post-linkedin-impactant');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p10-cree-un-post-linkedin-impactant' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p11-analyse-un-fichier-client', (select id from public.prompt_categories where name = 'Data / Analyse'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Analyse un fichier client","description":"Segmentation, insights, opportunités commerciales.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Analyse un fichier client\n\n- Segment : {{segment}}\n- Période : {{periode}}\n- Critères : {{criteres}}","variables":[{"name":"segment","label":"Segment","required":true,"description":"","default":""},{"name":"periode","label":"Période","required":true,"description":"","default":""},{"name":"criteres","label":"Critères","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p11-analyse-un-fichier-client');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p11-analyse-un-fichier-client' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p12-propose-une-strategie-seo', (select id from public.prompt_categories where name = 'Marketing'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Propose une stratégie SEO","description":"Roadmap mots-clés, contenus et netlinking.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Propose une stratégie SEO\n\n- Site web : {{site_web}}\n- Secteur : {{secteur}}\n- Objectif : {{objectif}}","variables":[{"name":"site_web","label":"Site web","required":true,"description":"","default":""},{"name":"secteur","label":"Secteur","required":true,"description":"","default":""},{"name":"objectif","label":"Objectif","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p12-propose-une-strategie-seo');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p12-propose-une-strategie-seo' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p13-genere-un-persona-client', (select id from public.prompt_categories where name = 'Commercial'), '{nouveau}'::text[],
         'draft', true, 'viewer', '{"title":"Génère un persona client","description":"Persona détaillé : besoins, freins, parcours.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Génère un persona client\n\n- Secteur : {{secteur}}\n- Produit : {{produit}}\n- Marché : {{marche}}","variables":[{"name":"secteur","label":"Secteur","required":true,"description":"","default":""},{"name":"produit","label":"Produit","required":true,"description":"","default":""},{"name":"marche","label":"Marché","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p13-genere-un-persona-client');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p13-genere-un-persona-client' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p14-cree-un-script-commercial', (select id from public.prompt_categories where name = 'Commercial'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Crée un script commercial","description":"Pitch téléphonique avec gestion des objections.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Crée un script commercial\n\n- Produit : {{produit}}\n- Cible : {{cible}}\n- Objections : {{objections}}","variables":[{"name":"produit","label":"Produit","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""},{"name":"objections","label":"Objections","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p14-cree-un-script-commercial');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p14-cree-un-script-commercial' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p15-propose-une-strategie-d-acquisition-digitale', (select id from public.prompt_categories where name = 'Marketing'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Propose une stratégie d''acquisition digitale","description":"Plan complet multi-canaux digitaux.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Propose une stratégie d''acquisition digitale\n\n- Budget : {{budget}}\n- Cible : {{cible}}\n- Canaux : {{canaux}}","variables":[{"name":"budget","label":"Budget","required":true,"description":"","default":""},{"name":"cible","label":"Cible","required":true,"description":"","default":""},{"name":"canaux","label":"Canaux","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p15-propose-une-strategie-d-acquisition-digitale');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p15-propose-une-strategie-d-acquisition-digitale' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p16-calcule-la-rentabilite-d-un-programme-immobilier', (select id from public.prompt_categories where name = 'Finance'), '{populaire}'::text[],
         'draft', true, 'viewer', '{"title":"Calcule la rentabilité d''un programme immobilier","description":"TRI, marge, point mort, scénarios.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Calcule la rentabilité d''un programme immobilier\n\n- Investissement : {{investissement}}\n- Revenus : {{revenus}}\n- Durée : {{duree}}","variables":[{"name":"investissement","label":"Investissement","required":true,"description":"","default":""},{"name":"revenus","label":"Revenus","required":true,"description":"","default":""},{"name":"duree","label":"Durée","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p16-calcule-la-rentabilite-d-un-programme-immobilier');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p16-calcule-la-rentabilite-d-un-programme-immobilier' and published_version_id is null;

insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  select 'poc-p17-prepare-une-note-pour-comite-d-investissement', (select id from public.prompt_categories where name = 'Finance'), '{}'::text[],
         'draft', true, 'viewer', '{"title":"Prépare une note pour comité d''investissement","description":"Synthèse exécutive, risques, recommandation.","instructions":"Complétez les variables puis envoyez la demande dans le chat.","content":"Prépare une note pour comité d''investissement\n\n- Projet : {{projet}}\n- Montant : {{montant}}\n- Date comité : {{date_comite}}","variables":[{"name":"projet","label":"Projet","required":true,"description":"","default":""},{"name":"montant","label":"Montant","required":true,"description":"","default":""},{"name":"date_comite","label":"Date comité","required":true,"description":"","default":""}],"examples":[]}'::jsonb
   where not exists (select 1 from public.prompt_templates where slug = 'poc-p17-prepare-une-note-pour-comite-d-investissement');
select public.publish_prompt(id, 'Reprise du POC') from public.prompt_templates
 where slug = 'poc-p17-prepare-une-note-pour-comite-d-investissement' and published_version_id is null;

insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, status, is_demo, min_role, draft)
select 'poc-veille-seo', 'Veille SEO', 'Audit SEO complet : positions, opportunités, recommandations.', 'Un document Markdown structuré : Audit SEO complet : positions, opportunités, recommandations.',
       'Marketing', '{"Marketing","Data / Analyse","Populaire"}'::text[], 'draft', true, 'beta_tester', '{"version":1,"inputs":[{"key":"url_du_site","label":"URL du site","type":"text","required":true,"maxLength":300,"help":""},{"key":"mots_cles_cibles","label":"Mots-clés cibles","type":"text","required":true,"maxLength":300,"help":""},{"key":"concurrents","label":"Concurrents","type":"text","required":true,"maxLength":300,"help":""},{"key":"periode_d_analyse","label":"Période d''analyse","type":"text","required":true,"maxLength":300,"help":""},{"key":"objectif_seo","label":"Objectif SEO","type":"text","required":true,"maxLength":300,"help":""}],"steps":[{"id":"analyse","type":"llm","name":"Analyse IA","modelId":null,"agentId":null,"system":"Tu es Chantal, l''assistante IA interne du groupe QUARTUS (promotion immobilière). Réponds en français, de façon structurée en Markdown. N''invente aucun chiffre : signale explicitement les données manquantes.","prompt":"Tâche : Veille SEO.\nObjectif : Audit SEO complet : positions, opportunités, recommandations.\n\nDonnées fournies :\n- URL du site : {{inputs.url_du_site}}\n- Mots-clés cibles : {{inputs.mots_cles_cibles}}\n- Concurrents : {{inputs.concurrents}}\n- Période d''analyse : {{inputs.periode_d_analyse}}\n- Objectif SEO : {{inputs.objectif_seo}}\n\nProduis le livrable demandé.","outputVar":"analyse","maxOutputTokens":4000,"responseFormat":"text"}],"output":{"template":"{{vars.analyse}}","format":"markdown"},"limits":{"timeoutSeconds":240}}'::jsonb
 where not exists (select 1 from public.workflow_definitions where slug = 'poc-veille-seo');

insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, status, is_demo, min_role, draft)
select 'poc-comite-engagement', 'Préparation Comité d''engagement', 'Dossier de comité prêt à présenter : analyse, risques, avis.', 'Un document Markdown structuré : Dossier de comité prêt à présenter : analyse, risques, avis.',
       'Finance', '{"Finance","Produit immobilier","Populaire"}'::text[], 'draft', true, 'beta_tester', '{"version":1,"inputs":[{"key":"nom_du_programme","label":"Nom du programme","type":"text","required":true,"maxLength":300,"help":""},{"key":"ville","label":"Ville","type":"text","required":true,"maxLength":300,"help":""},{"key":"budget_global","label":"Budget global","type":"text","required":true,"maxLength":300,"help":""},{"key":"nombre_de_lots","label":"Nombre de lots","type":"text","required":true,"maxLength":300,"help":""},{"key":"date_du_comite","label":"Date du comité","type":"text","required":true,"maxLength":300,"help":""},{"key":"promoteur","label":"Promoteur","type":"text","required":true,"maxLength":300,"help":""},{"key":"donnees_complementaires","label":"Données complémentaires","type":"textarea","required":false,"maxLength":4000,"help":""}],"steps":[{"id":"analyse","type":"llm","name":"Analyse IA","modelId":null,"agentId":null,"system":"Tu es Chantal, l''assistante IA interne du groupe QUARTUS (promotion immobilière). Réponds en français, de façon structurée en Markdown. N''invente aucun chiffre : signale explicitement les données manquantes.","prompt":"Tâche : Préparation Comité d''engagement.\nObjectif : Dossier de comité prêt à présenter : analyse, risques, avis.\n\nDonnées fournies :\n- Nom du programme : {{inputs.nom_du_programme}}\n- Ville : {{inputs.ville}}\n- Budget global : {{inputs.budget_global}}\n- Nombre de lots : {{inputs.nombre_de_lots}}\n- Date du comité : {{inputs.date_du_comite}}\n- Promoteur : {{inputs.promoteur}}\n- Données complémentaires : {{inputs.donnees_complementaires}}\n\nProduis le livrable demandé.","outputVar":"analyse","maxOutputTokens":4000,"responseFormat":"text"}],"output":{"template":"{{vars.analyse}}","format":"markdown"},"limits":{"timeoutSeconds":240}}'::jsonb
 where not exists (select 1 from public.workflow_definitions where slug = 'poc-comite-engagement');

insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, status, is_demo, min_role, draft)
select 'poc-analyse-commerciale', 'Analyse commerciale', 'Étude marché, concurrence et positionnement commercial.', 'Un document Markdown structuré : Étude marché, concurrence et positionnement commercial.',
       'Commercial', '{"Commercial","Produit immobilier"}'::text[], 'draft', true, 'beta_tester', '{"version":1,"inputs":[{"key":"nom_du_projet","label":"Nom du projet","type":"text","required":true,"maxLength":300,"help":""},{"key":"ville","label":"Ville","type":"text","required":true,"maxLength":300,"help":""},{"key":"cible_clientele","label":"Cible clientèle","type":"text","required":true,"maxLength":300,"help":""},{"key":"budget","label":"Budget","type":"text","required":true,"maxLength":300,"help":""},{"key":"objectif_commercial","label":"Objectif commercial","type":"text","required":true,"maxLength":300,"help":""},{"key":"donnees_complementaires","label":"Données complémentaires","type":"textarea","required":false,"maxLength":4000,"help":""}],"steps":[{"id":"analyse","type":"llm","name":"Analyse IA","modelId":null,"agentId":null,"system":"Tu es Chantal, l''assistante IA interne du groupe QUARTUS (promotion immobilière). Réponds en français, de façon structurée en Markdown. N''invente aucun chiffre : signale explicitement les données manquantes.","prompt":"Tâche : Analyse commerciale.\nObjectif : Étude marché, concurrence et positionnement commercial.\n\nDonnées fournies :\n- Nom du projet : {{inputs.nom_du_projet}}\n- Ville : {{inputs.ville}}\n- Cible clientèle : {{inputs.cible_clientele}}\n- Budget : {{inputs.budget}}\n- Objectif commercial : {{inputs.objectif_commercial}}\n- Données complémentaires : {{inputs.donnees_complementaires}}\n\nProduis le livrable demandé.","outputVar":"analyse","maxOutputTokens":4000,"responseFormat":"text"}],"output":{"template":"{{vars.analyse}}","format":"markdown"},"limits":{"timeoutSeconds":240}}'::jsonb
 where not exists (select 1 from public.workflow_definitions where slug = 'poc-analyse-commerciale');

insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, status, is_demo, min_role, draft)
select 'poc-analyse-demographique', 'Analyse démographique', 'Population, ménages, revenus, projections de zone.', 'Un document Markdown structuré : Population, ménages, revenus, projections de zone.',
       'Data / Analyse', '{"Data / Analyse","Produit immobilier","Nouveau"}'::text[], 'draft', true, 'beta_tester', '{"version":1,"inputs":[{"key":"ville","label":"Ville","type":"text","required":true,"maxLength":300,"help":""},{"key":"code_postal","label":"Code postal","type":"text","required":true,"maxLength":300,"help":""},{"key":"rayon_d_analyse","label":"Rayon d''analyse","type":"text","required":true,"maxLength":300,"help":""},{"key":"type_de_bien","label":"Type de bien","type":"text","required":true,"maxLength":300,"help":""},{"key":"criteres_specifiques","label":"Critères spécifiques","type":"textarea","required":false,"maxLength":4000,"help":""},{"key":"sources_de_donnees","label":"Sources de données","type":"textarea","required":false,"maxLength":4000,"help":""}],"steps":[{"id":"analyse","type":"llm","name":"Analyse IA","modelId":null,"agentId":null,"system":"Tu es Chantal, l''assistante IA interne du groupe QUARTUS (promotion immobilière). Réponds en français, de façon structurée en Markdown. N''invente aucun chiffre : signale explicitement les données manquantes.","prompt":"Tâche : Analyse démographique.\nObjectif : Population, ménages, revenus, projections de zone.\n\nDonnées fournies :\n- Ville : {{inputs.ville}}\n- Code postal : {{inputs.code_postal}}\n- Rayon d''analyse : {{inputs.rayon_d_analyse}}\n- Type de bien : {{inputs.type_de_bien}}\n- Critères spécifiques : {{inputs.criteres_specifiques}}\n- Sources de données : {{inputs.sources_de_donnees}}\n\nProduis le livrable demandé.","outputVar":"analyse","maxOutputTokens":4000,"responseFormat":"text"}],"output":{"template":"{{vars.analyse}}","format":"markdown"},"limits":{"timeoutSeconds":240}}'::jsonb
 where not exists (select 1 from public.workflow_definitions where slug = 'poc-analyse-demographique');

insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, status, is_demo, min_role, draft)
select 'poc-projections', 'Projections financières', 'Compte d''exploitation prévisionnel, ratios, scénarios.', 'Un document Markdown structuré : Compte d''exploitation prévisionnel, ratios, scénarios.',
       'Finance', '{"Finance","Beta"}'::text[], 'draft', true, 'beta_tester', '{"version":1,"inputs":[{"key":"nom_du_programme","label":"Nom du programme","type":"text","required":true,"maxLength":300,"help":""},{"key":"nombre_de_lots","label":"Nombre de lots","type":"text","required":true,"maxLength":300,"help":""},{"key":"prix_moyen","label":"Prix moyen","type":"text","required":true,"maxLength":300,"help":""},{"key":"cout_foncier","label":"Coût foncier","type":"text","required":true,"maxLength":300,"help":""},{"key":"couts_construction","label":"Coûts construction","type":"text","required":true,"maxLength":300,"help":""},{"key":"marge_cible","label":"Marge cible","type":"text","required":true,"maxLength":300,"help":""},{"key":"duree_commercialisation","label":"Durée commercialisation","type":"text","required":true,"maxLength":300,"help":""}],"steps":[{"id":"analyse","type":"llm","name":"Analyse IA","modelId":null,"agentId":null,"system":"Tu es Chantal, l''assistante IA interne du groupe QUARTUS (promotion immobilière). Réponds en français, de façon structurée en Markdown. N''invente aucun chiffre : signale explicitement les données manquantes.","prompt":"Tâche : Projections financières.\nObjectif : Compte d''exploitation prévisionnel, ratios, scénarios.\n\nDonnées fournies :\n- Nom du programme : {{inputs.nom_du_programme}}\n- Nombre de lots : {{inputs.nombre_de_lots}}\n- Prix moyen : {{inputs.prix_moyen}}\n- Coût foncier : {{inputs.cout_foncier}}\n- Coûts construction : {{inputs.couts_construction}}\n- Marge cible : {{inputs.marge_cible}}\n- Durée commercialisation : {{inputs.duree_commercialisation}}\n\nProduis le livrable demandé.","outputVar":"analyse","maxOutputTokens":4000,"responseFormat":"text"}],"output":{"template":"{{vars.analyse}}","format":"markdown"},"limits":{"timeoutSeconds":240}}'::jsonb
 where not exists (select 1 from public.workflow_definitions where slug = 'poc-projections');

