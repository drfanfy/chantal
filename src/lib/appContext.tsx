import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  speakerName?: string;       // nom de l'IA au moment de l'envoi (figé par message)
  speakerAvatarUrl?: string | null;  // avatar URL de l'IA au moment de l'envoi
  speakerIcon?: string | null;       // emoji icon de l'agent au moment de l'envoi
  files?: { name: string; type: string; url?: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  user: string;
  date: Date;
  messages: Message[];
  model: string;
  agent: string;
  partnerId?: string | null;
  type: "chat" | "workflow";
  workflowId?: string;
}

export type ViewMode = "chat" | "workflow" | "formation" | "admin" | "partners" | "prompts" | "studio";

export type FavoriteKind = "partner" | "agent" | "workflow" | "prompt";
export interface FavoriteRef { kind: FavoriteKind; id: string }

interface AppState {
  conversations: Conversation[];
  conversationsLoaded: boolean;
  activeConversationId: string | null;
  currentModel: string;
  currentAgent: string;
  currentPartner: string | null;
  viewMode: ViewMode;
  activeWorkflow: string | null;
  activeFormation: string | null;
  sidebarOpen: boolean;
  favorites: FavoriteRef[];
  currentUser: string;
  pendingPrefill: string;
}

interface AppContextType extends AppState {
  setCurrentModel: (m: string) => void;
  setCurrentAgent: (a: string) => void;
  setCurrentPartner: (id: string | null) => void;
  setViewMode: (v: ViewMode) => void;
  setActiveWorkflow: (w: string | null) => void;
  setActiveFormation: (f: string | null) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (msg: Omit<Message, "id" | "timestamp">) => void;
  createConversation: (title: string, type: "chat" | "workflow") => string;
  renameConversation: (id: string, title: string) => void;
  toggleSidebar: () => void;
  toggleFavorite: (ref: FavoriteRef) => void;
  isFavorite: (ref: FavoriteRef) => boolean;
  setPendingPrefill: (text: string) => void;
  consumePrefill: () => string;
  prepareConversation: (id: string, title: string) => void;
  loadConversationsFromDB: (userId: string) => Promise<void>;
}

const fakeUsers = ["François", "Justine", "Marie", "Antoine", "Claire", "Thomas", "Sophie", "Lucas"];
const pickUser = () => fakeUsers[Math.floor(Math.random() * fakeUsers.length)];

function msg(id: string, role: "user" | "assistant", content: string, minAgo: number): Message {
  return { id, role, content, timestamp: new Date(Date.now() - minAgo * 60000) };
}

