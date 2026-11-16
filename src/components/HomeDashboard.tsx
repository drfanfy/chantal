/**
 * Accueil : recommandations, favoris (base de données, multi-appareils) et
 * activité récente réelle (conversations, workflows, prompts) de l'utilisateur.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles,
  Zap,
  GraduationCap,
  Heart,
  Clock,
  ArrowRight,
  MessageSquare,
  Loader2,
  BookOpen,
  Globe2,
  AlertTriangle,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { useFavorites, type Favorite } from "@/lib/favorites";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/api";
import { RUN_STATUS_LABEL, type RunRow } from "@/lib/workflowsClient";

function formatAgo(d: Date) {
  const diff = Math.round((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  const h = Math.round(diff / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

interface Activity {
  kind: "conversation" | "workflow_run" | "prompt";
  ref_id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  occurred_at: string;
}

interface Recommendation {
  kind: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const PAGE = 8;

export function HomeDashboard() {
  const app = useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fav = useFavorites();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  const openWorkflow = useCallback(
    (id: string) => {
      app.setActiveWorkflow(id);
      navigate({ to: "/app" });
    },
    [app, navigate],
  );
  const openFormation = useCallback(
    (id: string | null) => {
      app.setActiveFormation(id);
      app.setViewMode("formation");
      navigate({ to: "/app" });
    },
    [app, navigate],
  );

  const loadActivity = useCallback(async (before?: string) => {
    setActivityLoading(true);
    const { data, error } = await supabase.rpc("get_recent_activity", {
      p_limit: PAGE + 1,
      p_before: before ?? null,
    });
    if (error) toast.error("Activité récente indisponible");
    const rows = (data ?? []) as Activity[];
    setHasMore(rows.length > PAGE);
    setActivity((prev) => (before ? [...prev, ...rows.slice(0, PAGE)] : rows.slice(0, PAGE)));
    setActivityLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    void loadActivity();
    void (async () => {
      const out: Recommendation[] = [];
      const [{ data: partners }, { data: wfs }, { data: formations }, { data: progress }] =
        await Promise.all([
          supabase
            .from("partners")
            .select("id, name, description, personality, avatar_url, ai_model_id, agent_id")
            .eq("is_active", true)
            .is("archived_at", null)
            .limit(20),
          supabase
            .from("workflow_definitions")
            .select("id, name, description")
            .eq("status", "published")
            .limit(20),
          supabase
            .from("formations")
            .select("id, name, icon, description, formation_chapters(id)")
            .order("sort_order")
            .limit(20),
          supabase.from("formation_progress").select("chapter_id"),
        ]);
      // Partenaire : le plus utilisé dans MES conversations, sinon le premier disponible
      const counts = new Map<string, number>();
      app.myConversations.forEach(
        (c) => c.partnerId && counts.set(c.partnerId, (counts.get(c.partnerId) ?? 0) + 1),
      );
      const plist = (partners ?? []) as {
        id: string;
        name: string;
        description: string | null;
        personality: string | null;
        avatar_url: string | null;
        ai_model_id: string | null;
        agent_id: string | null;
      }[];
      const topPartner = [...plist].sort(
        (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
      )[0];
      if (topPartner) {
        out.push({
          kind: "Partenaire",
          title: topPartner.name,
          desc: topPartner.personality ?? topPartner.description ?? "Partenaire IA",
          icon: topPartner.avatar_url ? (
            <img src={topPartner.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Users className="w-4 h-4" />
          ),
          onClick: () => {
            app.selectPartner(topPartner);
            navigate({ to: "/chat" });
          },
        });
      }
      const wf = (wfs ?? [])[0] as { id: string; name: string; description: string } | undefined;
      if (wf)
        out.push({
          kind: "Workflow",
          title: wf.name,
          desc: wf.description || "Lancez un livrable en quelques clics.",
          icon: <Zap className="w-4 h-4" />,
          onClick: () => openWorkflow(wf.id),
        });
      const done = new Set((progress ?? []).map((r: { chapter_id: string }) => r.chapter_id));
      type F = {
        id: string;
        name: string;
        icon: string;
        description: string;
        formation_chapters: { id: string }[];
      };
      const unread = ((formations ?? []) as F[]).find(
        (f) => f.formation_chapters.length > 0 && f.formation_chapters.some((c) => !done.has(c.id)),
      );
      out.push(
        unread
          ? {
              kind: "Formation",
              title: unread.name,
              desc: unread.description,
              icon: <span className="text-xl leading-none">{unread.icon}</span>,
              onClick: () => openFormation(unread.id),
            }
          : {
              kind: "Formation",
              title: "Toutes vos formations sont à jour",
              desc: "Revenez bientôt pour de nouveaux modules.",
              icon: <GraduationCap className="w-4 h-4" />,
              onClick: () => openFormation(null),
            },
      );
      setRecs(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function openFavorite(f: Favorite) {
    if (!f.available) return;
    if (f.resource_type === "workflow") openWorkflow(f.resource_id);
    else if (f.resource_type === "conversation")
      navigate({ to: "/chat/$conversationId", params: { conversationId: f.resource_id } });
    else if (f.resource_type === "agent") {
      app.setCurrentAgentId(f.resource_id);
      navigate({ to: "/chat" });
    } else if (f.resource_type === "prompt") {
      app.setViewMode("prompts");
      navigate({ to: "/app" });
    } else if (f.resource_type === "partner") {
      void supabase
        .from("partners")
        .select("id, ai_model_id, agent_id")
        .eq("id", f.resource_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data)
            app.selectPartner(
              data as { id: string; ai_model_id: string | null; agent_id: string | null },
            );
          navigate({ to: "/chat" });
        });
    }
  }

  function openActivity(a: Activity) {
    if (a.kind === "conversation")
      navigate({ to: "/chat/$conversationId", params: { conversationId: a.ref_id } });
    else if (a.kind === "prompt") {
      app.setViewMode("prompts");
      navigate({ to: "/app" });
    } else
      void supabase
        .from("workflow_runs")
        .select("workflow_id")
        .eq("id", a.ref_id)
        .maybeSingle<Pick<RunRow, "workflow_id">>()
        .then(({ data }) => data && openWorkflow(data.workflow_id));
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-2"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 text-brand text-xs font-medium mb-3">
          <Sparkles className="w-3 h-3" /> Bienvenue sur Chantal
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Bonjour{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Choisissez un partenaire, un workflow ou commencez par poser votre question.
        </p>
      </motion.div>

      {fav.legacyCount > 0 && (
        <div
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm flex flex-wrap items-center gap-3"
          role="region"
          aria-label="Reprise des favoris"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="flex-1 min-w-[16rem]">
            {fav.legacyCount} favori(s) enregistré(s) sur ce navigateur avant la mise à jour. Les
            rattacher à <strong>votre</strong> compte ?
          </span>
          <button
            type="button"
            onClick={() =>
              void fav
                .importLegacy()
                .then((n) => toast.success(`${n} favori(s) importé(s)`))
                .catch((e) => toast.error(errorMessage(e)))
            }
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Importer
          </button>
          <button
            type="button"
            onClick={fav.dismissLegacy}
            className="rounded-md border border-border px-3 py-1.5 text-xs"
          >
            Ignorer
          </button>
        </div>
      )}

      <Section title="Recommandé pour vous" subtitle="D'après votre activité">
        {recs.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recs.map((r) => (
              <button
                key={r.kind}
                type="button"
                onClick={r.onClick}
                className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl ring-1 ring-brand/20 bg-brand/10 text-brand flex items-center justify-center overflow-hidden mb-4">
                  {r.icon}
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                  {r.kind}
                </div>
                <h3 className="text-sm font-semibold mb-1 line-clamp-1">{r.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{r.desc}</p>
                <div className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                  Ouvrir <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Favoris"
        subtitle="Synchronisés sur tous vos appareils"
        icon={<Heart className="w-4 h-4 text-rose-500 fill-rose-500" />}
      >
        {fav.loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : fav.favorites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Aucun favori. Ajoutez-en avec le bouton ❤️ depuis les Partenaires, Workflows ou Prompts.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fav.favorites.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5 min-w-[210px] max-w-[280px] ${f.available ? "hover:shadow-soft" : "opacity-60"}`}
              >
                <button
                  type="button"
                  disabled={!f.available}
                  onClick={() => openFavorite(f)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0 disabled:cursor-not-allowed"
                >
                  {f.avatar_url ? (
                    <img
                      src={f.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-border"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-base shrink-0">
                      {f.icon ??
                        (
                          {
                            partner: "✨",
                            agent: "🧠",
                            workflow: "⚡",
                            prompt: "📝",
                            conversation: "💬",
                          } as const
                        )[f.resource_type]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight truncate">
                      {f.available ? (f.title ?? "…") : "Ressource indisponible"}
                    </div>
                    <div className="text-[0.68rem] text-foreground/70 truncate mt-0.5">
                      {f.available ? (f.subtitle ?? "") : "Supprimée, archivée ou non autorisée"}
                    </div>
                    {f.extra && f.available && (
                      <div className="text-[0.63rem] text-muted-foreground italic truncate">
                        {f.extra}
                      </div>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void fav.toggle(f.resource_type, f.resource_id)}
                  className="p-1 rounded hover:bg-muted shrink-0"
                  aria-label="Retirer des favoris"
                >
                  <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Activité récente"
        subtitle="Vos conversations, workflows et prompts"
        icon={<Clock className="w-4 h-4 text-blue-500" />}
      >
        {activityLoading && activity.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : activity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            Aucune activité pour l'instant. Lancez une conversation ou un workflow !
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activity.map((a) => (
                <button
                  key={`${a.kind}-${a.ref_id}-${a.occurred_at}`}
                  type="button"
                  onClick={() => openActivity(a)}
                  className="text-left bg-card border border-border rounded-xl p-4 hover:shadow-soft hover:border-brand/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {a.kind === "conversation" ? (
                      <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
                    ) : a.kind === "prompt" ? (
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-blue-500" />
                    )}
                    <span className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground">
                      {a.kind === "conversation"
                        ? "Conversation"
                        : a.kind === "prompt"
                          ? "Prompt utilisé"
                          : "Workflow"}
                    </span>
                    {a.kind === "conversation" && a.status === "shared" && (
                      <Globe2 className="w-3 h-3 text-brand" aria-label="Partagée" />
                    )}
                    <span className="text-[0.65rem] text-muted-foreground ml-auto">
                      {formatAgo(new Date(a.occurred_at))}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium line-clamp-1 mb-1">{a.title}</h4>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {a.kind === "workflow_run"
                      ? `${RUN_STATUS_LABEL[a.status as RunRow["status"]] ?? a.status} · ${a.subtitle ?? ""}`
                      : (a.subtitle ?? "")}
                  </div>
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  disabled={activityLoading}
                  onClick={() => void loadActivity(activity[activity.length - 1]?.occurred_at)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                >
                  {activityLoading ? "Chargement…" : "Voir plus"}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-2 mb-3">
        {icon}
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">— {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
