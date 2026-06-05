import { useEffect, useRef, useState } from "react";
import { useApp, type Conversation } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, PanelLeftClose, PanelLeft, Plus, Workflow, EyeOff, Eye, Trash2 } from "lucide-react";

function groupByDate(convs: Conversation[]) {
  const now  = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week      = today - 7 * 86400000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Aujourd'hui",      items: [] },
    { label: "Hier",             items: [] },
    { label: "7 derniers jours", items: [] },
    { label: "Plus ancien",      items: [] },
  ];

  convs.forEach(c => {
    const t = c.date.getTime();
    if      (t >= today)     groups[0].items.push(c);
    else if (t >= yesterday) groups[1].items.push(c);
    else if (t >= week)      groups[2].items.push(c);
    else                     groups[3].items.push(c);
  });

  return groups.filter(g => g.items.length > 0);
}

// ─── Menu contextuel ──────────────────────────────────────────────────────────

interface ContextMenu { x: number; y: number; id: string }

function ConvContextMenu({
  menu, conv, onHide, onDelete, onClose,
}: {
  menu: ContextMenu;
  conv: Conversation | undefined;
  onHide: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Ajuster pour ne pas sortir de l'écran
  const left = Math.min(menu.x, window.innerWidth - 200);
  const top  = Math.min(menu.y, window.innerHeight - 120);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left, top }}
      className="z-[100] min-w-[196px] rounded-xl border border-border bg-popover shadow-elevated py-1 text-sm"
      onContextMenu={e => e.preventDefault()}
    >
      <button
        onClick={onHide}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        {conv?.is_hidden
          ? <><Eye     className="w-3.5 h-3.5 shrink-0" /> Réafficher</>
          : <><EyeOff  className="w-3.5 h-3.5 shrink-0" /> Masquer (non-admins)</>
        }
      </button>
      <div className="h-px bg-border mx-2 my-1" />
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-destructive/10 text-destructive transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5 shrink-0" /> Supprimer définitivement
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function ConversationSidebar() {
  const { conversations, activeConversationId, sidebarOpen, toggleSidebar, setActiveConversation, deleteConversation, hideConversation } = useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const isSuperAdmin = profile?.role === "super_admin";
  const firstName    = (profile?.full_name ?? profile?.email ?? "Moi").split(/\s+/)[0];
  const groups       = groupByDate(conversations);

  const [menu, setMenu] = useState<ContextMenu | null>(null);

  const openMenu = (e: React.MouseEvent, id: string) => {
    if (!isSuperAdmin) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, id });
  };

  const closeMenu = () => setMenu(null);

  const handleHide = async () => {
    if (!menu) return;
    const conv = conversations.find(c => c.id === menu.id);
    await hideConversation(menu.id, !conv?.is_hidden);
    closeMenu();
  };

  const handleDelete = async () => {
    if (!menu) return;
    const confirmed = window.confirm("Supprimer définitivement cette conversation et tous ses messages ?");
    if (!confirmed) { closeMenu(); return; }
    if (activeConversationId === menu.id) void navigate({ to: "/chat" });
    await deleteConversation(menu.id);
    closeMenu();
  };

  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center py-4 px-1 border-r border-border bg-sidebar-bg w-12 shrink-0">
        <button onClick={toggleSidebar} className="p-2 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground">
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col w-64 shrink-0 border-r border-border bg-sidebar-bg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground tracking-tight">Historique</span>
          <div className="flex items-center gap-1">
            <Link
              to="/chat"
              onClick={() => setActiveConversation(null)}
              className="p-1.5 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground"
              title="Nouvelle conversation"
            >
              <Plus className="w-4 h-4" />
            </Link>
            <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {groups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Aucune conversation</div>
          )}
          {groups.map(g => (
            <div key={g.label} className="mb-3">
              <div className="px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground uppercase tracking-wider">{g.label}</div>
              {g.items.map(c => (
                <button
                  key={c.id}
                  onContextMenu={e => openMenu(e, c.id)}
                  className={[
                    "sidebar-item w-full text-left flex items-start gap-2.5",
                    activeConversationId === c.id ? "active" : "",
                    c.is_hidden ? "opacity-50" : "",
                  ].join(" ")}
                  onClick={() => navigate({ to: "/chat/$conversationId", params: { conversationId: c.id } })}
                >
                  {c.type === "workflow" ? (
                    <Workflow className="w-3.5 h-3.5 mt-0.5 text-brand shrink-0" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-[0.8125rem] font-medium text-foreground truncate leading-snug ${c.is_hidden ? "italic" : ""}`}>{c.title}</div>
                    <div className="text-[0.7rem] text-muted-foreground">{firstName}</div>
                  </div>
                  {isSuperAdmin && c.is_hidden && (
                    <EyeOff className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {menu && (
        <ConvContextMenu
          menu={menu}
          conv={conversations.find(c => c.id === menu.id)}
          onHide={() => { void handleHide(); }}
          onDelete={() => { void handleDelete(); }}
          onClose={closeMenu}
        />
      )}
    </>
  );
}
