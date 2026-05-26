export const models = [
  { id: "openai", name: "OpenAI", desc: "GPT-4o" },
  { id: "claude", name: "Claude", desc: "Claude 3.5 Sonnet" },
  { id: "gemini", name: "Gemini", desc: "Gemini Pro" },
  { id: "notebook", name: "Notebook LLM", desc: "Recherche avancée" },
];

export const agents = [
  { id: "none", name: "Aucun", desc: "Mode libre" },
  { id: "redaction", name: "Assistant rédaction", desc: "Rédaction professionnelle" },
  { id: "engagement", name: "Comité Engagement", desc: "Analyse d'engagement" },
  { id: "commercial", name: "Analyse commerciale", desc: "Intelligence commerciale" },
  { id: "marketing", name: "Analyse marketing", desc: "Performance marketing" },
  { id: "graphiste", name: "Graphiste", desc: "Création visuelle" },
  { id: "dev", name: "Développeur", desc: "Assistance technique" },
  { id: "orga", name: "Organisation", desc: "Productivité & process" },
];

export type PartnerTag = "populaire" | "nouveau" | null;

export interface Partner {
  id: string;
  name: string;
  expertise: string;
  description: string;
  model: string;
  agent: string;
  conversations: number;
  satisfaction: number;
  trend: number;
  emoji: string;
  accent: string;
  tag?: PartnerTag;
  personality?: string;
  useCases?: string[];
}

export const partners: Partner[] = [
  { id: "eva", name: "Eva", expertise: "Rédaction & contenu", description: "Spécialiste rédaction commerciale et storytelling.", model: "Claude", agent: "Assistant rédaction", conversations: 312, satisfaction: 4.8, trend: 12, emoji: "✍️", accent: "violet", tag: "populaire", personality: "Créative & pédagogue", useCases: ["Pitch commercial", "Storytelling", "Post LinkedIn"] },
  { id: "penelope", name: "Pénélope", expertise: "Marketing digital", description: "Analyse de campagnes, performance et acquisition.", model: "OpenAI", agent: "Analyse marketing", conversations: 248, satisfaction: 4.7, trend: 8, emoji: "📊", accent: "blue", tag: "populaire", personality: "Très analytique", useCases: ["Audit marketing", "Analyse de campagne", "Plan média"] },
  { id: "marlene", name: "Marlène", expertise: "Analyse commerciale", description: "Intelligence marché, étude concurrentielle.", model: "Claude", agent: "Analyse commerciale", conversations: 197, satisfaction: 4.6, trend: 5, emoji: "💼", accent: "indigo", personality: "Direct & business-oriented", useCases: ["Analyse concurrentielle", "Étude de marché", "Argumentaire"] },
  { id: "constance", name: "Constance", expertise: "Comité d'engagement", description: "Préparation dossiers, analyse de risque.", model: "Claude", agent: "Comité Engagement", conversations: 156, satisfaction: 4.9, trend: 15, emoji: "🏛️", accent: "violet", personality: "Structurée & rigoureuse", useCases: ["Note de comité", "Analyse de risque", "Synthèse exécutive"] },
  { id: "victoire", name: "Victoire", expertise: "Stratégie & organisation", description: "Process, productivité et coordination équipes.", model: "Gemini", agent: "Organisation", conversations: 134, satisfaction: 4.5, trend: 3, emoji: "🎯", accent: "blue", personality: "Méthodique & calme", useCases: ["Structuration projet", "Roadmap", "Compte rendu"] },
  { id: "lucas", name: "Lucas", expertise: "Développement", description: "Architecture technique, code review, automatisation.", model: "OpenAI", agent: "Développeur", conversations: 178, satisfaction: 4.7, trend: 10, emoji: "💻", accent: "indigo", tag: "nouveau", personality: "Pragmatique & technique", useCases: ["Code review", "Automatisation", "Architecture"] },
  { id: "hugo", name: "Hugo", expertise: "Création graphique", description: "Direction artistique, identité visuelle.", model: "Gemini", agent: "Graphiste", conversations: 92, satisfaction: 4.6, trend: 22, emoji: "🎨", accent: "violet", tag: "nouveau", personality: "Créatif & visuel", useCases: ["Moodboard", "Brief créatif", "Identité visuelle"] },
  { id: "gabriel", name: "Gabriel", expertise: "Recherche avancée", description: "Veille marché, synthèse documentaire.", model: "Notebook LLM", agent: "Aucun", conversations: 88, satisfaction: 4.8, trend: 18, emoji: "🔍", accent: "blue", tag: "nouveau", personality: "Curieux & exhaustif", useCases: ["Veille marché", "Synthèse documentaire", "Benchmark"] },
  { id: "arthur", name: "Arthur", expertise: "Finance & projections", description: "Modélisation financière, scénarios d'investissement.", model: "Claude", agent: "Comité Engagement", conversations: 142, satisfaction: 4.7, trend: 6, emoji: "📈", accent: "indigo", personality: "Rigoureux & chiffré", useCases: ["Projection financière", "Scénarios", "TRI / point mort"] },
  { id: "maxime", name: "Maxime", expertise: "Conseil généraliste", description: "Polyvalent, idéal pour brainstorming et exploration.", model: "OpenAI", agent: "Aucun", conversations: 215, satisfaction: 4.5, trend: 4, emoji: "✨", accent: "violet", personality: "Polyvalent & curieux", useCases: ["Brainstorming", "Exploration", "Reformulation"] },
];

