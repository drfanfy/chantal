import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  MessageSquare,
  Zap,
  BookOpen,
  Users,
  GraduationCap,
  BarChart3,
  ChevronDown,
  Search,
  Shield,
  Ticket,
} from "lucide-react";
import { useApp, type ViewMode } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { hasPermission, type Permission } from "@/lib/permissions";
import { usePublishedPrompts, type PublishedPrompt } from "@/lib/prompts";
import { usePromptPrefill } from "@/lib/usePromptPrefill";
import { PromptUseDialog } from "@/components/prompts/PromptUseDialog";

interface NavEntry {
  id: ViewMode | "chat-link" | "admin-link" | "tickets-link";
  label: string;
  icon: React.ReactNode;
  to?: "/chat" | "/admin" | "/tickets";
  anyOf?: Permission[];
}

const entries: NavEntry[] = [
  { id: "chat-link", label: "Chat", icon: <MessageSquare className="w-3.5 h-3.5" />, to: "/chat" },
  { id: "workflow", label: "Workflows", icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "prompts", label: "Prompts", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "partners", label: "Partenaires", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "formation", label: "Formations", icon: <GraduationCap className="w-3.5 h-3.5" /> },
  {
    id: "admin",
    label: "Reporting",
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    anyOf: ["reporting.view"],
  },
  {
    id: "tickets-link",
    label: "Tickets",
    icon: <Ticket className="w-3.5 h-3.5" />,
    to: "/tickets",
    anyOf: ["ticket.manage"],
  },
  {
    id: "admin-link",
    label: "Admin",
    icon: <Shield className="w-3.5 h-3.5" />,
    to: "/admin",
    anyOf: ["user.manage", "model.manage", "prompt.manage", "workflow.manage", "agent.manage"],
  },
];

export function TopNav() {
  const { profile } = useAuth();
  const role = profile?.role;
  const { viewMode, setViewMode, setActiveWorkflow, setActiveFormation, setActiveConversation } =
    useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = usePromptPrefill();
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [selected, setSelected] = useState<PublishedPrompt | null>(null);
  const promptsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (promptsRef.current && !promptsRef.current.contains(e.target as Node))
        setPromptsOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setPromptsOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  const onChatRoute = location.pathname.startsWith("/chat");
  const onAppRoute = location.pathname === "/app";

  const handle = (e: NavEntry) => {
    if (e.to) {
      if (e.to === "/chat") setActiveConversation(null);
      navigate({ to: e.to });
      return;
    }
    if (e.id === "workflow") setActiveWorkflow(null);
    if (e.id === "formation") setActiveFormation(null);
    setViewMode(e.id as ViewMode);
    if (!onAppRoute) navigate({ to: "/app" });
  };

  const isActive = (e: NavEntry) => {
    if (e.id === "chat-link") return onChatRoute;
    if (e.to) return location.pathname.startsWith(e.to);
    return onAppRoute && viewMode === e.id;
  };

  return (
    <nav
      aria-label="Navigation principale"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar"
    >
      {entries
        .filter((e) => !e.anyOf || e.anyOf.some((p) => hasPermission(role, p)))
        .map((e) => {
          const active = isActive(e);
          const cls = `flex items-center gap-1.5 px-2.5 lg:px-3.5 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all whitespace-nowrap ${active ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;
          if (e.id === "prompts") {
            return (
              <div key={e.id} ref={promptsRef} className="relative">
                <button
                  type="button"
                  aria-expanded={promptsOpen}
                  aria-haspopup="dialog"
                  onClick={() => setPromptsOpen((o) => !o)}
                  className={`${cls} ${promptsOpen ? "bg-brand/10 text-brand" : ""}`}
                >
                  {e.icon}
                  <span className="hidden sm:inline">{e.label}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${promptsOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {promptsOpen && (
                  <PromptsDropdown
                    onPick={(p) => {
                      setPromptsOpen(false);
                      setSelected(p);
                    }}
                    onExplore={() => {
                      setPromptsOpen(false);
                      handle(e);
                    }}
                  />
                )}
              </div>
            );
          }
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => handle(e)}
              className={cls}
              aria-current={active ? "page" : undefined}
            >
              {e.icon}
              <span className="hidden sm:inline">{e.label}</span>
            </button>
          );
        })}
      <PromptUseDialog
        prompt={selected}
        onClose={() => setSelected(null)}
        onUse={(text) => {
          setSelected(null);
          prefill(text);
        }}
      />
    </nav>
  );
}

function PromptsDropdown({
  onPick,
  onExplore,
}: {
  onPick: (p: PublishedPrompt) => void;
  onExplore: () => void;
}) {
  const { prompts, loading } = usePublishedPrompts();
  const categories = useMemo(
    () =>
      [...new Set(prompts.map((p) => p.category ?? "Sans catégorie"))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [prompts],
  );
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const cat = activeCat ?? categories[0] ?? null;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prompts.filter((p) =>
      q
        ? [p.title, p.description].some((s) => s.toLowerCase().includes(q))
        : (p.category ?? "Sans catégorie") === cat,
    );
  }, [prompts, cat, search]);

  return (
    <div className="fixed sm:absolute left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-14 sm:top-full sm:mt-2 sm:w-[640px] bg-card border border-border rounded-2xl shadow-elevated overflow-hidden z-[1000]">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          autoFocus
          aria-label="Rechercher un prompt"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un prompt…"
          className="flex-1 bg-transparent outline-none text-sm py-1"
        />
        <button
          type="button"
          onClick={onExplore}
          className="text-[0.7rem] font-medium text-brand hover:underline shrink-0"
        >
          Explorer →
        </button>
      </div>
      <div className="grid grid-cols-[9rem_1fr] sm:grid-cols-[10rem_1fr] max-h-80">
        <div className="border-r border-border py-2 overflow-y-auto bg-muted/20">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCat(c)}
              className={`w-full text-left px-3 py-1.5 text-[0.78rem] transition-colors ${cat === c && !search ? "text-brand font-medium bg-brand/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto py-1">
          {loading ? (
            <div className="text-center text-xs text-muted-foreground py-8">Chargement…</div>
          ) : list.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">Aucun prompt.</div>
          ) : (
            list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
              >
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="text-[0.8rem] font-medium leading-snug line-clamp-1">
                    {p.title}
                  </div>
                  {p.isDemo && (
                    <span className="text-[0.6rem] px-1 rounded bg-amber-500/10 text-amber-700 shrink-0">
                      Exemple
                    </span>
                  )}
                </div>
                <div className="text-[0.7rem] text-muted-foreground line-clamp-1">
                  {p.description}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
