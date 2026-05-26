import { useEffect, useState } from "react";
import { useApp } from "@/lib/appContext";
import { partners, workflows, prompts, agents } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { Sparkles, Zap, BookOpen, Heart, Clock, ArrowRight, MessageSquare, Workflow } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

function formatAgo(d: Date) {
  const diff = Math.round((Date.now() - d.getTime()) / 60000);
  if (diff < 60) return `il y a ${diff} min`;
  const h = Math.round(diff / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  return `il y a ${days} j`;
}

function TimeAgo({ date }: { date: Date }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => { setLabel(formatAgo(date)); }, [date]);
  return <>{label ?? ""}</>;
}

export function HomeDashboard({ onPromptSelect }: { onPromptSelect: (text: string) => void }) {
  const { conversations, favorites, isFavorite, toggleFavorite, setCurrentPartner, setCurrentModel, setCurrentAgent, setActiveWorkflow, setActiveConversation, setViewMode } = useApp();
  const navigate = useNavigate();

  const recPartner = partners.find(p => p.id === "eva")!;
  const recWorkflow = workflows.find(w => w.id === "comite-engagement")!;
  const recPrompt = prompts.find(p => p.id === "p1")!;

  const recent = conversations.slice(0, 2);

  const favPartners = favorites.filter(f => f.kind === "partner").map(f => partners.find(p => p.id === f.id)).filter(Boolean);
  const favAgents = favorites.filter(f => f.kind === "agent").map(f => agents.find(a => a.id === f.id)).filter(Boolean);
  const favWorkflows = favorites.filter(f => f.kind === "workflow").map(f => workflows.find(w => w.id === f.id)).filter(Boolean);

  const selectPartner = (id: string) => {
    const p = partners.find(x => x.id === id);
    if (!p) return;
    setCurrentModel(p.model);
    setCurrentAgent(p.agent);
    setCurrentPartner(p.id);
    setActiveConversation(null);
    navigate({ to: "/chat" });
  };

  const openConversation = (id: string) => {
    navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
  };

  const launchWorkflow = (id: string) => {
    setActiveWorkflow(id);
    setViewMode("workflow");
    navigate({ to: "/app" });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-8 py-10 space-y-10">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 text-brand text-xs font-medium mb-3">
          <Sparkles className="w-3 h-3" /> Bienvenue sur Chantal
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Comment puis-je vous aider aujourd'hui ?</h1>
        <p className="text-sm text-muted-foreground">Choisissez un partenaire, un workflow ou commencez par poser votre question.</p>
      </motion.div>

      {/* Recommandé */}
      <Section title="Recommandé pour vous" subtitle="Sélection sur-mesure d'après votre activité">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SmartCard
            tag="populaire"
            icon={<img src={partnerImages[recPartner.id]} alt={recPartner.name} className="w-full h-full object-cover" loading="lazy" />}
            iconRound
            accent="violet"
            kind="Partenaire" title={recPartner.name} desc={recPartner.expertise}
            onClick={() => selectPartner(recPartner.id)}
          />
          <SmartCard
            tag="populaire" icon={<Zap className="w-4 h-4" />} accent="blue"
            kind="Workflow" title={recWorkflow.name} desc="Lancez un dossier complet en quelques clics."
            onClick={() => launchWorkflow(recWorkflow.id)}
          />
          <SmartCard
            tag="nouveau" icon={<BookOpen className="w-4 h-4" />} accent="indigo"
            kind="Prompt" title={recPrompt.text.slice(0, 38) + "…"} desc={recPrompt.description}
            onClick={() => onPromptSelect(recPrompt.text + " " + recPrompt.vars.map(v => `[${v}]`).join(" "))}
          />
        </div>
      </Section>

      {/* Favoris */}
      <Section title="Favoris" subtitle="Vos raccourcis personnels" icon={<Heart className="w-4 h-4 text-rose-500 fill-rose-500" />}>
        {favPartners.length + favAgents.length + favWorkflows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Ajoutez des favoris depuis les pages Partenaires ou via le bouton ❤️.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favPartners.map((p) => p && (
              <FavChip key={p.id} icon="✨" label={p.name} sub="Partenaire"
                onClick={() => selectPartner(p.id)}
                onRemove={() => toggleFavorite({ kind: "partner", id: p.id })}
                isFav={isFavorite({ kind: "partner", id: p.id })}
              />
            ))}
            {favAgents.map((a) => a && (
              <FavChip key={a.id} icon="🧠" label={a.name} sub="Agent"
                onClick={() => { setCurrentAgent(a.name); setActiveConversation(null); navigate({ to: "/chat" }); }}
                onRemove={() => toggleFavorite({ kind: "agent", id: a.id })}
                isFav={isFavorite({ kind: "agent", id: a.id })}
              />
            ))}
            {favWorkflows.map((w) => w && (
              <FavChip key={w.id} icon="⚡" label={w.name} sub="Workflow"
                onClick={() => launchWorkflow(w.id)}
                onRemove={() => toggleFavorite({ kind: "workflow", id: w.id })}
                isFav={isFavorite({ kind: "workflow", id: w.id })}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Activité récente */}
      <Section title="Activité récente" icon={<Clock className="w-4 h-4 text-blue-500" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recent.map((c) => (
            <button
              key={c.id}
              onClick={() => c.type === "workflow" ? launchWorkflow(c.workflowId || "") : openConversation(c.id)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:shadow-soft hover:border-brand/30 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                {c.type === "workflow"
                  ? <Workflow className="w-3.5 h-3.5 text-blue-500" />
                  : <MessageSquare className="w-3.5 h-3.5 text-violet-500" />}
                <span className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground">
                  {c.type === "workflow" ? "Workflow" : "Conversation"}
                </span>
                <span className="text-[0.65rem] text-muted-foreground ml-auto"><TimeAgo date={c.date} /></span>
              </div>
              <h4 className="text-sm font-medium line-clamp-1 mb-1">{c.title}</h4>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{c.user} · {c.agent}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-baseline gap-2 mb-3">
        {icon}
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">— {subtitle}</span>}
      </div>
      {children}
    </motion.section>
  );
}

const accentBg: Record<string, string> = {
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  blue: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  indigo: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
};

function SmartCard({ tag, icon, kind, title, desc, accent, onClick, iconRound }: {
  tag: "populaire" | "nouveau"; icon: React.ReactNode; kind: string; title: string; desc: string; accent: string; onClick: () => void; iconRound?: boolean;
}) {
  return (
    <button onClick={onClick} className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ring-1 flex items-center justify-center overflow-hidden ${accentBg[accent]}`}>
          {iconRound ? icon : <span className="flex items-center justify-center">{icon}</span>}
        </div>
        {tag === "populaire"
          ? <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">🔥 Populaire</span>
          : <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">✨ Nouveau</span>}
      </div>
      <div className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground mb-1">{kind}</div>
      <h3 className="text-sm font-semibold mb-1 line-clamp-1">{title}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{desc}</p>
      <div className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
        Lancer <ArrowRight className="w-3 h-3" />
      </div>
    </button>
  );
}

function FavChip({ icon, label, sub, onClick, onRemove, isFav }: { icon: string; label: string; sub: string; onClick: () => void; onRemove: () => void; isFav: boolean }) {
  return (
    <div className="group flex items-center gap-2 bg-card border border-border rounded-xl pl-3 pr-2 py-2 hover:shadow-soft transition-all">
      <button onClick={onClick} className="flex items-center gap-2 text-left">
        <span className="text-base">{icon}</span>
        <div>
          <div className="text-sm font-medium leading-tight">{label}</div>
          <div className="text-[0.65rem] text-muted-foreground leading-tight">{sub}</div>
        </div>
      </button>
      <button onClick={onRemove} className="p-1 rounded hover:bg-muted ml-1" aria-label="Retirer">
        <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
      </button>
    </div>
  );
}
