/**
 * Historique : « Mes conversations » (privées ou partagées par moi) et
 * « Partagées avec moi » (lecture seule). Menu d'actions par conversation :
 *  - propriétaire : renommer, partager / retirer le partage, supprimer ;
 *  - super admin, sur une conversation partagée d'autrui : masquer / réafficher.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Plus,
  EyeOff,
  Eye,
  Trash2,
  Globe2,
  Lock,
  MoreHorizontal,
  Search,
  Pencil,
} from "lucide-react";
import { useApp, type ConversationSummary } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { hasPermission } from "@/lib/permissions";
import { errorMessage } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShareDialog } from "@/components/chat/ShareDialog";

function groupByDate(convs: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: "Hier", items: [] },
    { label: "7 derniers jours", items: [] },
    { label: "Plus ancien", items: [] },
  ];
  convs.forEach((c) => {
    const t = c.updatedAt.getTime();
    if (t >= today) groups[0].items.push(c);
    else if (t >= today - 86400000) groups[1].items.push(c);
    else if (t >= today - 7 * 86400000) groups[2].items.push(c);
    else groups[3].items.push(c);
  });
  return groups.filter((g) => g.items.length > 0);
}

export function ConversationSidebar({ activeId }: { activeId: string | null }) {
  const {
    myConversations,
    sharedConversations,
    conversationsLoaded,
    conversationsError,
    loadConversations,
    sidebarOpen,
    toggleSidebar,
    deleteConversation,
    moderateConversation,
    renameConversation,
  } = useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [query, setQuery] = useState("");
  const [shareTarget, setShareTarget] = useState<ConversationSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const canModerate = hasPermission(profile?.role, "conversation.moderate");
  const canShare = hasPermission(profile?.role, "conversation.share");

  useEffect(() => {
    if (profile?.id && !conversationsLoaded) void loadConversations(profile.id);
  }, [profile?.id, conversationsLoaded, loadConversations]);

  useEffect(() => {
    if (activeId && sharedConversations.some((c) => c.id === activeId)) setTab("shared");
  }, [activeId, sharedConversations]);

  const list = tab === "mine" ? myConversations : sharedConversations;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? list.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (!c.isOwn && c.ownerName.toLowerCase().includes(q)),
        )
      : list;
  }, [list, query]);
  const groups = groupByDate(filtered);

  async function rename(c: ConversationSummary) {
    const title = window.prompt("Nouveau titre", c.title)?.trim();
    if (!title || title === c.title) return;
    try {
      await renameConversation(c.id, title.slice(0, 120));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (!sidebarOpen) {
    return (
      <div className="hidden md:flex flex-col items-center py-4 px-1 border-r border-border bg-sidebar-bg w-12 shrink-0">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Afficher l'historique"
          className="p-2 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 border-r border-border bg-sidebar-bg"
      aria-label="Historique des conversations"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground tracking-tight">Historique</span>
        <div className="flex items-center gap-1">
          <Link
            to="/chat"
            className="p-1.5 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground"
            title="Nouvelle conversation"
            aria-label="Nouvelle conversation"
          >
            <Plus className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Masquer l'historique"
            className="p-1.5 rounded-md hover:bg-sidebar-hover transition-colors text-muted-foreground"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3 space-y-2">
        <div
          role="tablist"
          aria-label="Type de conversations"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5"
        >
          {(["mine", "shared"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-all ${tab === t ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "mine" ? `Mes conversations` : `Partagées (${sharedConversations.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <label htmlFor="conv-search" className="sr-only">
            Rechercher
          </label>
          <input
            id="conv-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 bg-transparent text-xs outline-none py-0.5"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2">
        {!conversationsLoaded && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">Chargement…</div>
        )}
        {conversationsError && (
          <div className="px-3 py-3 text-xs text-destructive">{conversationsError}</div>
        )}
        {conversationsLoaded && groups.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query
              ? "Aucun résultat."
              : tab === "mine"
                ? "Aucune conversation. Démarrez-en une !"
                : "Aucune conversation partagée pour l'instant."}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground uppercase tracking-wider">
              {g.label}
            </div>
            {g.items.map((c) => {
              const showMenu = c.isOwn || canModerate;
              return (
                <div
                  key={c.id}
                  className={`group sidebar-item flex items-start gap-2 ${activeId === c.id ? "active" : ""} ${c.isHidden ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 flex items-start gap-2.5 text-left"
                    onClick={() =>
                      navigate({ to: "/chat/$conversationId", params: { conversationId: c.id } })
                    }
                  >
                    {c.visibility === "shared" ? (
                      <Globe2
                        className="w-3.5 h-3.5 mt-0.5 text-brand shrink-0"
                        aria-label="Partagée"
                      />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[0.8125rem] font-medium text-foreground truncate leading-snug ${c.isHidden ? "italic" : ""}`}
                      >
                        {c.title}
                      </span>
                      <span className="block text-[0.7rem] text-muted-foreground truncate">
                        {c.isOwn
                          ? c.visibility === "shared"
                            ? "Partagée par moi"
                            : "Privée"
                          : c.ownerName}
                      </span>
                    </span>
                  </button>
                  {showMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions pour ${c.title}`}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:bg-muted text-muted-foreground"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {c.isOwn && (
                          <>
                            <DropdownMenuItem onSelect={() => void rename(c)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Renommer
                            </DropdownMenuItem>
                            {canShare && (
                              <DropdownMenuItem onSelect={() => setShareTarget(c)}>
                                {c.visibility === "shared" ? (
                                  <>
                                    <Lock className="w-3.5 h-3.5 mr-2" /> Retirer le partage
                                  </>
                                ) : (
                                  <>
                                    <Globe2 className="w-3.5 h-3.5 mr-2" /> Partager en lecture…
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Supprimer…
                            </DropdownMenuItem>
                          </>
                        )}
                        {!c.isOwn && canModerate && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void moderateConversation(c.id, !c.isHidden)
                                .then(() =>
                                  toast.success(
                                    c.isHidden ? "Conversation réaffichée" : "Conversation masquée",
                                  ),
                                )
                                .catch((e) => toast.error(errorMessage(e)))
                            }
                          >
                            {c.isHidden ? (
                              <>
                                <Eye className="w-3.5 h-3.5 mr-2" /> Réafficher
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5 mr-2" /> Masquer (modération)
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {shareTarget && (
        <ShareDialog
          conversationId={shareTarget.id}
          current={shareTarget.visibility}
          open
          onOpenChange={(o) => !o && setShareTarget(null)}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette conversation ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.title} » ainsi que ses messages et pièces jointes seront
              définitivement supprimés. Les statistiques d'usage anonymisées sont conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = deleteTarget;
                if (!target) return;
                void deleteConversation(target.id)
                  .then(() => {
                    toast.success("Conversation supprimée");
                    if (activeId === target.id) navigate({ to: "/chat" });
                  })
                  .catch((e) => toast.error(errorMessage(e)));
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
