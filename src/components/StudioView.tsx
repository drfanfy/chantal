import { useState } from "react";
import { Brain, Zap, BookOpen, Users, Wand2, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type StudioKind = "agent" | "workflow" | "prompt" | "partner";

const kinds: { id: StudioKind; title: string; desc: string; time: string; icon: React.ReactNode; accent: string }[] = [
  { id: "agent", title: "Créer un Agent", desc: "Définissez un assistant spécialisé pour un cas d'usage métier précis.", time: "2 min", icon: <Brain className="w-5 h-5" />, accent: "violet" },
  { id: "workflow", title: "Créer un Workflow", desc: "Orchestrez plusieurs étapes IA pour automatiser un process complet.", time: "4 min", icon: <Zap className="w-5 h-5" />, accent: "blue" },
  { id: "prompt", title: "Créer un Prompt", desc: "Ajoutez un prompt réutilisable à la bibliothèque de votre équipe.", time: "1 min", icon: <BookOpen className="w-5 h-5" />, accent: "indigo" },
  { id: "partner", title: "Créer un Partenaire", desc: "Composez un partenaire IA en combinant un modèle et un agent.", time: "3 min", icon: <Users className="w-5 h-5" />, accent: "violet" },
];

const accentMap: Record<string, string> = {
  violet: "from-violet-500/15 to-violet-500/5 text-violet-600 ring-violet-500/20",
  blue: "from-blue-500/15 to-blue-500/5 text-blue-600 ring-blue-500/20",
  indigo: "from-indigo-500/15 to-indigo-500/5 text-indigo-600 ring-indigo-500/20",
};

export function StudioView() {
  const [active, setActive] = useState<StudioKind | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => { setActive(null); setSubmitted(false); setName(""); setObjective(""); setDescription(""); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); setSubmitted(true); };

  const current = kinds.find(k => k.id === active);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-violet-500/[0.02]">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-600 text-xs font-medium mb-3">
            <Wand2 className="w-3 h-3" /> Studio IA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Créez vos propres outils IA</h1>
          <p className="text-sm text-muted-foreground">Construisez agents, workflows, prompts et partenaires sur-mesure.</p>
        </div>

        <AnimatePresence mode="wait">
          {!active && (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {kinds.map(k => (
                <button
                  key={k.id}
                  onClick={() => setActive(k.id)}
                  className="text-left bg-card border border-border rounded-2xl p-6 hover:shadow-elevated hover:border-brand/30 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accentMap[k.accent]} ring-1 flex items-center justify-center`}>
                      {k.icon}
                    </div>
                    <span className="text-[0.65rem] flex items-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground">
                      <Clock className="w-3 h-3" /> {k.time}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold mb-1">{k.title}</h3>
                  <p className="text-sm text-muted-foreground">{k.desc}</p>
                </button>
              ))}
            </motion.div>
          )}

          {active && current && !submitted && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-2xl p-8 shadow-soft max-w-2xl"
            >
              <button onClick={reset} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5">
                <ArrowLeft className="w-3.5 h-3.5" /> Retour
              </button>
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accentMap[current.accent]} ring-1 flex items-center justify-center`}>
                  {current.icon}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{current.title}</h2>
                  <p className="text-xs text-muted-foreground">Renseignez les informations principales.</p>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <Field label="Nom">
                  <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex. Analyse marché PACA" className="input-field" />
                </Field>
                <Field label="Objectif">
                  <input value={objective} onChange={e => setObjective(e.target.value)} required placeholder="Ex. Synthétiser un dossier en 5 min" className="input-field" />
                </Field>
                <Field label="Description">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4} placeholder="Décrivez le contexte, les entrées attendues et le résultat souhaité…" className="input-field resize-none" />
                </Field>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={reset} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Créer</button>
                </div>
              </form>
            </motion.div>
          )}

          {active && current && submitted && (
            <motion.div
              key="ok"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="bg-card border border-border rounded-2xl p-10 shadow-soft max-w-xl text-center"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Votre élément a été ajouté à Chantal</h3>
              <p className="text-sm text-muted-foreground mb-6">« {name} » est désormais disponible pour votre équipe.</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">Créer un autre</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border-radius: 0.625rem;
          border: 1px solid var(--color-border);
          background: var(--color-background);
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus { border-color: var(--color-brand); box-shadow: 0 0 0 3px oklch(0.45 0.18 265 / 0.08); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