export interface Workflow {
  id: string;
  name: string;
  category: string;
  tag: PartnerTag;
  fields: string[];
  description?: string;
  tags?: string[];
  duration?: number; // minutes
}

export const workflows: Workflow[] = [
  { id: "veille-seo", name: "Veille SEO", category: "Marketing", tag: "populaire", fields: ["URL du site", "Mots-clés cibles", "Concurrents", "Période d'analyse", "Objectif SEO"], description: "Audit SEO complet : positions, opportunités, recommandations.", tags: ["Marketing", "Data / Analyse", "Populaire"], duration: 3 },
  { id: "comite-engagement", name: "Préparation Comité d'engagement", category: "Finance", tag: "populaire", fields: ["Nom du programme", "Ville", "Budget global", "Nombre de lots", "Date du comité", "Promoteur", "Données complémentaires"], description: "Dossier de comité prêt à présenter : analyse, risques, avis.", tags: ["Finance", "Produit immobilier", "Populaire"], duration: 4 },
  { id: "analyse-commerciale", name: "Analyse commerciale", category: "Commercial", tag: null, fields: ["Nom du projet", "Ville", "Cible clientèle", "Budget", "Objectif commercial", "Données complémentaires"], description: "Étude marché, concurrence et positionnement commercial.", tags: ["Commercial", "Produit immobilier"], duration: 3 },
  { id: "analyse-demographique", name: "Analyse démographique", category: "Data / Analyse", tag: "nouveau", fields: ["Ville", "Code postal", "Rayon d'analyse", "Type de bien", "Critères spécifiques", "Sources de données"], description: "Population, ménages, revenus, projections de zone.", tags: ["Data / Analyse", "Produit immobilier", "Nouveau"], duration: 2 },
  { id: "projections", name: "Projections financières", category: "Finance", tag: null, fields: ["Nom du programme", "Nombre de lots", "Prix moyen", "Coût foncier", "Coûts construction", "Marge cible", "Durée commercialisation"], description: "Compte d'exploitation prévisionnel, ratios, scénarios.", tags: ["Finance", "Beta"], duration: 4 },
];

export const workflowTags = [
  "Marketing", "Finance", "Commercial", "Data / Analyse",
  "Produit immobilier", "Communication", "Beta", "Nouveau", "Populaire",
] as const;

export const promptCategories = [
  "Marketing",
  "Commercial",
  "Finance",
  "Produit immobilier",
  "Data / Analyse",
  "Communication",
] as const;

export type PromptCategory = (typeof promptCategories)[number];

export interface Prompt {
  id: string;
  text: string;
  description: string;
  category: PromptCategory;
  vars: string[];
  tag?: PartnerTag;
}

