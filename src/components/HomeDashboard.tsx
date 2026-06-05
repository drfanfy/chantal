import { useEffect, useState } from "react";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { partners, workflows, agents } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { Sparkles, Zap, GraduationCap, Heart, Clock, ArrowRight, MessageSquare, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAgo(d: Date) {
  const diff = Math.round((Date.now() - d.getTime()) / 60000);
  if (diff < 1)  return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  const h = Math.round(diff / 60);
  if (h < 24)   return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function TimeAgo({ date }: { date: Date }) {
  const [label, setLabel] = useState<string>("");
  useEffect(() => { setLabel(formatAgo(date)); }, [date]);
  return <>{label}</>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentConv    { id: string; title: string; date: Date }
interface RecFormation  { id: string; name: string; icon: string; description: string }
interface DbPartner     { id: string; name: string; description: string | null; avatar_url: string | null; personality: string | null }

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeDashboard({ onPromptSelect: _onPromptSelect }: { onPromptSelect: (text: string) => void }) {
  const {
    favorites, isFavorite, toggleFavorite,
    setCurrentPartner, setCurrentModel, setCurrentAgent,
    setActiveWorkflow, setActiveConversation, setViewMode, setActiveFormation,
  } = useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [recentConvs,    setRecentConvs]    = useState<RecentConv[]>([]);
  const [recFormation,   setRecFormation]   = useState<RecFormation | null>(null);
  const [recDbPartner,   setRecDbPartner]   = useState<DbPartner | null>(null);
  const [favPartnersDb,  setFavPartnersDb]  = useState<DbPartner[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const recWorkflow = workflows.find(w => w.tag === "populaire") ?? workflows[0];

  // Charger les partenaires DB correspondant aux favoris
  useEffect(() => {
    const ids = favorites.filter(f => f.kind === "partner").map(f => f.id);
    if (ids.length === 0) { setFavPartnersDb([]); return; }
    supabase.from("partners")
      .select("id, name, description, avatar_url, personality")
      .in("id", ids)
      .then(({ data }) => setFavPartnersDb((data ?? []) as DbPartner[]));
  }, [favorites]);

  useEffect(() => {
    if (!profile?.id) return;
    void (async () => {
      // ── Activité récente (7 derniers jours) ───────────────────────────────
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: convData } = await supabase
        .from("conversations")
        .select("id, title, updated_at, created_at")
        .eq("user_id", profile.id)
        .eq("is_hidden", false)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(5);

      setRecentConvs((convData ?? []).map(c => ({
        id:    c.id    as string,
        title: (c.title as string | null) ?? "Conversation",
        date:  new Date((c.updated_at ?? c.created_at) as string),
      })));
      setLoadingActivity(false);

      // ── Partenaire recommandé (le plus utilisé dans les conversations) ────
      const { data: convPartners } = await supabase
        .from("conversations").select("partner_id").not("partner_id", "is", null).limit(200);
      const counts: Record<string, number> = {};
      (convPartners ?? []).forEach(c => { if (c.partner_id) counts[c.partner_id] = (counts[c.partner_id] ?? 0) + 1; });
      const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      // Requête unique : partner le + utilisé si connu, sinon premier dispo
      const partnerQuery = topId
        ? supabase.from("partners").select("id, name, description, avatar_url, personality").eq("id", topId).maybeSingle()
        : supabase.from("partners").select("id, name, description, avatar_url, personality").limit(1).maybeSingle();
      const { data: chosenPartner } = await partnerQuery;
      if (chosenPartner) setRecDbPartner(chosenPartner as DbPartner);

      // ── Formation recommandée (première non lue) ──────────────────────────
      const [{ data: progressData }, { data: formationsData }] = await Promise.all([
        supabase.from("formation_progress").select("chapter_id"),
        supabase.from("formations")
          .select("id, name, icon, description, formation_chapters(id)")
          .order("sort_order").limit(20),
      ]);

      const doneIds = new Set((progressData ?? []).map(r => r.chapter_id as string));
      type FRow = { id: string; name: string; icon: string; description: string; formation_chapters: { id: string }[] };
      const unread = (formationsData as FRow[] ?? []).find(f =>
        f.formation_chapters.length > 0 && !f.formation_chapters.some(c => doneIds.has(c.id))
      );
      if (unread) setRecFormation({ id: unread.id, name: unread.name, icon: unread.icon, description: unread.description });
    })();
  }, [profile?.id]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const selectPartner = (id: string) => {
    // Partenaires DB (UUID) : ChatInterface charge les infos via useAIConfig
    // Partenaires statiques (data.ts) : on peut aussi passer le modèle/agent
    const staticP = partners.find(x => x.id === id);
    if (staticP) { setCurrentModel(staticP.model); setCurrentAgent(staticP.agent); }
    setCurrentPartner(id);
    setActiveConversation(null);
    navigate({ to: "/chat" });
  };

  const openConversation = (id: string) =>
    navigate({ to: "/chat/$conversationId", params: { conversationId: id } });

  const launchWorkflow = (id: string) => {
    setActiveWorkflow(id); setViewMode("workflow"); navigate({ to: "/app" });
  };

  const openFormation = (id: string) => {
    setActiveFormation(id); navigate({ to: "/app" });
  };

  // ── Favoris ─────────────────────────────────────────────────────────────────
  // Partenaires : depuis DB (UUIDs) — chargés dans favPartnersDb
  const favAgents    = favorites.filter(f => f.kind === "agent").map(f => agents.find(a => a.id === f.id)).filter(Boolean);
  const favWorkflows = favorites.filter(f => f.kind === "workflow").map(f => workflows.find(w => w.id === f.id)).filter(Boolean);
  const hasFavs = favPartnersDb.length + favAgents.length + favWorkflows.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-8 py-10 space-y-10">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 text-brand text-xs font-medium mb-3">
          <Sparkles className="w-3 h-3" /> Bienvenue sur Chantal
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Bonjour{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">Choisissez un partenaire, un workflow ou commencez par poser votre question.</p>
      </motion.div>

      {/* ── Recommandé ────────────────────────────────────────────────────── */}
      <Section title="Recommandé pour vous" subtitle="Sélection sur-mesure d'après votre activité">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Partenaire le + utilisé (DB) */}
          {recDbPartner && (
            <SmartCard
              tag="populaire"
              icon={recDbPartner.avatar_url
                ? <img src={recDbPartner.avatar_url} alt={recDbPartner.name} className="w-full h-full object-cover" loading="lazy" />
                : <span className="text-xl">✨</span>}
              iconRound accent="violet"
              kind="Partenaire" title={recDbPartner.name}
              desc={recDbPartner.personality ?? recDbPartner.description ?? "Partenaire IA"}
              onClick={() => selectPartner(recDbPartner.id)}
            />
          )}

          {/* Workflow le + populaire */}
          <SmartCard
            tag="populaire" icon={<Zap className="w-4 h-4" />} accent="blue"
            kind="Workflow" title={recWorkflow.name}
            desc={recWorkflow.description ?? "Lancez un dossier complet en quelques clics."}
            onClick={() => launchWorkflow(recWorkflow.id)}
          />

          {/* Formation non lue */}
          {recFormation ? (
            <SmartCard
              tag="nouveau"
              icon={<span className="text-2xl leading-none">{recFormation.icon}</span>}
              iconRound accent="indigo"
              kind="Formation" title={recFormation.name} desc={recFormation.description}
              onClick={() => openFormation(recFormation.id)}
            />
          ) : (
            <SmartCard
              tag="nouveau" icon={<GraduationCap className="w-4 h-4" />} accent="indigo"
              kind="Formation" title="Toutes les formations terminées 🎉"
              desc="Revenez bientôt pour de nouveaux modules."
              onClick={() => { setActiveFormation(null); navigate({ to: "/app" }); }}
            />
          )}
        </div>
      </Section>

      {/* ── Favoris ───────────────────────────────────────────────────────── */}
      <Section title="Favoris" subtitle="Vos raccourcis personnels" icon={<Heart className="w-4 h-4 text-rose-500 fill-rose-500" />}>
        {!hasFavs ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Ajoutez des favoris depuis les pages Partenaires, Workflows ou Agents via le bouton ❤️.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favPartnersDb.map(p => (
              <FavChip key={p.id}
                avatarUrl={p.avatar_url}
                icon="✨"
                label={p.name}
                sub={p.description ?? "Partenaire"}
                mood={p.personality}
                onClick={() => selectPartner(p.id)}
                onRemove={() => toggleFavorite({ kind: "partner", id: p.id })}
                isFav={isFavorite({ kind: "partner", id: p.id })}
              />
            ))}
            {favAgents.map(a => a && (
              <FavChip key={a.id} icon="🧠" label={a.name} sub="Agent"
                onClick={() => { setCurrentAgent(a.name); setActiveConversation(null); navigate({ to: "/chat" }); }}
                onRemove={() => toggleFavorite({ kind: "agent", id: a.id })}
                isFav={isFavorite({ kind: "agent", id: a.id })}
              />
            ))}
            {favWorkflows.map(w => w && (
              <FavChip key={w.id} icon="⚡" label={w.name} sub="Workflow"
                onClick={() => launchWorkflow(w.id)}
                onRemove={() => toggleFavorite({ kind: "workflow", id: w.id })}
                isFav={isFavorite({ kind: "workflow", id: w.id })}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ── Activité récente ──────────────────────────────────────────────── */}
      <Section title="Activité récente" subtitle="7 derniers jours" icon={<Clock className="w-4 h-4 text-blue-500" />}>
        {loadingActivity ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : recentConvs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Aucune conversation ces 7 derniers jours.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentConvs.map(c => (
              <button key={c.id} onClick={() => openConversation(c.id)}
                className="text-left bg-card border border-border rounded-xl p-4 hover:shadow-soft hover:border-brand/30 transition-all group">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground">Conversation</span>
                  <span className="text-[0.65rem] text-muted-foreground ml-auto"><TimeAgo date={c.date} /></span>
                </div>
                <h4 className="text-sm font-medium line-clamp-1 mb-1">{c.title}</h4>
                <div className="flex items-center justify-end text-xs text-muted-foreground">
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  blue:   "bg-blue-500/10   text-blue-600   ring-blue-500/20",
  indigo: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
};

function SmartCard({ tag, icon, kind, title, desc, accent, onClick, iconRound }: {
  tag: "populaire" | "nouveau"; icon: React.ReactNode; kind: string;
  title: string; desc: string; accent: string; onClick: () => void; iconRound?: boolean;
}) {
  return (
    <button onClick={onClick} className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ring-1 flex items-center justify-center overflow-hidden ${accentBg[accent]}`}>
          {icon}
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

function FavChip({ avatarUrl, icon, label, sub, mood, onClick, onRemove, isFav }: {
  avatarUrl?: string | null; icon: string; label: string; sub: string; mood?: string | null;
  onClick: () => void; onRemove: () => void; isFav: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5 hover:shadow-soft hover:border-brand/20 transition-all min-w-[210px] max-w-[270px]">
      <button onClick={onClick} className="flex items-center gap-2.5 text-left flex-1 min-w-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={label} className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-border" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-base shrink-0">{icon}</div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">{label}</div>
          {sub  && <div className="text-[0.68rem] text-foreground/70 leading-snug truncate mt-0.5">{sub}</div>}
          {mood && <div className="text-[0.63rem] text-muted-foreground italic leading-snug truncate">{mood}</div>}
        </div>
      </button>
      <button onClick={onRemove} className="p-1 rounded hover:bg-muted shrink-0" aria-label="Retirer">
        <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
      </button>
    </div>
  );
}