const seedConversations: Conversation[] = [
  {
    id: "c1", title: "Assistant rédaction – Résidence Lyon", user: "François", date: new Date(), model: "Claude", agent: "Assistant rédaction", partnerId: "eva", type: "chat",
    messages: [
      msg("c1m1", "user", "Bonjour, j'ai besoin d'un argumentaire de vente pour notre nouveau programme « Les Jardins de Monplaisir » à Lyon 8e. C'est du T2 au T4, standing premium, livraison 2026.", 45),
      msg("c1m2", "assistant", "## Argumentaire de vente — Les Jardins de Monplaisir\n\n### Un écrin de verdure au cœur de Lyon 8e\n\nSitué dans le quartier prisé de Monplaisir, ce programme d'exception offre une parenthèse de nature en plein cœur urbain.\n\n**Points forts :**\n- 🏛️ **Architecture contemporaine** signée par un cabinet de renom\n- 🌿 **1 200 m² d'espaces verts** privatifs avec jardins paysagers\n- 🚇 **À 5 min à pied** du métro Monplaisir-Lumière\n- ✨ **Prestations premium** : parquet chêne, cuisine équipée Siemens, domotique\n\n### Gamme de prix\n| Typologie | Surface | Prix à partir de |\n|-----------|---------|-------------------|\n| T2 | 43 m² | 245 000 € |\n| T3 | 65 m² | 345 000 € |\n| T4 | 85 m² | 445 000 € |\n\n### Cible prioritaire\nJeunes actifs et couples CSP+ recherchant un cadre de vie qualitatif avec une forte valeur patrimoniale.\n\n> 💡 **Accroche suggérée** : « Votre jardin secret au cœur de Lyon »", 42),
      msg("c1m3", "user", "Très bien ! Peux-tu me proposer aussi 3 accroches alternatives pour la campagne publicitaire ?", 30),
      msg("c1m4", "assistant", "Voici 3 accroches alternatives pour la campagne :\n\n1. **« Monplaisir réinventé — L'art de vivre lyonnais »**\n   → Joue sur l'identité du quartier et le positionnement lifestyle\n\n2. **« Entre ville et jardin, trouvez votre équilibre »**\n   → Met en avant le concept nature en ville, très recherché post-Covid\n\n3. **« Lyon 8e — Là où le prestige prend racine »**\n   → Positionnement patrimonial haut de gamme, idéal pour investisseurs\n\nJe recommande la n°2 pour le digital (Facebook/Instagram) et la n°1 pour les supports print et l'affichage en agence.", 25),
      msg("c1m5", "user", "Parfait, on part sur la 2. Peux-tu rédiger le post LinkedIn correspondant ?", 15),
      msg("c1m6", "assistant", "## Post LinkedIn\n\n---\n\n🌿 **Entre ville et jardin, trouvez votre équilibre.**\n\nNous sommes fiers de vous présenter **Les Jardins de Monplaisir**, notre nouveau programme immobilier d'exception à Lyon 8e.\n\n📍 Quartier Monplaisir — à deux pas du métro\n🏠 Du T2 au T4 — prestations premium\n📅 Livraison 2026\n\nUn cadre de vie unique alliant architecture contemporaine et espaces verts privatifs de 1 200 m².\n\n→ Découvrez le programme en avant-première : [lien]\n\n#ImmobilierNeuf #Lyon #Monplaisir #InvestissementImmobilier #ProgrammeNeuf\n\n---\n\n*Conseil : Publiez entre mardi et jeudi, 8h-9h pour maximiser la portée organique sur LinkedIn.*", 10),
    ],
  },
  {
    id: "c2", title: "Analyse marketing – Campagne Meta", user: "Justine", date: new Date(), model: "GPT-4o", agent: "Analyse marketing", partnerId: "penelope", type: "chat",
    messages: [
      msg("c2m1", "user", "Peux-tu analyser les résultats de notre dernière campagne Meta Ads pour le programme « Villa Marina » à Nice ? Budget : 8 500 €, durée : 3 semaines, cible : investisseurs 35-55 ans.", 120),
      msg("c2m2", "assistant", "## Analyse de Campagne — Villa Marina (Nice)\n\n### Performance Globale\n| KPI | Valeur | Benchmark secteur |\n|-----|--------|-------------------|\n| Impressions | 342 000 | — |\n| Clics | 4 890 | — |\n| CTR | 1.43% | 0.9-1.2% ✅ |\n| CPC moyen | 1.74 € | 2.10 € ✅ |\n| Leads générés | 127 | — |\n| Coût par lead | 66.93 € | 85 € ✅ |\n| Taux de conversion | 2.60% | 1.8% ✅ |\n\n### Analyse par format\n- **Carrousel** : CTR 1.82% — meilleur performer ✅\n- **Vidéo 15s** : Coût/lead le plus bas (52 €)\n- **Image statique** : CTR faible (0.91%) — à optimiser\n\n### Audience insights\n- **Meilleur segment** : Hommes 40-50 ans, IDF et PACA\n- **Horaires optimaux** : 12h-14h et 20h-22h\n- **Device** : 73% mobile\n\n### Recommandations\n1. Augmenter le budget sur le format carrousel (+30%)\n2. Remplacer les images statiques par des Reels\n3. Créer un lookalike sur les 127 leads\n4. Tester une audience « expatriés français » pour l'investissement locatif", 115),
      msg("c2m3", "user", "Le ROAS est bon comparé à nos autres campagnes ?", 100),
      msg("c2m4", "assistant", "En comparant avec vos campagnes précédentes :\n\n| Campagne | CPL | CTR | ROAS estimé |\n|----------|-----|-----|-------------|\n| Villa Marina (actuelle) | 66.93 € | 1.43% | **4.2x** |\n| Résidence Bagatelle (sept.) | 94 € | 1.05% | 2.8x |\n| Les Terrasses (juin) | 112 € | 0.87% | 2.1x |\n| Parc Royal (mars) | 78 € | 1.21% | 3.5x |\n\n**Villa Marina est votre meilleure campagne de l'année** en termes de CPL et de ROAS. Les facteurs clés de succès :\n- Ciblage affiné sur les investisseurs\n- Créatifs carrousel très performants\n- Landing page optimisée (taux de rebond 38% vs 55% habituellement)\n\n> 💡 Je recommande de documenter cette campagne comme modèle pour les futurs lancements.", 95),
    ],
  },
  {
    id: "c3", title: "Comité Engagement – Projet Bordeaux", user: "Antoine", date: new Date(Date.now() - 86400000), model: "Claude", agent: "Comité Engagement", partnerId: "constance", type: "chat",
    messages: [
      msg("c3m1", "user", "Prépare-moi une fiche synthèse pour le comité d'engagement du projet « Clos des Chartrons » à Bordeaux. 62 lots, budget 14.2M€, foncier maîtrisé.", 1500),
      msg("c3m2", "assistant", "## Fiche Synthèse — Comité d'Engagement\n### Projet : Clos des Chartrons — Bordeaux\n\n---\n\n**Promoteur :** [Votre société]\n**Localisation :** Quartier des Chartrons, Bordeaux (33)\n**Nombre de lots :** 62 (14 T2, 28 T3, 16 T4, 4 T5)\n**Budget global :** 14 200 000 €\n\n---\n\n### Analyse Financière\n| Poste | Montant | % |\n|-------|---------|---|\n| Foncier | 3 800 000 € | 26.8% |\n| Construction | 7 100 000 € | 50.0% |\n| Honoraires | 1 420 000 € | 10.0% |\n| Commercialisation | 852 000 € | 6.0% |\n| Frais financiers | 568 000 € | 4.0% |\n| Aléas | 460 000 € | 3.2% |\n\n### Indicateurs clés\n- **CA prévisionnel** : 18 600 000 €\n- **Marge brute** : 4 400 000 € (23.7%)\n- **TRI** : 15.8%\n- **Point mort** : 47 lots (75.8%)\n- **Délai commercialisation estimé** : 14 mois\n\n### Analyse de risque\n- 🟢 Foncier maîtrisé\n- 🟢 Quartier très recherché (Chartrons)\n- 🟡 Marché bordelais en légère correction (-2%)\n- 🟡 62 lots = volume modéré, attention au rythme\n- 🔴 Aucune pré-commercialisation à date\n\n### Avis\n✅ **Favorable** — Projet bien positionné dans un quartier premium. Recommandation de lancer une pré-commercialisation avant l'obtention du PC pour sécuriser le point mort.", 1490),
      msg("c3m3", "user", "Quel est le risque principal selon toi ?", 1480),
      msg("c3m4", "assistant", "Le **risque principal** est l'absence de pré-commercialisation combinée à un point mort relativement élevé (75.8%).\n\nConcrètement :\n- Vous devez vendre **47 lots sur 62** avant d'atteindre la rentabilité\n- Sans réservations préalables, vous démarrez la construction sans filet\n- Le marché bordelais montre des signes de ralentissement (-2%)\n\n**Plan de mitigation suggéré :**\n1. Lancer une campagne de pré-commercialisation dès maintenant\n2. Viser 15-20% de réservations avant le comité\n3. Négocier un échelonnement du foncier pour réduire le BFR\n4. Prévoir un plan B avec des investisseurs institutionnels pour un bloc de 10-15 lots\n\n> ⚠️ Si la pré-commercialisation n'atteint pas 15% d'ici le comité, je recommande de repousser la décision d'un trimestre.", 1470),
    ],
  },
  {
    id: "c4", title: "Veille SEO – Immobilier neuf", user: "Marie", date: new Date(Date.now() - 86400000), model: "Claude", agent: "Aucun", type: "workflow", workflowId: "veille-seo",
    messages: [
      msg("c4m1", "user", "Workflow exécuté : Veille SEO pour immobilier-neuf.com", 2000),
      msg("c4m2", "assistant", "## Rapport de Veille SEO — immobilier-neuf.com\n\n### Score global : 71/100\n\n**Positions clés :**\n- « immobilier neuf lyon » → Position 6 (↗ +3)\n- « programme neuf bordeaux » → Position 12 (→)\n- « appartement neuf nice » → Position 18 (↘ -2)\n\n**Actions prioritaires :**\n1. Optimiser la page Lyon (potentiel top 3)\n2. Créer un guide « investir à Bordeaux en 2025 »\n3. Revoir le maillage interne sur les pages programmes", 1990),
    ],
  },
  {
    id: "c5", title: "Projections financières – Programme X", user: "Thomas", date: new Date(Date.now() - 3 * 86400000), model: "Claude", agent: "Aucun", type: "workflow", workflowId: "projections",
    messages: [
      msg("c5m1", "user", "Workflow exécuté : Projections financières pour « Les Hauts de Bellecour »", 5000),
      msg("c5m2", "assistant", "## Projections Financières — Les Hauts de Bellecour\n\n### Compte de résultat prévisionnel\n| Poste | Montant |\n|-------|---------|\n| CA total | 22 400 000 € |\n| Coûts totaux | 18 150 000 € |\n| **Marge nette** | **4 250 000 € (19.0%)** |\n\n### Scénarios\n- 🟢 Optimiste : Marge 23.2%\n- 🟡 Base : Marge 19.0%\n- 🔴 Pessimiste : Marge 14.5%\n\n### Cash-flow\nPoint d'équilibre atteint au **mois 16** avec 68% des lots vendus.", 4990),
      msg("c5m3", "user", "Que se passe-t-il si on augmente les prix de 5% ?", 4950),
      msg("c5m4", "assistant", "Avec une augmentation de **+5% sur les prix de vente** :\n\n| Indicateur | Base | +5% prix |\n|------------|------|----------|\n| CA total | 22 400 000 € | 23 520 000 € |\n| Marge nette | 4 250 000 € | 5 370 000 € |\n| Marge % | 19.0% | **22.8%** |\n| Point mort | 68% lots | 63% lots |\n| TRI | 14.2% | 17.1% |\n\n**Impact :** La marge augmente de **+26.4%** pour une hausse de prix de seulement 5%. Le point mort baisse de 5 points.\n\n> ⚠️ **Attention** : vérifier que le marché local supporte cette hausse. Recommandation : tester sur les T4 d'abord (clientèle moins sensible au prix).", 4940),
    ],
  },
  {
    id: "c6", title: "Campagne digitale été", user: "Claire", date: new Date(Date.now() - 5 * 86400000), model: "Gemini", agent: "Analyse marketing", partnerId: "penelope", type: "chat",
    messages: [
      msg("c6m1", "user", "Propose une stratégie d'acquisition digitale pour l'été, budget 25 000 €, cible primo-accédants 25-35 ans en Île-de-France.", 8000),
      msg("c6m2", "assistant", "## Stratégie d'Acquisition Digitale — Été 2025\n\n### Budget total : 25 000 €\n\n### Répartition par canal\n| Canal | Budget | Objectif leads |\n|-------|--------|----------------|\n| Meta Ads | 10 000 € (40%) | 120-150 |\n| Google Ads | 8 000 € (32%) | 80-100 |\n| TikTok Ads | 4 000 € (16%) | 40-60 |\n| Influence locale | 3 000 € (12%) | 30-40 |\n\n### Planning\n- **Juin** : Lancement campagnes + tests A/B\n- **Juillet** : Optimisation + scaling des meilleurs performers\n- **Août** : Retargeting intensif + offre rentrée\n\n### Créatifs recommandés\n1. **Format Reel/TikTok** : \"Mon premier appart en IDF\" (storytelling)\n2. **Carrousel Meta** : Comparatif loyer vs. mensualité\n3. **Search Google** : Mots-clés intent \"acheter premier appartement\"\n\n**CPL cible global : 92 €**\n**Objectif total : 270-350 leads qualifiés**", 7990),
    ],
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    conversations: [],
    conversationsLoaded: false,
    activeConversationId: null,
    currentModel: "Claude",
    currentAgent: "Aucun",
    currentPartner: null,
    viewMode: "chat",
    activeWorkflow: null,
    activeFormation: null,
    sidebarOpen: true,
    favorites: [
      { kind: "partner", id: "eva" },
      { kind: "agent", id: "redaction" },
      { kind: "workflow", id: "comite-engagement" },
    ],
    currentUser: "François Dupont",
    pendingPrefill: "",
  });

  const setCurrentModel = useCallback((m: string) => setState(s => ({ ...s, currentModel: m, currentPartner: null })), []);
  const setCurrentAgent = useCallback((a: string) => setState(s => ({ ...s, currentAgent: a, currentPartner: null })), []);
  const setCurrentPartner = useCallback((id: string | null) => setState(s => ({ ...s, currentPartner: id })), []);
  const setViewMode = useCallback((v: ViewMode) => setState(s => ({ ...s, viewMode: v })), []);
  const setActiveWorkflow = useCallback((w: string | null) => setState(s => ({ ...s, activeWorkflow: w, viewMode: w ? "workflow" : s.viewMode })), []);
  const setActiveFormation = useCallback((f: string | null) => setState(s => ({ ...s, activeFormation: f, viewMode: f ? "formation" : s.viewMode })), []);
  const setActiveConversation = useCallback((id: string | null) => {
    setState(s => {
      const conv = s.conversations.find(c => c.id === id);
      if (conv) {
        return {
          ...s,
          activeConversationId: id,
          viewMode: conv.type === "workflow" ? "workflow" : "chat",
          activeWorkflow: conv.type === "workflow" && conv.workflowId ? conv.workflowId : null,
          currentModel: conv.model || s.currentModel,
          currentAgent: conv.agent || s.currentAgent,
          currentPartner: conv.partnerId ?? s.currentPartner,
        };
      }
      return { ...s, activeConversationId: id, viewMode: "chat", activeWorkflow: null };
    });
  }, []);
  const toggleSidebar = useCallback(() => setState(s => ({ ...s, sidebarOpen: !s.sidebarOpen })), []);

  const toggleFavorite = useCallback((ref: FavoriteRef) => {
    setState(s => {
      const exists = s.favorites.some(f => f.kind === ref.kind && f.id === ref.id);
      return {
        ...s,
        favorites: exists
          ? s.favorites.filter(f => !(f.kind === ref.kind && f.id === ref.id))
          : [...s.favorites, ref],
      };
    });
  }, []);
  const isFavorite = useCallback((ref: FavoriteRef) => {
    return state.favorites.some(f => f.kind === ref.kind && f.id === ref.id);
  }, [state.favorites]);

  const createConversation = useCallback((title: string, type: "chat" | "workflow") => {
    const id = crypto.randomUUID();
    setState(s => {
      const conv: Conversation = { id, title, user: pickUser(), date: new Date(), messages: [], model: s.currentModel, agent: s.currentAgent, partnerId: s.currentPartner, type };
      return { ...s, conversations: [conv, ...s.conversations], activeConversationId: id };
    });
    return id;
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setState(s => ({ ...s, conversations: s.conversations.map(c => c.id === id ? { ...c, title } : c) }));
  }, []);

  const addMessage = useCallback((m: Omit<Message, "id" | "timestamp">) => {
    const message: Message = { ...m, id: `m-${Date.now()}-${Math.random()}`, timestamp: new Date() };
    setState(s => {
      let convId = s.activeConversationId;
      if (!convId) {
        const id = crypto.randomUUID();
        const conv: Conversation = { id, title: m.content.slice(0, 40) || "Nouvelle conversation", user: s.currentUser, date: new Date(), messages: [message], model: s.currentModel, agent: s.currentAgent, partnerId: s.currentPartner, type: "chat" };
        return { ...s, conversations: [conv, ...s.conversations], activeConversationId: id };
      }
      return {
        ...s,
        conversations: s.conversations.map(c => c.id === convId ? { ...c, messages: [...c.messages, message] } : c),
      };
    });
  }, []);

  const setPendingPrefill = useCallback((text: string) => setState(s => ({ ...s, pendingPrefill: text })), []);
  const consumePrefill = useCallback(() => {
    let val = "";
    setState(s => { val = s.pendingPrefill; return { ...s, pendingPrefill: "" }; });
    return val;
  }, []);

  const prepareConversation = useCallback((id: string, title: string) => {
    setState(s => {
      if (s.conversations.some(c => c.id === id)) return s;
      const conv: Conversation = { id, title, user: s.currentUser, date: new Date(), messages: [], model: s.currentModel, agent: s.currentAgent, partnerId: s.currentPartner, type: "chat" };
      return { ...s, conversations: [conv, ...s.conversations], activeConversationId: id };
    });
  }, []);

  const loadConversationsFromDB = useCallback(async (userId: string) => {
    console.log("[DB] Chargement conversations pour", userId.slice(0, 8) + "…");

    // Utiliser le nom de la FK explicitement pour éviter une erreur d'ambiguïté
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at, messages!conversation_id(id, role, content, speaker_name, speaker_avatar_url, speaker_icon, created_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[DB] Erreur chargement:", error.message, "code:", error.code);
      // Marquer comme chargé même en cas d'erreur pour ne pas bloquer les routes
      setState(s => ({ ...s, conversationsLoaded: true }));
      return;
    }

    console.log("[DB] Conversations reçues:", data?.length ?? 0);

    type DBMsg = { id: string; role: string; content: string; speaker_name: string | null; speaker_avatar_url: string | null; speaker_icon: string | null; created_at: string };
    type DBConv = { id: string; title: string | null; created_at: string; updated_at: string; messages: DBMsg[] };

    const loaded: Conversation[] = (data as DBConv[] ?? []).map(c => ({
      id: c.id,
      title: c.title ?? "Conversation",
      user: userId,
      date: new Date(c.updated_at ?? c.created_at),
      messages: (c.messages ?? [])
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(m => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          speakerName: m.speaker_name ?? undefined,
          speakerAvatarUrl: m.speaker_avatar_url ?? undefined,
          speakerIcon: m.speaker_icon ?? undefined,
          timestamp: new Date(m.created_at),
        })),
      model: "Groq",
      agent: "Aucun",
      partnerId: null,
      type: "chat" as const,
    }));

    setState(s => ({ ...s, conversations: loaded, conversationsLoaded: true, activeConversationId: null }));
  }, []);

  return (
    <AppContext.Provider value={{ ...state, setCurrentModel, setCurrentAgent, setCurrentPartner, setViewMode, setActiveWorkflow, setActiveFormation, setActiveConversation, addMessage, createConversation, renameConversation, toggleSidebar, toggleFavorite, isFavorite, setPendingPrefill, consumePrefill, prepareConversation, loadConversationsFromDB }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