export const prompts: Prompt[] = [
  { id: "p1", text: "Rédige un argumentaire de vente pour un programme immobilier haut de gamme", description: "Pitch commercial premium, prêt à être adapté.", category: "Produit immobilier", vars: ["VILLE", "NOM DU PROGRAMME", "TYPE DE BIEN"], tag: "populaire" },
  { id: "p2", text: "Analyse les performances marketing d'une campagne", description: "KPIs, recommandations, comparaison benchmark.", category: "Marketing", vars: ["NOM DE LA CAMPAGNE", "PÉRIODE", "CANAL"], tag: "populaire" },
  { id: "p3", text: "Propose 3 noms premium pour un programme immobilier", description: "Naming raffiné, avec rationale.", category: "Produit immobilier", vars: ["VILLE", "STYLE", "CIBLE"] },
  { id: "p4", text: "Crée un email de relance client", description: "Email court, personnalisé, taux d'ouverture optimisé.", category: "Communication", vars: ["NOM DU CLIENT", "PROGRAMME", "MOTIF"] },
  { id: "p5", text: "Fais une synthèse de réunion", description: "Compte-rendu structuré avec actions et décisions.", category: "Communication", vars: ["DATE", "PARTICIPANTS", "SUJET"] },
  { id: "p6", text: "Génère un plan média", description: "Répartition multi-canaux selon budget et cible.", category: "Marketing", vars: ["BUDGET", "CIBLE", "DURÉE"], tag: "nouveau" },
  { id: "p7", text: "Analyse un marché local immobilier", description: "Étude de zone : prix, demande, opportunités.", category: "Data / Analyse", vars: ["VILLE", "TYPE DE BIEN", "RAYON"] },
  { id: "p8", text: "Optimise un tunnel de conversion", description: "Audit funnel + recommandations UX/CRO.", category: "Marketing", vars: ["URL", "OBJECTIF", "CIBLE"] },
  { id: "p9", text: "Propose un storytelling produit", description: "Narration émotionnelle, ancrée valeurs marque.", category: "Communication", vars: ["NOM DU PRODUIT", "CIBLE", "VALEURS"] },
  { id: "p10", text: "Crée un post LinkedIn impactant", description: "Format optimisé portée organique.", category: "Communication", vars: ["SUJET", "TONALITÉ", "CTA"], tag: "populaire" },
  { id: "p11", text: "Analyse un fichier client", description: "Segmentation, insights, opportunités commerciales.", category: "Data / Analyse", vars: ["SEGMENT", "PÉRIODE", "CRITÈRES"] },
  { id: "p12", text: "Propose une stratégie SEO", description: "Roadmap mots-clés, contenus et netlinking.", category: "Marketing", vars: ["SITE WEB", "SECTEUR", "OBJECTIF"] },
  { id: "p13", text: "Génère un persona client", description: "Persona détaillé : besoins, freins, parcours.", category: "Commercial", vars: ["SECTEUR", "PRODUIT", "MARCHÉ"], tag: "nouveau" },
  { id: "p14", text: "Crée un script commercial", description: "Pitch téléphonique avec gestion des objections.", category: "Commercial", vars: ["PRODUIT", "CIBLE", "OBJECTIONS"] },
  { id: "p15", text: "Propose une stratégie d'acquisition digitale", description: "Plan complet multi-canaux digitaux.", category: "Marketing", vars: ["BUDGET", "CIBLE", "CANAUX"] },
  { id: "p16", text: "Calcule la rentabilité d'un programme immobilier", description: "TRI, marge, point mort, scénarios.", category: "Finance", vars: ["INVESTISSEMENT", "REVENUS", "DURÉE"], tag: "populaire" },
  { id: "p17", text: "Prépare une note pour comité d'investissement", description: "Synthèse exécutive, risques, recommandation.", category: "Finance", vars: ["PROJET", "MONTANT", "DATE COMITÉ"] },
];

export const formations = [
  { id: "prompt-engineering", name: "Prompt Engineering", desc: "Maîtrisez l'art de communiquer avec l'IA", icon: "✨" },
  { id: "les-api", name: "Les API", desc: "Comprendre et utiliser les API d'IA", icon: "🔌" },
  { id: "ia-fondamentaux", name: "L'IA (fondamentaux)", desc: "Les bases de l'intelligence artificielle", icon: "🧠" },
  { id: "rgpd", name: "RGPD", desc: "Protection des données et IA", icon: "🔒" },
  { id: "charte-ia", name: "Charte IA", desc: "Bonnes pratiques et éthique de l'IA", icon: "📋" },
];

export const fakeResponses: Record<string, string> = {
  default: `Voici mon analyse détaillée :

## Points clés

- **Contexte** : Le marché présente des opportunités significatives dans le segment identifié.
- **Recommandations** : Nous suggérons une approche en trois phases pour maximiser l'impact.
- **Prochaines étapes** : Validation des hypothèses avec les données terrain.

### Détail de l'analyse

Le positionnement actuel permet d'envisager plusieurs axes de développement. Les indicateurs de performance montrent une tendance favorable sur les 6 derniers mois, avec une croissance de 12% sur le segment cible.

> 💡 **Point d'attention** : Il sera important de valider ces projections avec les données du Q2.

N'hésitez pas à me demander des précisions sur un point spécifique.`,
  commercial: `## Analyse Commerciale

### Synthèse du marché

Le marché local présente les caractéristiques suivantes :

| Indicateur | Valeur | Tendance |
|------------|--------|----------|
| Prix moyen/m² | 4 250 € | ↗ +3.2% |
| Stock disponible | 142 lots | ↘ -8% |
| Délai de vente moyen | 4.2 mois | → stable |
| Taux d'absorption | 78% | ↗ +5% |

### Recommandations

1. **Positionnement prix** : Se situer entre 4 100 € et 4 400 €/m²
2. **Cible prioritaire** : Primo-accédants 28-35 ans
3. **Canaux** : Digital (65%), Prescripteurs (25%), Direct (10%)`,
  document: `## Analyse du document

J'ai bien reçu et analysé votre document. Voici les points essentiels :

### Résumé

Le document contient **24 pages** avec des données structurées concernant le projet. Les informations clés ont été extraites et catégorisées.

### Points saillants

- 📊 **Données financières** : Budget conforme aux projections initiales
- 📍 **Localisation** : Zone en développement avec fort potentiel
- 👥 **Cible** : Profil identifié correspond au marché local
- ⚠️ **Risques** : 2 points d'attention identifiés

### Recommandation

Je suggère de compléter l'analyse avec les données démographiques locales pour affiner le positionnement.`,
};

