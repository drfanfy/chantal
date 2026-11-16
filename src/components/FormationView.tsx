import { useCallback, useEffect, useRef, useState } from "react";
import { formations as STATIC_FORMATIONS } from "@/lib/data";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  ArrowLeft,
  Clock,
  BookOpen,
  CheckCircle,
  GraduationCap,
  ArrowRight,
  Pencil,
  Plus,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

function isHtml(s: string) {
  return /<[a-z][\s\S]*>/i.test(s);
}

function calcReadTime(chapters: Chapter[]): number {
  const words = chapters.reduce((acc, ch) => {
    const text = ch.content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return acc + text.split(" ").filter(Boolean).length;
  }, 0);
  return Math.max(1, Math.round(words / 200));
}

function ChapterContent({ content }: { content: string }) {
  if (isHtml(content)) {
    return <div className="pl-9 formation-prose" dangerouslySetInnerHTML={{ __html: content }} />;
  }
  return (
    <div className="pl-9 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
      {content}
    </div>
  );
}

// ─── Contenu par défaut (seed initial) ───────────────────────────────────────

const DEFAULT_CONTENT: Record<
  string,
  { intro: string; chapters: { title: string; content: string }[] }
> = {
  "prompt-engineering": {
    intro:
      "Le prompt engineering est la discipline qui consiste à formuler des instructions claires et efficaces pour obtenir le meilleur des modèles d'IA.",
    chapters: [
      {
        title: "Comprendre ce qu'est un prompt",
        content:
          "Un prompt est simplement le message que vous envoyez à l'IA. Sa qualité détermine directement la qualité de la réponse.\n\nTrois principes :\n• L'IA ne devine pas : plus vous êtes explicite, mieux c'est\n• Le contexte compte autant que la question\n• Un bon prompt est souvent itératif",
      },
      {
        title: "La structure d'un prompt efficace",
        content:
          "Un prompt professionnel suit cinq éléments :\n\n• Le rôle — « Tu es un expert en marketing immobilier »\n• Le contexte — situation, cible, enjeux\n• La tâche — ce que vous voulez obtenir précisément\n• Le format — liste, tableau, mail, synthèse\n• Les contraintes — ton, longueur, public, langue",
      },
      {
        title: "Techniques avancées",
        content:
          "• Le Chain-of-Thought : demander à l'IA de raisonner étape par étape\n• Le Few-Shot : donner 2 ou 3 exemples du résultat attendu\n• Le prompting itératif : affiner la réponse par étapes successives",
      },
      {
        title: "Erreurs fréquentes à éviter",
        content:
          "• Être trop vague\n• Mélanger plusieurs demandes dans un seul prompt\n• Oublier le public cible\n• Ne pas relire et valider la réponse\n• Copier-coller sans adapter au contexte métier",
      },
      {
        title: "Applications concrètes",
        content:
          "• Marketing : génération de contenus, annonces\n• Commercial : préparation de rendez-vous, argumentaires\n• Finance : synthèses, analyses de chiffres\n• RH : fiches de poste, communications internes",
      },
    ],
  },
  "les-api": {
    intro:
      "Les API sont les canaux techniques qui permettent à différents logiciels de communiquer entre eux.",
    chapters: [
      {
        title: "Qu'est-ce qu'une API ?",
        content:
          "API signifie « Application Programming Interface ». C'est une porte d'entrée qu'un logiciel expose pour qu'un autre puisse lui parler.\n\nAnalogie : une API, c'est comme le menu d'un restaurant. Vous commandez, la cuisine prépare, le serveur apporte la réponse.",
      },
      {
        title: "Les principales API d'IA",
        content:
          "• OpenAI — GPT-4, GPT-4o, DALL·E\n• Anthropic — Claude\n• Google — Gemini\n• Mistral — acteur européen\n• Meta — Llama, modèles ouverts",
      },
      {
        title: "Comment une API d'IA est facturée",
        content:
          "La plupart des API IA facturent en « tokens ». Un token ≈ 0,75 mot.\n\nOn paie :\n• Les tokens d'entrée (ce que vous envoyez)\n• Les tokens de sortie (ce que l'IA répond)",
      },
      {
        title: "Sécurité et bonnes pratiques",
        content:
          "• Ne jamais exposer une clé API côté client\n• Passer par un back-end qui centralise les appels\n• Limiter les droits de chaque clé\n• Suivre la consommation pour éviter les dérives",
      },
      {
        title: "Cas d'usage en entreprise",
        content:
          "• Automatiser la rédaction de comptes rendus\n• Enrichir un CRM avec des résumés\n• Classer automatiquement des emails\n• Construire des assistants internes",
      },
    ],
  },
  "ia-fondamentaux": {
    intro:
      "L'intelligence artificielle n'est plus un sujet réservé aux experts. Comprendre ses grands principes permet d'en tirer parti sans naïveté.",
    chapters: [
      {
        title: "Une brève histoire de l'IA",
        content:
          "• Systèmes experts (années 80)\n• Apprentissage automatique (années 2000)\n• Apprentissage profond (années 2010)\n• IA générative (depuis 2022)",
      },
      {
        title: "Comment un LLM fonctionne",
        content:
          "Un grand modèle de langage est entraîné sur d'immenses volumes de textes. Son rôle : prédire, mot après mot, la suite la plus probable.\n\nIl peut produire des réponses fausses mais crédibles (hallucinations).",
      },
      {
        title: "Ce que l'IA sait bien faire",
        content:
          "• Reformuler, résumer, traduire\n• Générer des brouillons et des variantes\n• Extraire l'information structurée d'un texte\n• Classer, étiqueter, trier\n• Coder et expliquer du code",
      },
      {
        title: "Ce que l'IA fait mal",
        content:
          "• Les calculs précis sans outil dédié\n• Les faits récents sans accès au web\n• La prise de décision sensible\n• Les sujets juridiques ou médicaux sans validation d'expert",
      },
      {
        title: "Applications dans votre métier",
        content:
          "• Rédaction d'annonces et descriptifs\n• Analyse de marché\n• Préparation de rendez-vous clients\n• Synthèse de dossiers volumineux\n• Traitement accéléré des emails",
      },
    ],
  },
  rgpd: {
    intro:
      "Utiliser l'IA ne dispense en rien du respect du RGPD — au contraire, cela renforce les obligations.",
    chapters: [
      {
        title: "Rappel : ce qu'est une donnée personnelle",
        content:
          "Toute information permettant d'identifier une personne :\n• Nom, prénom, email, téléphone\n• Adresse postale, IP, identifiant client\n• Photos, voix, signature\n• Données financières, de santé",
      },
      {
        title: "Les grands principes du RGPD",
        content:
          "• Licéité — il faut une base légale\n• Finalité — les données ne servent qu'à un but défini\n• Minimisation — on ne collecte que le nécessaire\n• Exactitude — données tenues à jour\n• Conservation limitée\n• Sécurité",
      },
      {
        title: "Les risques spécifiques à l'IA",
        content:
          "• Fuite de données via des prompts envoyés à des services externes\n• Ré-entraînement involontaire\n• Décisions automatisées discriminantes\n• Difficulté à exercer le droit à l'effacement",
      },
      {
        title: "Bonnes pratiques au quotidien",
        content:
          "• Ne jamais coller un fichier client brut dans une IA grand public\n• Anonymiser avant tout traitement\n• Préférer les outils validés\n• Documenter chaque usage sensible",
      },
      {
        title: "Que faire en cas d'incident ?",
        content:
          "1. Alerter votre référent DPO\n2. Noter précisément ce qui a été envoyé\n3. Ne pas tenter de corriger seul\n4. Documenter l'incident\n\nUne violation doit être notifiée à la CNIL dans les 72 heures.",
      },
    ],
  },
  "charte-ia": {
    intro:
      "Une charte IA encadre l'usage de l'intelligence artificielle dans l'entreprise et protège collaborateurs, clients et organisation.",
    chapters: [
      {
        title: "Pourquoi une charte IA ?",
        content:
          "• Harmoniser les pratiques\n• Protéger les données sensibles\n• Garantir un usage éthique\n• Rassurer les clients et partenaires\n• Préparer la conformité réglementaire",
      },
      {
        title: "Les cinq principes fondamentaux",
        content:
          "• Transparence\n• Supervision humaine\n• Confidentialité\n• Équité\n• Responsabilité",
      },
      {
        title: "Ce qui est autorisé",
        content:
          "• Rédiger des brouillons, reformuler, traduire\n• Résumer des documents internes non confidentiels\n• Générer des idées et des plans\n• Automatiser des tâches répétitives",
      },
      {
        title: "Ce qui est interdit ou encadré",
        content:
          "• L'envoi de données clients dans des IA grand public\n• La prise de décision automatique sans contrôle humain\n• La génération de contenus trompeurs\n• L'utilisation d'outils non validés",
      },
      {
        title: "Votre rôle au quotidien",
        content:
          "• Se former régulièrement\n• Utiliser en priorité les outils internes\n• Signaler tout usage douteux\n• Relire systématiquement les productions de l'IA",
      },
    ],
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Chapter = { id?: string; title: string; content: string };
type Formation = {
  id: string;
  name: string;
  description: string;
  icon: string;
  intro: string;
  chapters: Chapter[];
  is_custom?: boolean;
};
type EditState = {
  name: string;
  description: string;
  icon: string;
  intro: string;
  chapters: Chapter[];
};

interface DbChapter {
  id: string;
  formation_id: string;
  title: string;
  content: string;
  sort_order: number;
}
interface DbFormation {
  id: string;
  name: string;
  description: string;
  icon: string;
  intro: string;
  sort_order: number;
  is_custom: boolean;
  formation_chapters: DbChapter[];
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function FormationView() {
  const { activeFormation, setActiveFormation, setViewMode } = useApp();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<Record<string, EditState>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState<Omit<EditState, "id">>({
    name: "",
    description: "",
    icon: "📚",
    intro: "",
    chapters: [{ title: "", content: "" }],
  });
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Set<string>>(new Set());
  const seededRef = useRef(false);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // ── Chargement depuis Supabase ─────────────────────────────────────────────
  async function loadFormations(): Promise<Formation[]> {
    setLoading(true);
    const { data, error } = await supabase
      .from("formations")
      .select("*, formation_chapters(id, title, content, sort_order)")
      .order("sort_order", { ascending: true });

    if (error || !data) {
      setLoading(false);
      return [];
    }

    const mapped = (data as DbFormation[]).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      icon: f.icon,
      intro: f.intro,
      is_custom: f.is_custom,
      chapters: (f.formation_chapters ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ id: c.id, title: c.title, content: c.content })),
    }));
    setFormations(mapped);
    setLoading(false);
    return mapped;
  }

  // ── Seeding initial (admin, table vide) ────────────────────────────────────
  async function seedDefaultFormations() {
    for (let i = 0; i < STATIC_FORMATIONS.length; i++) {
      const f = STATIC_FORMATIONS[i];
      const content = DEFAULT_CONTENT[f.id];
      if (!content) continue;
      const { error } = await supabase.from("formations").insert({
        id: f.id,
        name: f.name,
        description: f.desc,
        icon: f.icon,
        intro: content.intro,
        sort_order: i,
        is_custom: false,
      });
      if (!error && content.chapters.length > 0) {
        await supabase.from("formation_chapters").insert(
          content.chapters.map((ch, j) => ({
            formation_id: f.id,
            title: ch.title,
            content: ch.content,
            sort_order: j,
          })),
        );
      }
    }
    await loadFormations();
  }

  useEffect(() => {
    void (async () => {
      const loaded = await loadFormations();
      if (loaded.length === 0 && isAdmin && !seededRef.current) {
        seededRef.current = true;
        await seedDefaultFormations();
      }
    })();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chargement progression lecture ────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("formation_progress")
      .select("chapter_id")
      .then(({ data, error }) => {
        if (!error) setProgress(new Set((data ?? []).map((r) => r.chapter_id as string)));
      });
  }, [profile?.id]);

  const markChapterRead = useCallback(
    async (chapterId: string) => {
      if (!profile?.id || progressRef.current.has(chapterId)) return;
      setProgress((prev) => new Set([...prev, chapterId]));
      await supabase
        .from("formation_progress")
        .upsert(
          { user_id: profile.id, chapter_id: chapterId },
          { onConflict: "user_id,chapter_id" },
        );
    },
    [profile?.id],
  );

  // ── Intersection Observer — marque lu quand visible ───────────────────────
  useEffect(() => {
    if (!activeFormation || !profile?.id) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.chapterId;
            if (id) void markChapterRead(id);
          }
        });
      },
      { threshold: 0.6 },
    );
    const timer = setTimeout(() => {
      document.querySelectorAll("[data-chapter-id]").forEach((el) => observer.observe(el));
    }, 150);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [activeFormation, profile?.id, markChapterRead]);

  // ── Sauvegarde d'une formation éditée ─────────────────────────────────────
  async function saveFormation(id: string) {
    const cur = editedContent[id];
    if (!cur) return;
    setSaving(true);

    await supabase
      .from("formations")
      .update({
        name: cur.name,
        description: cur.description,
        icon: cur.icon,
        intro: cur.intro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await supabase.from("formation_chapters").delete().eq("formation_id", id);
    if (cur.chapters.length > 0) {
      await supabase.from("formation_chapters").insert(
        cur.chapters.map((ch, i) => ({
          formation_id: id,
          title: ch.title,
          content: ch.content,
          sort_order: i,
        })),
      );
    }

    setEditedContent((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    setEditMode(false);
    setSaving(false);
    await loadFormations();
  }

  // ── Création d'une formation ───────────────────────────────────────────────
  async function createFormation() {
    if (!newForm.name.trim()) {
      alert("Le titre est obligatoire.");
      return;
    }
    const id = `custom-${Date.now()}`;
    await supabase.from("formations").insert({
      id,
      name: newForm.name,
      description: newForm.description,
      icon: newForm.icon,
      intro: newForm.intro,
      sort_order: formations.length,
      is_custom: true,
    });
    if (newForm.chapters.length > 0) {
      await supabase.from("formation_chapters").insert(
        newForm.chapters.map((ch, i) => ({
          formation_id: id,
          title: ch.title,
          content: ch.content,
          sort_order: i,
        })),
      );
    }
    setNewForm({
      name: "",
      description: "",
      icon: "📚",
      intro: "",
      chapters: [{ title: "", content: "" }],
    });
    setShowCreate(false);
    await loadFormations();
  }

  const formation = formations.find((f) => f.id === activeFormation);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Vue lecture / édition d'une formation ─────────────────────────────────
  if (formation && activeFormation) {
    const cur: EditState = editedContent[activeFormation] ?? {
      name: formation.name,
      description: formation.description,
      icon: formation.icon,
      intro: formation.intro,
      chapters: formation.chapters,
    };

    const set = (field: keyof EditState, val: EditState[keyof EditState]) =>
      setEditedContent((prev) => ({ ...prev, [activeFormation]: { ...cur, [field]: val } }));

    const updChapter = (i: number, field: keyof Chapter, val: string) => {
      const c = [...cur.chapters];
      c[i] = { ...c[i], [field]: val };
      set("chapters", c);
    };

    const isDirty = !!editedContent[activeFormation];

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => {
                setActiveFormation(null);
                setViewMode("formation");
                setEditMode(false);
              }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {editMode && isDirty && (
                  <button
                    onClick={() => void saveFormation(activeFormation)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Sauvegarder
                  </button>
                )}
                <button
                  onClick={() => setEditMode((m) => !m)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${editMode ? "bg-brand/10 text-brand" : "border border-border text-muted-foreground hover:bg-muted"}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editMode ? "Mode édition actif" : "Mode édition"}
                </button>
              </div>
            )}
          </div>

          {/* Header */}
          {editMode ? (
            <div className="space-y-3 mb-8">
              <div className="flex gap-2">
                <input
                  value={cur.icon}
                  onChange={(e) => set("icon", e.target.value)}
                  className="w-14 rounded-lg border border-border bg-background px-2 py-2 text-2xl text-center"
                />
                <input
                  value={cur.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Titre *"
                  className="flex-1 rounded-lg border border-brand/40 bg-background px-3 py-2 text-xl font-bold outline-none"
                />
              </div>
              <textarea
                value={cur.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none"
              />
              <textarea
                value={cur.intro}
                onChange={(e) => set("intro", e.target.value)}
                placeholder="Introduction"
                rows={3}
                className="w-full rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm outline-none resize-none"
              />
            </div>
          ) : (
            <div className="mb-8">
              <span className="text-3xl mb-3 block">{cur.icon}</span>
              <h1 className="text-2xl font-bold tracking-tight mb-2">{cur.name}</h1>
              <p className="text-muted-foreground text-sm mb-4">{cur.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> ~{calcReadTime(cur.chapters)} min
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> {cur.chapters.length} chapitres
                </span>
              </div>
              {cur.intro && (
                <div className="p-5 rounded-xl bg-brand/5 border border-brand/10">
                  <p className="text-sm text-foreground/90 leading-relaxed">{cur.intro}</p>
                </div>
              )}
            </div>
          )}

          {/* Chapitres */}
          <div className="space-y-4">
            {cur.chapters.map((ch, i) => (
              <div
                key={i}
                className={`formation-card ${editMode ? "border-brand/30 ring-1 ring-brand/10" : ""}`}
              >
                {editMode ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold shrink-0">
                        {i + 1}
                      </span>
                      <input
                        value={ch.title}
                        onChange={(e) => updChapter(i, "title", e.target.value)}
                        placeholder="Titre du chapitre"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold outline-none"
                      />
                      <button
                        onClick={() => setExpandedChapters((p) => ({ ...p, [i]: !p[i] }))}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        {expandedChapters[i] === false ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          set(
                            "chapters",
                            cur.chapters.filter((_, j) => j !== i),
                          )
                        }
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expandedChapters[i] !== false && (
                      <RichTextEditor
                        key={`${activeFormation}-${i}`}
                        content={ch.content}
                        onChange={(val) => updChapter(i, "content", val)}
                      />
                    )}
                  </div>
                ) : (
                  <div data-chapter-id={ch.id}>
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 transition-colors ${ch.id && progress.has(ch.id) ? "bg-success/15 text-success" : "bg-brand/10 text-brand"}`}
                      >
                        {ch.id && progress.has(ch.id) ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <h2 className="text-base font-semibold">{ch.title}</h2>
                    </div>
                    <ChapterContent content={ch.content} />
                    {ch.id && progress.has(ch.id) && (
                      <div className="pl-9 mt-4 flex items-center gap-1.5 text-xs text-success">
                        <CheckCircle className="w-3.5 h-3.5" /> Chapitre complété
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {editMode && (
              <button
                onClick={() => set("chapters", [...cur.chapters, { title: "", content: "" }])}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-brand/30 text-sm text-brand/70 hover:text-brand hover:border-brand/50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Ajouter un chapitre
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Grille des formations ─────────────────────────────────────────────────
  return (
    <>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-brand/[0.02]">
        <div className="max-w-5xl mx-auto px-8 py-10">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-medium mb-3">
                <GraduationCap className="w-3 h-3" /> Apprentissage
              </div>
              <h1 className="text-3xl font-semibold tracking-tight mb-2">Formations</h1>
              <p className="text-sm text-muted-foreground">
                Montez en compétence sur l'IA, les API, le RGPD et les bonnes pratiques.
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditMode((m) => !m)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mt-1 ${editMode ? "bg-brand/10 text-brand" : "border border-border text-muted-foreground hover:bg-muted"}`}
              >
                <Pencil className="w-3.5 h-3.5" />{" "}
                {editMode ? "Mode édition actif" : "Mode édition"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {formations.map((f, i) => {
              const completed = f.chapters.filter((c) => c.id && progress.has(c.id)).length;
              const total = f.chapters.length;
              const isNew = completed === 0;
              const isDone = completed === total && total > 0;
              const readTime = calcReadTime(f.chapters);
              return (
                <motion.button
                  key={f.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  onClick={() => setActiveFormation(f.id)}
                  className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand/15 to-violet-500/10 ring-1 ring-brand/20 flex items-center justify-center text-2xl">
                      {f.icon}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isNew && (
                        <span className="inline-flex items-center gap-0.5 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                          <Sparkles className="w-2.5 h-2.5" /> Nouveau
                        </span>
                      )}
                      {isDone && (
                        <span className="inline-flex items-center gap-0.5 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-success/10 text-success">
                          <CheckCircle className="w-2.5 h-2.5" /> Terminé
                        </span>
                      )}
                      <span className="text-[0.65rem] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> ~{readTime} min
                      </span>
                    </div>
                  </div>
                  <h3 className="text-base font-semibold mb-1">{f.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{f.description}</p>
                  {!isNew && !isDone && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground mb-1">
                        <span>
                          {completed}/{total} chapitres
                        </span>
                        <span>{Math.round((completed / total) * 100)}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-brand rounded-full transition-all"
                          style={{ width: `${(completed / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> {total} chapitres
                    </span>
                    <span className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isDone ? "Revoir" : isNew ? "Commencer" : "Continuer"}{" "}
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </motion.button>
              );
            })}

            {/* Card Créer */}
            {isAdmin && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: formations.length * 0.04 }}
                onClick={() => setShowCreate(true)}
                className="text-left bg-card border border-dashed border-brand/30 rounded-2xl p-5 hover:border-brand hover:bg-brand/5 transition-all flex flex-col items-center justify-center gap-3 min-h-[180px]"
              >
                <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-brand" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-brand">Créer une formation</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ajouter un nouveau module</p>
                </div>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Créer */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-elevated w-full max-w-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-base font-semibold">Nouvelle formation</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <input
                  value={newForm.icon}
                  onChange={(e) => setNewForm((p) => ({ ...p, icon: e.target.value }))}
                  className="w-14 rounded-lg border border-border bg-background px-2 py-2 text-2xl text-center"
                />
                <input
                  value={newForm.name}
                  onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Titre *"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/40"
                />
              </div>
              <textarea
                value={newForm.description}
                onChange={(e) => setNewForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description courte"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:border-brand/40"
              />
              <textarea
                value={newForm.intro}
                onChange={(e) => setNewForm((p) => ({ ...p, intro: e.target.value }))}
                placeholder="Introduction (optionnel)"
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:border-brand/40"
              />

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Chapitres</p>
                {newForm.chapters.map((ch, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-brand/10 text-brand text-[0.65rem] font-bold flex items-center justify-center shrink-0 mt-2">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <input
                        value={ch.title}
                        onChange={(e) => {
                          const c = [...newForm.chapters];
                          c[i] = { ...c[i], title: e.target.value };
                          setNewForm((p) => ({ ...p, chapters: c }));
                        }}
                        placeholder="Titre *"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-brand/40"
                      />
                      <RichTextEditor
                        key={`new-${i}`}
                        content={ch.content}
                        onChange={(val) => {
                          const c = [...newForm.chapters];
                          c[i] = { ...c[i], content: val };
                          setNewForm((p) => ({ ...p, chapters: c }));
                        }}
                      />
                    </div>
                    <button
                      onClick={() =>
                        setNewForm((p) => ({
                          ...p,
                          chapters: p.chapters.filter((_, j) => j !== i),
                        }))
                      }
                      className="mt-2 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setNewForm((p) => ({
                      ...p,
                      chapters: [...p.chapters, { title: "", content: "" }],
                    }))
                  }
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter un chapitre
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void createFormation()}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Save className="w-3.5 h-3.5" /> Créer
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
