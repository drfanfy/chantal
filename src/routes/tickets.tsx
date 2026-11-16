import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { Send, Bug, Lightbulb, HelpCircle, Clock, MessageSquare, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/tickets")({ component: TicketsPage });

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved";
type TicketType = "bug" | "suggestion" | "question";
type TicketPriority = "low" | "medium" | "high";

interface Ticket {
  id: string;
  user_id: string;
  type: TicketType;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; email: string; avatar_url: string | null };
  message_count?: number;
}
interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  profiles?: { full_name: string | null; email: string; avatar_url: string | null };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  TicketType,
  { label: string; Icon: React.ElementType; color: string; bg: string }
> = {
  bug: { label: "Bug", Icon: Bug, color: "text-red-500", bg: "bg-red-500/10" },
  suggestion: {
    label: "Suggestion",
    Icon: Lightbulb,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  question: { label: "Question", Icon: HelpCircle, color: "text-blue-500", bg: "bg-blue-500/10" },
};
const STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Ouvert", color: "text-blue-600", bg: "bg-blue-500/10" },
  in_progress: { label: "En cours", color: "text-amber-600", bg: "bg-amber-500/10" },
  resolved: { label: "Résolu", color: "text-green-600", bg: "bg-green-500/10" },
};

function Avatar({ name, size = "sm" }: { name?: string | null; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs";
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";
  return (
    <div
      className={`${sz} rounded-full bg-brand/20 flex items-center justify-center font-semibold text-brand shrink-0`}
    >
      {initials}
    </div>
  );
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TicketsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterType, setFilterType] = useState<TicketType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "all">("all");
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Chargement tickets ─────────────────────────────────────────────────────
  async function loadTickets() {
    setLoading(true);
    let q = supabase
      .from("tickets")
      .select("*, profiles(full_name, email, avatar_url)")
      .order("updated_at", { ascending: false });
    if (!isAdmin) q = q.eq("user_id", profile?.id ?? "");
    if (filterType !== "all") q = q.eq("type", filterType);
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    const { data, error } = await q;
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }

  useEffect(() => {
    if (profile) loadTickets();
  }, [profile, filterType, filterStatus]);

  // ── Chargement messages d'un ticket ───────────────────────────────────────
  async function loadMessages(ticketId: string) {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*, profiles(full_name, email, avatar_url)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as TicketMessage[]);
    if (isAdmin && profile) {
      await supabase
        .from("ticket_messages")
        .update({ is_read: true })
        .eq("ticket_id", ticketId)
        .neq("user_id", profile.id);
    }
  }

  useEffect(() => {
    if (!selectedTicket) return;
    loadMessages(selectedTicket.id);
    // Realtime messages
    const channel = supabase
      .channel(`ticket_${selectedTicket.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        () => loadMessages(selectedTicket.id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendReply() {
    if (!replyText.trim() || !profile || !selectedTicket) return;
    const content = replyText.trim();
    setReplyText("");
    setSendingReply(true);
    await supabase.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      user_id: profile.id,
      content,
    });
    await supabase
      .from("tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selectedTicket.id);
    setSendingReply(false);
    await loadMessages(selectedTicket.id);
  }

  async function updateStatus(newStatus: TicketStatus) {
    if (!selectedTicket) return;
    await supabase.from("tickets").update({ status: newStatus }).eq("id", selectedTicket.id);

    if (profile) {
      const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const name = profile.full_name ?? profile.email ?? "Admin";
      const isClosing = newStatus === "resolved";
      const isReopening = selectedTicket.status === "resolved" && newStatus !== "resolved";
      if (isClosing || isReopening) {
        await supabase.from("ticket_messages").insert({
          ticket_id: selectedTicket.id,
          user_id: profile.id,
          content: `⚙️ Ticket ${isClosing ? "clôturé" : "rouvert"} par ${name} à ${time}`,
        });
      }
    }

    setSelectedTicket((t) => (t ? { ...t, status: newStatus } : null));
    setTickets((ts) =>
      ts.map((t) => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t)),
    );
    await loadMessages(selectedTicket.id);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="flex flex-1 overflow-hidden">
        {/* ── Liste ──────────────────────────────────────────────────────── */}
        <div
          className={`flex flex-col border-r border-border bg-sidebar-bg ${selectedTicket ? "hidden md:flex w-80 shrink-0" : "flex-1 md:w-80 md:flex-none md:shrink-0"}`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold mb-2">Tickets{isAdmin ? "" : " — Mes retours"}</h2>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "bug", "suggestion", "question"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilterType(v)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${filterType === v ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {v === "all" ? "Tous" : TYPE_META[v].label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {(["all", "open", "in_progress", "resolved"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilterStatus(v)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${filterStatus === v ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {v === "all" ? "Tous statuts" : STATUS_META[v].label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 text-xs text-muted-foreground text-center">Chargement…</div>
            )}
            {!loading && tickets.length === 0 && (
              <div className="p-6 text-xs text-muted-foreground text-center">Aucun ticket.</div>
            )}
            {tickets.map((ticket) => {
              const tm = TYPE_META[ticket.type];
              const sm = STATUS_META[ticket.status];
              const active = selectedTicket?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors ${active ? "bg-brand/5 border-l-2 border-l-brand" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1 rounded-md shrink-0 ${tm.bg}`}>
                      <tm.Icon className={`w-3 h-3 ${tm.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{ticket.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium ${sm.bg} ${sm.color}`}
                        >
                          {sm.label}
                        </span>
                        <span className="text-[0.6rem] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {fmtDate(ticket.created_at)}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="text-[0.6rem] text-muted-foreground mt-0.5 truncate">
                          {ticket.profiles?.full_name ??
                            ticket.profiles?.email ??
                            `${ticket.user_id.slice(0, 8)}…`}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Conversation ───────────────────────────────────────────────── */}
        {selectedTicket ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Ticket header */}
            <div className="shrink-0 px-5 py-3 border-b border-border bg-surface/40 flex items-start gap-3">
              <button
                onClick={() => setSelectedTicket(null)}
                className="md:hidden p-1 rounded-md hover:bg-muted text-muted-foreground mt-0.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-[0.65rem] px-1.5 py-0.5 rounded-full font-medium ${TYPE_META[selectedTicket.type].bg} ${TYPE_META[selectedTicket.type].color}`}
                  >
                    {(() => {
                      const T = TYPE_META[selectedTicket.type];
                      return <T.Icon className="w-3 h-3" />;
                    })()}
                    {TYPE_META[selectedTicket.type].label}
                  </span>
                  <h3 className="text-sm font-semibold">{selectedTicket.title}</h3>
                </div>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedTicket.profiles?.full_name ??
                      selectedTicket.profiles?.email ??
                      `${selectedTicket.user_id.slice(0, 8)}…`}
                  </p>
                )}
              </div>
              {/* Changement de statut */}
              {isAdmin && (
                <div className="shrink-0">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => {
                      void updateStatus(e.target.value as TicketStatus);
                    }}
                    className={`rounded-lg border border-border px-2 py-1 text-xs font-medium cursor-pointer ${STATUS_META[selectedTicket.status].bg} ${STATUS_META[selectedTicket.status].color}`}
                  >
                    {(["open", "in_progress", "resolved"] as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  // Message système (clôture / réouverture)
                  if (msg.content.startsWith("⚙️ ")) {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 py-1"
                      >
                        <div className="h-px flex-1 bg-border/40" />
                        <span className="text-[0.6rem] text-muted-foreground/60 shrink-0 select-none">
                          {msg.content.slice(3)}
                        </span>
                        <div className="h-px flex-1 bg-border/40" />
                      </motion.div>
                    );
                  }

                  const isOwn = msg.user_id === profile?.id;
                  const isUserMsg = msg.user_id === selectedTicket.user_id;
                  const alignRight = isAdmin ? isUserMsg : isOwn;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-end gap-2 ${alignRight ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <Avatar name={msg.profiles?.full_name ?? msg.profiles?.email} size="sm" />
                      <div
                        className={`max-w-[70%] ${alignRight ? "items-end" : "items-start"} flex flex-col gap-1`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[0.65rem] text-muted-foreground font-medium">
                            {msg.user_id === profile?.id
                              ? (profile?.full_name ?? "Moi")
                              : (msg.profiles?.full_name ?? "Équipe support")}
                          </span>
                          <span className="text-[0.6rem] text-muted-foreground">
                            {fmtDate(msg.created_at)}
                          </span>
                        </div>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            alignRight
                              ? "bg-brand text-white rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Zone de réponse (admins uniquement) */}
            {isAdmin && selectedTicket.status !== "resolved" && (
              <div className="shrink-0 border-t border-border/50 bg-background px-5 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    placeholder="Répondre… (Entrée pour envoyer)"
                    rows={2}
                    className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-brand/40 resize-none transition-colors"
                  />
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className="p-2.5 rounded-xl bg-brand text-white hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0 mb-0.5"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {selectedTicket.status === "resolved" && (
              <div className="shrink-0 border-t border-border/50 bg-background px-5 py-3 text-xs text-center text-muted-foreground">
                Ticket résolu ·{" "}
                {isAdmin && (
                  <button
                    onClick={() => {
                      void updateStatus("open");
                    }}
                    className="text-brand hover:underline"
                  >
                    Rouvrir
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Sélectionne un ticket</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
