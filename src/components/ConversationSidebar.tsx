import { useApp, type Conversation } from "@/lib/appContext";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, PanelLeftClose, PanelLeft, Plus, Workflow } from "lucide-react";

function groupByDate(convs: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: "Hier", items: [] },
    { label: "7 derniers jours", items: [] },
    { label: "Plus ancien", items: [] },
  ];

  convs.forEach(c => {
    const t = c.date.getTime();
    if (t >= today) groups[0].items.push(c);
    else if (t >= yesterday) groups[1].items.push(c);
    else if (t >= week) groups[2].items.push(c);
    else groups[3].items.push(c);
  });

  return groups.filter(g => g.items.length > 0);
}

export function ConversationSidebar() {
  const { conversations, activeConversationId, sidebarOpen, toggleSidebar, setActiveConversation } = useApp();
  const navigate = useNavigate();
  const groups = groupByDate(conversations);

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
        {groups.map(g => (
          <div key={g.label} className="mb-3">
            <div className="px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground uppercase tracking-wider">{g.label}</div>
            {g.items.map(c => (
              <button
                key={c.id}
                className={`sidebar-item w-full text-left flex items-start gap-2.5 ${activeConversationId === c.id ? "active" : ""}`}
                onClick={() => navigate({ to: "/chat/$conversationId", params: { conversationId: c.id } })}
              >
                {c.type === "workflow" ? (
                  <Workflow className="w-3.5 h-3.5 mt-0.5 text-brand shrink-0" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[0.8125rem] font-medium text-foreground truncate">{c.title}</div>
                  <div className="text-[0.6875rem] text-muted-foreground">{c.user}</div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
