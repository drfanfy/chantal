/**
 * Données statiques restantes : liste des formations par défaut, utilisée
 * uniquement pour l'amorçage (seed) de la table formations au premier accès admin.
 *
 * Les anciennes données de démonstration (partenaires, prompts, workflows,
 * réponses fictives) ont été retirées du code : les prompts et workflows du POC
 * sont repris en base, marqués « Exemple » (migration 20261116000900_demo_content.sql).
 */
export const formations = [
  {
    id: "prompt-engineering",
    name: "Prompt Engineering",
    desc: "Maîtrisez l'art de communiquer avec l'IA",
    icon: "✨",
  },
  { id: "les-api", name: "Les API", desc: "Comprendre et utiliser les API d'IA", icon: "🔌" },
  {
    id: "ia-fondamentaux",
    name: "L'IA (fondamentaux)",
    desc: "Les bases de l'intelligence artificielle",
    icon: "🧠",
  },
  { id: "rgpd", name: "RGPD", desc: "Protection des données et IA", icon: "🔒" },
  { id: "charte-ia", name: "Charte IA", desc: "Bonnes pratiques et éthique de l'IA", icon: "📋" },
];