export const workflowResults: Record<string, string> = {
  "veille-seo": `## Rapport de Veille SEO

### Performance Globale
- **Score SEO** : 74/100 (+3 pts vs mois dernier)
- **Positions moyennes** : 12.4 (-2.1, amélioration)
- **Trafic organique estimé** : 8 420 visites/mois

### Top mots-clés positionnés
1. "programme immobilier neuf" — Position 4 ↗
2. "appartement neuf" — Position 8 ↗
3. "investissement immobilier" — Position 15 →
4. "défiscalisation pinel" — Position 22 ↘

### Opportunités identifiées
- 12 mots-clés longue traîne à fort potentiel
- 3 contenus à optimiser en priorité
- Backlinks : 5 opportunités de partenariat identifiées

### Actions recommandées
1. Optimiser les pages programmes avec les mots-clés identifiés
2. Créer 3 articles de blog ciblés
3. Mettre à jour les méta-descriptions des 10 pages principales`,

  "comite-engagement": `## Dossier Comité d'Engagement

### Synthèse du Programme
Le programme présente un profil de risque modéré avec des indicateurs favorables.

### Analyse Financière
| Poste | Montant | % Budget |
|-------|---------|----------|
| Foncier | 2 400 000 € | 28% |
| Construction | 4 200 000 € | 49% |
| Commercialisation | 520 000 € | 6% |
| Frais divers | 1 480 000 € | 17% |

### Indicateurs Clés
- **Marge prévisionnelle** : 18.5%
- **TRI** : 14.2%
- **Point mort** : 62% des lots
- **Pré-commercialisation** : 35%

### Avis
✅ **Favorable** sous réserve de la confirmation du permis de construire.`,

  "analyse-commerciale": `## Analyse Commerciale Détaillée

### Contexte Marché
Le marché local est dynamique avec une demande soutenue sur le segment visé.

### Concurrence
- 3 programmes concurrents dans un rayon de 2 km
- Prix moyen constaté : 4 180 €/m²
- Taux de commercialisation moyen : 3.8 lots/mois

### Positionnement Recommandé
- **Gamme** : Premium accessible
- **Prix** : 4 050 — 4 350 €/m²
- **Différenciation** : Prestations, espaces verts, services

### Plan d'Action Commercial
1. Phase 1 (M1-M3) : Lancement — objectif 25% de réservation
2. Phase 2 (M4-M8) : Croisière — 50% cumulé
3. Phase 3 (M9-M14) : Finalisation — 85% cumulé`,

  "analyse-demographique": `## Analyse Démographique

### Population
- **Population communale** : 45 200 habitants
- **Croissance annuelle** : +1.2%
- **Âge médian** : 38 ans

### Ménages
- Couples avec enfants : 32%
- Personnes seules : 28%
- Couples sans enfant : 24%
- Familles monoparentales : 16%

### Revenus
- **Revenu médian** : 28 400 €/an
- **Part > 35k€** : 38%
- **Taux de propriétaires** : 52%

### Projection
La zone devrait accueillir +2 800 habitants d'ici 2030 grâce aux projets d'infrastructure en cours.`,

  projections: `## Projections Financières

### Compte d'Exploitation Prévisionnel
| Poste | Montant |
|-------|---------|
| Chiffre d'affaires | 12 600 000 € |
| Coût foncier | -2 400 000 € |
| Coûts construction | -6 300 000 € |
| Frais commerciaux | -756 000 € |
| Frais financiers | -378 000 € |
| Frais divers | -504 000 € |
| **Marge nette** | **2 262 000 €** |

### Ratios
- **Marge sur CA** : 17.9%
- **TRI projet** : 13.8%
- **Cash-flow cumulé positif** : Mois 18
- **Point mort** : 58 lots sur 94

### Scénarios
- 🟢 Optimiste (+10% prix) : Marge 22.4%
- 🟡 Base : Marge 17.9%
- 🔴 Pessimiste (-10% prix) : Marge 13.1%`,
};
