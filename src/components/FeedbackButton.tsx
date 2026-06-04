import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { X, Send, MessageCircle, Bug, Lightbulb, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type TicketType = "bug" | "suggestion" | "question";

const TYPES: { id: TicketType; label: string; Icon: React.ElementType; color: string }[] = [
  { id: "bug",        label: "Bug",        Icon: Bug,          color: "text-red-500"   },
  { id: "suggestion", label: "Suggestion", Icon: Lightbulb,    color: "text-amber-500" },
  { id: "question",   label: "Question",   Icon: HelpCircle,   color: "text-blue-500"  },
];

export function FeedbackButton() {
  const { profile } = useAuth();

  // ── Position (distance depuis coin bas-droit) ─────────────────────────────
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragging  = useRef(false);
  const dragMoved = useRef(false);
  const origin    = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-nd]")) return; // no-drag zones
    dragging.current  = true;
    dragMoved.current = false;
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = origin.current.mx - e.clientX;
      const dy = origin.current.my - e.clientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved.current = true;
      setPos({ x: Math.max(8, origin.current.px + dx), y: Math.max(8, origin.current.py + dy) });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Panel ────────────────────────────────────────────────────────────────
  const [open, setOpen]               = useState(false);
  const [type, setType]               = useState<TicketType>("bug");
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);

  // ── Badge non-lus ─────────────────────────────────────────────────────────
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    if (!profile?.id) return;
    const { data: myTickets } = await supabase.from("tickets")
      .select("id").eq("user_id", profile.id);
    if (!myTickets?.length) { setUnread(0); return; }
    const ids = myTickets.map(t => t.id);
    const { count } = await supabase.from("ticket_messages")
      .select("id", { count: "exact", head: true })
      .in("ticket_id", ids)
      .neq("user_id", profile.id)
      .eq("is_read", false);
    setUnread(count ?? 0);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    loadUnread();
    const channel = supabase.channel("feedback_unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, loadUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, loadUnread]);

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !profile?.id) return;
    setSending(true);
    try {
      const ticketId = crypto.randomUUID();
      const { error } = await supabase.from("tickets").insert({
        id: ticketId, user_id: profile.id, type,
        title: title.trim(), description: description.trim(),
        status: "open", priority: "medium",
      });
      if (error) throw error;
      await supabase.from("ticket_messages").insert({
        ticket_id: ticketId, user_id: profile.id, content: description.trim(),
      });
      setSent(true);
      setTitle(""); setDescription("");
      setTimeout(() => { setSent(false); setOpen(false); }, 2500);
    } catch (e) {
      console.error("[Ticket]", e);
      alert("Erreur lors de l'envoi.");
    } finally { setSending(false); }
  }

  if (!profile) return null;

  return (
    <div
      style={{ position: "fixed", right: pos.x, bottom: pos.y, zIndex: 9999 }}
      className="select-none"
    >
      {/* Panel — bloque la propagation pour ne pas déclencher le drag */}
      <AnimatePresence>
        {open && (
          <motion.div
            onMouseDown={e => e.stopPropagation()}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit   ={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-16 w-80 bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Envoyer un retour</span>
              <button onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {sent ? (
              <div className="px-4 py-10 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm font-semibold">Merci pour ton retour !</p>
                <p className="text-xs text-muted-foreground mt-1">L'équipe reviendra vers toi rapidement.</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Type */}
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button key={t.id} onClick={() => setType(t.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                        type === t.id ? "border-brand/40 bg-brand/5 text-brand" : "border-border text-muted-foreground hover:bg-muted"
                      }`}>
                      <t.Icon className={`w-4 h-4 ${type === t.id ? "text-brand" : t.color}`} />
                      {t.label}
                    </button>
                  ))}
                </div>

                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Titre court *"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/40 transition-colors" />

                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Décris le problème ou ta suggestion…"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/40 resize-none transition-colors" />

                <button onClick={handleSubmit}
                  disabled={!title.trim() || !description.trim() || sending}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
                  <Send className="w-3.5 h-3.5" />
                  {sending ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton flottant — mousedown ici déclenche le drag */}
      <button
        onMouseDown={onMouseDown}
        onClick={() => { if (!dragMoved.current) setOpen(o => !o); dragMoved.current = false; }}
        className={`relative w-12 h-12 rounded-full shadow-elevated flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing ${
          open ? "bg-foreground text-background" : "bg-violet-600 text-white"
        }`}
      >
        {open ? <X className="w-5 h-5" /> : <Bug className="w-5 h-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[0.6rem] font-bold flex items-center justify-center ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
