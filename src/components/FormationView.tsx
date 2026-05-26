import { formations } from "@/lib/data";
import { useApp } from "@/lib/appContext";
import { ArrowLeft, Clock, BookOpen, CheckCircle, GraduationCap, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

type Chapter = { title: string; content: string };
type FormationContent = { intro: string; chapters: Chapter[] };

const formationContent: Record<string, FormationContent> = {
  "prompt-engineering": {
    intro:
      "Le prompt engineering est la discipline qui consiste à formuler des instructions claires et efficaces pour obtenir le meilleur des modèles d'IA. Bien utilisé, il transforme un outil générique en véritable assistant métier. Cette formation vous donne les clés pour structurer vos demandes, obtenir des réponses fiables, et gagner du temps au quotidien.",
    chapters: [
      {
        title: "Comprendre ce qu'est un prompt",
        content:
          "Un prompt est simplement le message que vous envoyez à l'IA. Sa qualité détermine directement la qualité de la réponse. Un prompt vague donne une réponse vague ; un prompt précis et contextualisé donne une réponse exploitable.\n\nTrois principes à retenir :\n• L'IA ne devine pas : plus vous êtes explicite, mieux c'est\n• Le contexte compte autant que la question\n• Un bon prompt est souvent itératif : on ajuste, on reformule",
      },
      {
        title: "La structure d'un prompt efficace",
        content:
          "Un prompt professionnel suit généralement cinq éléments :\n\n• Le rôle — « Tu es un expert en marketing immobilier »\n• Le contexte — situation, cible, enjeux\n• La tâche — ce que vous voulez obtenir précisément\n• Le format — liste, tableau, mail, synthèse en 5 points\n• Les contraintes — ton, longueur, public, langue\n\nCette structure évite les allers-retours et donne des résultats directement utilisables.",
      },
      {
        title: "Techniques avancées",
        content:
          "Trois techniques qui changent la donne :\n\n• Le Chain-of-Thought : demander à l'IA de raisonner étape par étape (« explique ton raisonnement avant de conclure »)\n• Le Few-Shot : donner 2 ou 3 exemples du résultat attendu\n• Le prompting itératif : affiner la réponse par étapes successives plutôt que tout demander d'un coup\n\nCes approches sont particulièrement utiles pour l'analyse, la rédaction longue et les tâches complexes.",
      },
      {
        title: "Erreurs fréquentes à éviter",
        content:
          "• Être trop vague (« fais-moi un truc sur l'immobilier »)\n• Mélanger plusieurs demandes dans un seul prompt\n• Oublier le public cible et le ton attendu\n• Ne pas relire et valider la réponse\n• Copier-coller sans adapter au contexte métier\n\nUn bon réflexe : si la réponse ne convient pas, la faute est presque toujours dans le prompt, pas dans l'IA.",
      },
      {
        title: "Applications concrètes en entreprise",
        content:
          "Le prompt engineering s'applique à quasiment tous les métiers :\n\n• Marketing : génération de contenus, annonces, newsletters\n• Commercial : préparation de rendez-vous, relances, argumentaires\n• Finance : synthèses, analyses de chiffres, notes de cadrage\n• RH : fiches de poste, comptes rendus, communications internes\n• Direction : synthèses stratégiques, benchmarks, prises de décision\n\nChaque usage mérite ses propres prompts types, à constituer progressivement en bibliothèque d'équipe.",
      },
    ],
  },
  "les-api": {
    intro:
      "Les API sont les canaux techniques qui permettent à différents logiciels de communiquer entre eux. Dans l'univers de l'IA, elles permettent d'intégrer des modèles comme GPT, Claude ou Gemini directement dans vos outils métiers. Comprendre les API, même sans être développeur, aide à mieux dialoguer avec les équipes techniques et à identifier les opportunités d'automatisation.",
    chapters: [
      {
        title: "Qu'est-ce qu'une API ?",
        content:
          "API signifie « Application Programming Interface ». Concrètement, c'est une porte d'entrée qu'un logiciel expose pour qu'un autre logiciel puisse lui parler.\n\nAnalogie simple : une API, c'est comme le menu d'un restaurant. Vous commandez un plat (requête), la cuisine le prépare (traitement), le serveur vous apporte la réponse (données). Vous n'avez pas besoin de savoir comment la cuisine fonctionne pour passer commande.",
      },
      {
        title: "Les principales API d'IA",
        content:
          "Le marché est dominé par quelques acteurs :\n\n• OpenAI — GPT-4, GPT-4o, DALL·E pour le texte et l'image\n• Anthropic — Claude, réputé pour le raisonnement et les longs documents\n• Google — Gemini, intégré à l'écosystème Workspace\n• Mistral — acteur européen, souvent choisi pour la souveraineté\n• Meta — Llama, modèles ouverts installables en interne\n\nChaque API a ses forces, ses tarifs et ses limites de volume.",
      },
      {
        title: "Comment une API d'IA est facturée",
        content:
          "La plupart des API IA facturent à l'usage, en « tokens ». Un token ≈ 0,75 mot en français.\n\nOn paie généralement :\n• Les tokens d'entrée (ce que vous envoyez)\n• Les tokens de sortie (ce que l'IA répond)\n\nConséquence pratique : plus vos prompts sont longs et vos réponses verbeuses, plus ça coûte. D'où l'importance de prompts clairs et de formats de réponse maîtrisés.",
      },
      {
        title: "Sécurité et bonnes pratiques",
        content:
          "Quelques règles incontournables :\n\n• Ne jamais exposer une clé API dans du code côté client ou un dépôt public\n• Passer par un back-end ou un outil comme Chantal qui centralise les appels\n• Limiter les droits de chaque clé au strict nécessaire\n• Mettre en place un suivi de consommation pour éviter les dérives\n• Anonymiser les données sensibles avant de les envoyer",
      },
      {
        title: "Cas d'usage en entreprise",
        content:
          "Les API d'IA permettent notamment :\n\n• D'automatiser la rédaction de comptes rendus\n• D'enrichir un CRM avec des résumés de conversations\n• De classer automatiquement des emails ou des documents\n• De construire des assistants internes sur vos propres données\n• De générer des contenus marketing à grande échelle\n\nLa valeur vient rarement du modèle seul, mais de son intégration dans vos processus existants.",
      },
    ],
  },
  "ia-fondamentaux": {
    intro:
      "L'intelligence artificielle n'est plus un sujet réservé aux experts. Pour en tirer parti sans naïveté, chaque collaborateur gagne à en comprendre les grands principes : d'où elle vient, comment elle fonctionne, ce qu'elle sait faire, et surtout ce qu'elle ne sait pas faire. Cette formation pose les bases, sans jargon inutile.",
    chapters: [
      {
        title: "Une brève histoire de l'IA",
        content:
          "L'IA est née dans les années 1950 avec l'ambition de reproduire l'intelligence humaine. Elle a connu plusieurs vagues :\n\n• Les systèmes experts (années 80) — règles écrites à la main\n• L'apprentissage automatique (années 2000) — la machine apprend sur des données\n• L'apprentissage profond (années 2010) — réseaux de neurones, reconnaissance d'images\n• L'IA générative (depuis 2022) — ChatGPT et ses successeurs\n\nChaque vague a élargi le champ des usages possibles.",
      },
      {
        title: "Comment un LLM fonctionne (sans jargon)",
        content:
          "Un grand modèle de langage (LLM) comme GPT ou Claude est entraîné sur d'immenses volumes de textes. Son rôle est de prédire, mot après mot, la suite la plus probable.\n\nConséquences importantes :\n• Il ne « comprend » pas comme un humain, il calcule des probabilités\n• Il peut produire des réponses fausses mais crédibles (« hallucinations »)\n• Il ne connaît que ce qu'il a vu à l'entraînement (sauf accès web)\n• La qualité dépend énormément de la consigne",
      },
      {
        title: "Ce que l'IA sait bien faire",
        content:
          "• Reformuler, résumer, traduire\n• Générer des brouillons et des variantes\n• Extraire l'information structurée d'un texte\n• Classer, étiqueter, trier\n• Répondre à des questions sur un corpus donné\n• Coder et expliquer du code\n\nSur ces tâches, l'IA fait gagner un temps considérable — à condition de relire.",
      },
      {
        title: "Ce que l'IA fait mal (ou ne doit pas faire)",
        content:
          "• Les calculs précis sans outil dédié\n• Les faits récents si elle n'a pas accès au web\n• La prise de décision sensible sans supervision humaine\n• Le traitement de données confidentielles sans cadre\n• Les sujets juridiques ou médicaux sans validation d'expert\n\nRègle d'or : l'IA est un assistant, jamais un décideur final.",
      },
      {
        title: "Applications dans votre métier",
        content:
          "Dans l'immobilier et les secteurs connexes, l'IA permet déjà :\n\n• La rédaction d'annonces et de descriptifs de biens\n• L'analyse de marché et de comparables\n• La préparation de rendez-vous clients\n• La synthèse de dossiers volumineux\n• L'assistance à la négociation par scénarios\n• Le traitement accéléré des emails entrants\n\nLe bon réflexe : identifier les tâches répétitives à faible valeur ajoutée et y introduire l'IA en priorité.",
      },
    ],
  },
  rgpd: {
    intro:
      "Utiliser l'IA ne dispense en rien du respect du RGPD — au contraire, cela renforce les obligations. Cette formation rappelle les règles essentielles à connaître dès qu'on manipule des données personnelles avec un outil d'IA, et donne les bons réflexes pour rester conforme au quotidien.",
    chapters: [
      {
        title: "Rappel : ce qu'est une donnée personnelle",
        content:
          "Une donnée personnelle est toute information permettant d'identifier une personne, directement ou indirectement :\n\n• Nom, prénom, email, téléphone\n• Adresse postale, IP, identifiant client\n• Photos, voix, signature\n• Données financières, de santé, de localisation\n\nDès qu'un prompt contient ce type d'information, le RGPD s'applique.",
      },
      {
        title: "Les grands principes du RGPD",
        content:
          "Six principes encadrent tout traitement de données :\n\n• Licéité — il faut une base légale (consentement, contrat, intérêt légitime…)\n• Finalité — les données ne servent qu'à un but défini\n• Minimisation — on ne collecte que ce qui est nécessaire\n• Exactitude — les données doivent être tenues à jour\n• Conservation limitée — on ne garde pas indéfiniment\n• Sécurité — on protège contre les accès non autorisés",
      },
      {
        title: "Les risques spécifiques à l'IA",
        content:
          "L'IA introduit des risques nouveaux :\n\n• Fuite de données via des prompts envoyés à des services externes\n• Ré-entraînement involontaire sur vos données confidentielles\n• Décisions automatisées discriminantes\n• Manque de transparence sur le raisonnement du modèle\n• Difficulté à exercer le droit à l'effacement\n\nD'où l'importance d'utiliser des outils encadrés comme Chantal plutôt que des services grand public.",
      },
      {
        title: "Bonnes pratiques au quotidien",
        content:
          "• Ne jamais coller un fichier client brut dans une IA grand public\n• Anonymiser ou pseudonymiser avant tout traitement\n• Préférer les outils validés par la DSI et le DPO\n• Documenter chaque usage sensible\n• Former régulièrement les équipes\n• En cas de doute, demander — jamais improviser",
      },
      {
        title: "Que faire en cas d'incident ?",
        content:
          "Si vous pensez avoir envoyé par erreur des données sensibles à une IA :\n\n1. Alerter immédiatement votre référent DPO ou sécurité\n2. Noter précisément ce qui a été envoyé, quand, à quel outil\n3. Ne pas tenter de « corriger » seul\n4. Documenter l'incident\n\nUne violation de données doit être notifiée à la CNIL dans les 72 heures. La réactivité fait toute la différence.",
      },
    ],
  },
  "charte-ia": {
    intro:
      "Une charte IA est le document de référence qui encadre l'usage de l'intelligence artificielle dans l'entreprise. Elle protège à la fois les collaborateurs, les clients et l'organisation. Cette formation présente les principes que chacun doit connaître et appliquer au quotidien.",
    chapters: [
      {
        title: "Pourquoi une charte IA ?",
        content:
          "Sans cadre clair, chaque collaborateur utilise l'IA à sa manière, avec des risques variables. La charte sert à :\n\n• Harmoniser les pratiques\n• Protéger les données sensibles\n• Garantir un usage éthique\n• Rassurer les clients et partenaires\n• Préparer la conformité réglementaire (RGPD, IA Act)\n\nC'est un document vivant, à mettre à jour régulièrement.",
      },
      {
        title: "Les cinq principes fondamentaux",
        content:
          "• Transparence — savoir quand et comment l'IA est utilisée\n• Supervision humaine — l'humain reste décisionnaire\n• Confidentialité — protection stricte des données clients\n• Équité — vigilance contre les biais et discriminations\n• Responsabilité — un référent identifié pour chaque usage\n\nCes principes doivent se traduire en règles concrètes et vérifiables.",
      },
      {
        title: "Ce qui est autorisé",
        content:
          "En règle générale, l'utilisation de l'IA est encouragée pour :\n\n• Rédiger des brouillons, reformuler, traduire\n• Résumer des documents internes non confidentiels\n• Générer des idées et des plans\n• Automatiser des tâches répétitives\n• Former et monter en compétences\n\nÀ condition de toujours relire et valider avant diffusion.",
      },
      {
        title: "Ce qui est interdit ou encadré",
        content:
          "Sont strictement encadrés voire interdits :\n\n• L'envoi de données clients dans des IA grand public\n• La prise de décision automatique sans contrôle humain (recrutement, crédit, etc.)\n• La génération de contenus trompeurs ou usurpant une identité\n• L'utilisation d'outils non validés par la DSI\n• Le traitement de données sensibles (santé, opinions…) sans cadre spécifique",
      },
      {
        title: "Votre rôle au quotidien",
        content:
          "Chaque collaborateur est acteur de la conformité :\n\n• Se former régulièrement aux bonnes pratiques\n• Utiliser en priorité les outils internes (comme Chantal)\n• Signaler tout usage douteux ou incident\n• Relire systématiquement les productions de l'IA\n• Citer l'IA quand elle a contribué significativement à un livrable\n\nLa charte n'est pas une contrainte : c'est ce qui permet d'utiliser l'IA avec confiance et durablement.",
      },
    ],
  },
};

export function FormationView() {
  const { activeFormation, setActiveFormation, setViewMode } = useApp();
  const formation = formations.find(f => f.id === activeFormation);

  if (!formation || !activeFormation) return <FormationPicker onPick={(id: string) => setActiveFormation(id)} />;

  const content = formationContent[activeFormation];
  const chapters = content?.chapters ?? [];
  const intro = content?.intro ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Back */}
        <button
          onClick={() => { setActiveFormation(null); setViewMode("formation"); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Retour aux formations
        </button>

        {/* Header */}
        <div className="mb-8">
          <span className="text-3xl mb-3 block">{formation.icon}</span>
          <h1 className="text-2xl font-bold tracking-tight mb-2">{formation.name}</h1>
          <p className="text-muted-foreground text-sm mb-4">{formation.desc}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{chapters.length * 6} min</span>
            <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {chapters.length} chapitres</span>
          </div>
        </div>

        {/* Intro */}
        {intro && (
          <div className="mb-8 p-5 rounded-xl bg-brand/5 border border-brand/10">
            <p className="text-sm text-foreground/90 leading-relaxed">{intro}</p>
          </div>
        )}

        {/* Chapters */}
        <div className="space-y-6">
          {chapters.map((ch, i) => (
            <div key={i} className="formation-card">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <h2 className="text-base font-semibold">{ch.title}</h2>
              </div>
              <div className="pl-9 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {ch.content}
              </div>
              {i < chapters.length - 1 && (
                <div className="pl-9 mt-4">
                  <div className="flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle className="w-3.5 h-3.5" /> Chapitre complété
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormationPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-brand/[0.02]">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-medium mb-3">
            <GraduationCap className="w-3 h-3" /> Apprentissage
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Formations</h1>
          <p className="text-sm text-muted-foreground">Montez en compétence sur l'IA, les API, le RGPD et les bonnes pratiques.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {formations.map((f, i) => (
            <motion.button
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              onClick={() => onPick(f.id)}
              className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand/15 to-violet-500/10 ring-1 ring-brand/20 flex items-center justify-center text-2xl">
                  {f.icon}
                </div>
                <span className="text-[0.65rem] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> ~30 min</span>
              </div>
              <h3 className="text-base font-semibold mb-1">{f.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{f.desc}</p>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-[0.7rem] text-muted-foreground flex items-center gap-1"><BookOpen className="w-3 h-3" /> 5 chapitres</span>
                <span className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                  Démarrer <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
