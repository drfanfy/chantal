import { getCurrentUser } from "@/lib/auth";
import { useApp } from "@/lib/appContext";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { MessageSquare, Zap, BookOpen, Users, GraduationCap, BarChart3, Wand2, ChevronDown, Search, Shield, Ticket } from "lucide-react";
import type { ViewMode } from "@/lib/appContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { prompts, promptCategories, type PromptCategory } from "@/lib/data";

interface NavEntry {
  id: ViewMode | "studio" | "chat-link" | "admin-link" | "tickets-link";
  label: string;
  icon: React.ReactNode;
  to?: string;
}

const entries: NavEntry[] = [
  { id: "chat-link",    label: "Chat",        icon: <MessageSquare className="w-3.5 h-3.5" />, to: "/chat"    },
  { id: "workflow",     label: "Workflows",   icon: <Zap           className="w-3.5 h-3.5" />               },
  { id: "prompts",      label: "Prompts",     icon: <BookOpen      className="w-3.5 h-3.5" />               },
  { id: "partners",     label: "Partenaires", icon: <Users         className="w-3.5 h-3.5" />               },
  { id: "formation",    label: "Formations",  icon: <GraduationCap className="w-3.5 h-3.5" />               },
  { id: "admin",        label: "Reporting",   icon: <BarChart3     className="w-3.5 h-3.5" />               },
  { id: "studio",       label: "Studio IA",   icon: <Wand2         className="w-3.5 h-3.5" />               },
  { id: "tickets-link", label: "Tickets",     icon: <Ticket        className="w-3.5 h-3.5" />, to: "/tickets"},
  { id: "admin-link",   label: "Admin",       icon: <Shield        className="w-3.5 h-3.5" />, to: "/admin"  },
];

export function TopNav() {
  const { profile } = useAuth();
  const role = profile?.role;
  const { viewMode, setViewMode, setActiveWorkflow, setActiveFormation, setActiveConversation, setCurrentPartner, setPendingPrefill } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [promptsOpen, setPromptsOpen] = useState(false);
  useEffect(() => {
    getCurrentUser();
  }, []);
  const promptsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (promptsRef.current && !promptsRef.current.contains(e.target as Node)) setPromptsOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const onChatRoute = location.pathname.startsWith("/chat");
  const onHomeRoute = location.pathname === "/home" || location.pathname === "/";

  const handle = (e: NavEntry) => {
    if (e.id === "chat-link") {
      setActiveConversation(null);
      setActiveWorkflow(null);
      navigate({ to: "/chat" });
      return;
    }

    if (e.id === "admin-link") {
      setActiveConversation(null);
      setActiveWorkflow(null);
      navigate({ to: "/admin" });
      return;
    }

    if (e.id === "tickets-link") {
      setActiveConversation(null);
      setActiveWorkflow(null);
      navigate({ to: "/tickets" });
      return;
    }
    setActiveConversation(null);
    if (e.id === "workflow") {
      setActiveWorkflow(null);
      setViewMode("workflow");
    } else if (e.id === "formation") {
      setActiveFormation(null);
      setViewMode("formation");
    } else if (e.id === "partners") {
      setCurrentPartner(null);
      setViewMode("partners");
    } else {
      setViewMode(e.id as ViewMode);
    }
    if (location.pathname !== "/app") navigate({ to: "/app" });
  };

  const handlePromptPick = (text: string) => {
    setPromptsOpen(false);
    setPendingPrefill(text);
    // Don't navigate away if already on a chat
    if (!onChatRoute) {
      setActiveConversation(null);
      navigate({ to: "/chat" });
    }
  };

  const isActive = (e: NavEntry) => {
    if (e.id === "chat-link") return onChatRoute;
    if (onHomeRoute || onChatRoute) return false;
    return viewMode === e.id;
  };

  return (
    <nav className="flex items-center justify-center gap-1">
      {entries
.filter((e) => {
  if (
    (e.id === "studio" || e.id === "admin" || e.id === "admin-link" || e.id === "tickets-link") &&
    role !== "admin" && role !== "super_admin"
  ) {
    return false;
  }

  return true;
})
  .map(e => {
        const active = isActive(e);
        if (e.id === "prompts") {
          return (
            <div key={e.id} ref={promptsRef} className="relative">
              <button
                onClick={() => setPromptsOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all ${
                  active || promptsOpen ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {e.icon}
                {e.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${promptsOpen ? "rotate-180" : ""}`} />
              </button>
              {promptsOpen && (
                <PromptsDropdown
                  onPick={handlePromptPick}
                  onExplore={() => { setPromptsOpen(false); handle(e); }}
                />
              )}
            </div>
          );
        }
        return (
          <button
            key={e.id}
            onClick={() => handle(e)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all ${
              active
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {e.icon}
            {e.label}
          </button>
        );
      })}
    </nav>
  );
}

function PromptsDropdown({ onPick, onExplore }: { onPick: (text: string) => void; onExplore: () => void }) {
  const [activeCat, setActiveCat] = useState<PromptCategory>(promptCategories[0]);
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prompts.filter(p => {
      if (!q && p.category !== activeCat) return false;
      if (q && !p.text.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeCat, search]);

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[640px] max-w-[90vw] bg-card border border-border rounded-2xl shadow-elevated overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un prompt…"
          className="flex-1 bg-transparent outline-none text-sm py-1"
        />
        <button onClick={onExplore} className="text-[0.7rem] font-medium text-brand hover:underline shrink-0">Explorer →</button>
      </div>
      <div className="grid grid-cols-[10rem_1fr] max-h-80">
        <div className="border-r border-border py-2 overflow-y-auto bg-muted/20">
          {promptCategories.map(c => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`w-full text-left px-3 py-1.5 text-[0.78rem] transition-colors ${
                activeCat === c && !search ? "text-brand font-medium bg-brand/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto py-1">
          {list.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">Aucun prompt.</div>
          ) : list.map(p => (
            <button
              key={p.id}
              onClick={() => onPick(p.text + " " + p.vars.map(v => `[${v}]`).join(" "))}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
            >
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <div className="text-[0.8rem] font-medium leading-snug line-clamp-1">{p.text}</div>
                {p.tag === "populaire" && <span className="text-[0.6rem] px-1 rounded bg-rose-500/10 text-rose-600 shrink-0">🔥</span>}
                {p.tag === "nouveau" && <span className="text-[0.6rem] px-1 rounded bg-emerald-500/10 text-emerald-600 shrink-0">✨</span>}
              </div>
              <div className="text-[0.7rem] text-muted-foreground line-clamp-1">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
