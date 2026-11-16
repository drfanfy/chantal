/**
 * Interface de chat. Tous les appels IA passent par POST /api/chat (serveur) :
 * aucune clé fournisseur côté navigateur. Les conversations des autres
 * (partagées) sont affichées en lecture seule.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  X,
  FileText,
  Bot,
  Pencil,
  Check,
  Sparkles,
  Image,
  Square,
  Globe2,
  Lock,
  Copy,
  EyeOff,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { useAIConfig } from "@/lib/useAIConfig";
import { useConversationMessages, type ChatMessageView } from "@/lib/useConversation";
import { supabase } from "@/lib/supabase";
import { errorMessage, newRequestId, streamPost } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { SelectorPills } from "@/components/SelectorPills";
import { Markdown } from "@/components/Markdown";
import { ShareDialog } from "@/components/chat/ShareDialog";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

function acceptedTypes(vision: boolean, files: boolean): string[] {
  return [
    "text/plain",
    ...(vision ? ["image/jpeg", "image/png", "image/gif", "image/webp"] : []),
    ...(files ? ["application/pdf"] : []),
  ];
}

export function ChatInterface({ conversationId }: { conversationId: string | null }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const app = useApp();
  const {
    currentModelId,
    currentAgentId,
    currentPartnerId,
    pendingPrefill,
    consumePrefill,
    findConversation,
    upsertConversation,
    renameConversation,
  } = app;
  const { models, agents, partners } = useAIConfig();
  const { messages, setMessages, loading, notFound, reload } =
    useConversationMessages(conversationId);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conv = findConversation(conversationId);
  const isOwn = !conversationId || conv?.isOwn !== false;
  const canChat = hasPermission(profile?.role, "chat.use");
  const canShare = hasPermission(profile?.role, "conversation.share");
  const partner = partners.find((p) => p.id === currentPartnerId);
  const agent = agents.find((a) => a.id === (partner?.agent_id ?? currentAgentId));
  const model = models.find((m) => m.id === (partner?.ai_model_id ?? currentModelId));
  const speakerName = partner?.name ?? agent?.name ?? model?.name ?? "Chantal";
  const accept = acceptedTypes(!!model?.capabilities.vision, !!model?.capabilities.files);
  const modelReady = !!model?.configured;

  useEffect(() => {
    if (conversationId) app.setActiveConversation(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!pendingPrefill) return;
    setInput(pendingPrefill);
    consumePrefill();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, [pendingPrefill, consumePrefill]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamText]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [input]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")),
    [files],
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: File[]) {
    const ok: File[] = [];
    for (const f of list) {
      const type = f.type || (f.name.endsWith(".txt") ? "text/plain" : "");
      if (!accept.includes(type)) {
        toast.error(`« ${f.name} » : type non pris en charge par ${model?.name ?? "ce modèle"}`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`« ${f.name} » dépasse ${formatFileSize(MAX_FILE_BYTES)}`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length) setFiles((prev) => [...prev, ...ok].slice(0, 5));
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: profile!.id,
        title: (input.trim() || "Nouvelle conversation").slice(0, 60),
        ai_model_id: model?.id ?? null,
        agent_id: agent?.id ?? null,
        partner_id: partner?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw error ?? new Error("Création impossible");
    return data.id;
  }

  async function uploadAttachments(convId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const f of files) {
      const ext =
        (f.name.split(".").pop() ?? "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
      const path = `${profile!.id}/${convId}/${crypto.randomUUID()}.${ext}`;
      const type = f.type || "text/plain";
      const { error: upErr } = await supabase.storage
        .from("chat-files")
        .upload(path, f, { contentType: type });
      if (upErr) throw new Error(`Envoi de « ${f.name} » impossible`);
      const { data, error } = await supabase
        .from("message_attachments")
        .insert({
          conversation_id: convId,
          user_id: profile!.id,
          storage_path: path,
          file_name: f.name.slice(0, 200),
          mime_type: type,
          size_bytes: f.size,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) throw new Error(`Enregistrement de « ${f.name} » impossible`);
      ids.push(data.id);
    }
    return ids;
  }

  async function handleSend() {
    const content = input.trim();
    if ((!content && !files.length) || streaming || !profile) return;
    if (!modelReady) {
      toast.error(model ? `« ${model.name} » : non configuré` : "Choisissez un modèle disponible");
      return;
    }
    setStreaming(true);
    let convId = conversationId;
    try {
      let attachmentIds: string[] = [];
      if (files.length) {
        convId = await ensureConversation();
        attachmentIds = await uploadAttachments(convId);
      }
      const optimistic: ChatMessageView = {
        id: `local-${Date.now()}`,
        role: "user",
        content,
        status: "complete",
        createdAt: new Date(),
        speakerName: null,
        speakerAvatarUrl: null,
        speakerIcon: null,
        attachments: files.map((f, i) => ({
          id: `f${i}`,
          fileName: f.name,
          mimeType: f.type,
          url: previews[i] || null,
        })),
      };
      setMessages((m) => [...m, optimistic]);
      setInput("");
      setFiles([]);
      setStreamText("");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let createdId: string | null = convId !== conversationId ? convId : null;
      let finalTitle: string | null = null;

      await streamPost(
        "/api/chat",
        {
          conversationId: convId,
          clientRequestId: newRequestId(),
          content,
          modelId: model?.id,
          agentId: agent?.id ?? null,
          partnerId: partner?.id ?? null,
          attachmentIds,
        },
        (ev) => {
          if (ev.type === "meta") {
            if (ev.created) createdId = ev.conversationId;
            convId = ev.conversationId;
          } else if (ev.type === "delta") setStreamText((t) => (t ?? "") + ev.text);
          else if (ev.type === "done") finalTitle = ev.title;
          else if (ev.type === "error") toast.error(ev.message);
        },
        ctrl.signal,
      );

      if (convId) {
        const existing = findConversation(convId);
        upsertConversation({
          id: convId,
          title: finalTitle ?? existing?.title ?? (content.slice(0, 60) || "Nouvelle conversation"),
          userId: profile.id,
          ownerName: profile.full_name ?? "Moi",
          ownerAvatarUrl: profile.avatar_url,
          isOwn: true,
          visibility: existing?.visibility ?? "private",
          isHidden: false,
          sharedAt: existing?.sharedAt ?? null,
          updatedAt: new Date(),
          modelId: model?.id ?? null,
          agentId: agent?.id ?? null,
          partnerId: partner?.id ?? null,
        });
      }
      if (createdId) {
        navigate({
          to: "/chat/$conversationId",
          params: { conversationId: createdId },
          replace: true,
        });
      } else {
        await reload();
      }
    } catch (e) {
      toast.error(errorMessage(e));
      if (convId && convId !== conversationId)
        navigate({
          to: "/chat/$conversationId",
          params: { conversationId: convId },
          replace: true,
        });
      else await reload();
    } finally {
      setStreamText(null);
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const ownerName = conv && !conv.isOwn ? conv.ownerName : (profile?.full_name ?? "Vous");
  const ownerAvatar = conv && !conv.isOwn ? conv.ownerAvatarUrl : (profile?.avatar_url ?? null);
  const initials = ownerName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  if (conversationId && notFound && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center h-full">
        <h1 className="text-lg font-semibold">Conversation introuvable</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Elle n'existe plus, elle est privée, ou son partage a été retiré.
        </p>
      </div>
    );
  }

  const hasContent = messages.length > 0 || streamText !== null;
  const readOnlyBanner = (
    <div className="shrink-0 border-t border-border/50 bg-muted/20 px-6 py-3 text-xs text-center text-muted-foreground">
      {!canChat ? (
        "Votre rôle (lecteur) permet de consulter, pas d'écrire."
      ) : (
        <>
          Conversation partagée par{" "}
          <span className="font-medium text-foreground">{conv?.ownerName}</span> — lecture seule
        </>
      )}
    </div>
  );

  const bottomBar = (
    <div className="shrink-0 border-t border-border/50 bg-background">
      <div className="max-w-4xl mx-auto px-4 pb-4 pt-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 bg-muted rounded-xl max-w-xs"
              >
                {previews[i] ? (
                  <img
                    src={previews[i]}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-border"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-muted-foreground/10 flex items-center justify-center shrink-0">
                    {file.type.startsWith("image/") ? (
                      <Image className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate max-w-[8rem]">{file.name}</div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    {formatFileSize(file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Retirer ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="chat-input-container w-full flex items-end gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title={`Joindre : texte${model?.capabilities.vision ? ", images" : ""}${model?.capabilities.files ? ", PDF" : ""}`}
              aria-label="Joindre un fichier"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={accept.join(",")}
              multiple
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <label htmlFor="chat-input" className="sr-only">
              Votre message
            </label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                modelReady
                  ? "Posez votre question… (Maj+Entrée pour aller à la ligne)"
                  : "Aucun modèle configuré : contactez un administrateur"
              }
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-[200px] leading-relaxed"
              rows={1}
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Arrêter la génération"
                className="p-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 shrink-0 mb-0.5"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={(!input.trim() && !files.length) || !modelReady}
                aria-label="Envoyer"
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0 mb-0.5"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <SelectorPills disabled={streaming} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (isOwn && canChat) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (isOwn && canChat) addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {isDragging && <DragOverlay />}
      {conv && (
        <ConversationHeader
          title={conv.title}
          editable={conv.isOwn}
          onRename={(t) =>
            renameConversation(conv.id, t).catch((e) => toast.error(errorMessage(e)))
          }
          speakerName={speakerName}
          ownerName={ownerName}
          ownerAvatar={ownerAvatar}
          initials={initials}
          visibility={conv.visibility}
          hidden={conv.isHidden}
          canShare={conv.isOwn && canShare}
          onShare={() => setShareOpen(true)}
        />
      )}
      {conv && (
        <ShareDialog
          conversationId={conv.id}
          current={conv.visibility}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6" aria-live="polite">
        {!hasContent && !loading ? (
          <div className="h-full flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/15 to-violet-500/10 ring-1 ring-brand/20 mb-5">
                <Sparkles className="w-6 h-6 text-brand" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight mb-1.5">Nouvelle conversation</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Vous discutez avec{" "}
                <span className="text-foreground font-medium">{speakerName}</span>
              </p>
              <p className="text-xs text-muted-foreground/80 flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Conversation privée par défaut — vous pourrez la
                partager ensuite.
              </p>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {loading && messages.length === 0 && (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                ownerName={ownerName}
                ownerAvatar={ownerAvatar}
                initials={initials}
                fallbackSpeaker={speakerName}
              />
            ))}
            {streamText !== null && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamText || "…",
                  status: "streaming",
                  createdAt: new Date(),
                  speakerName,
                  speakerAvatarUrl: partner?.avatar_url ?? null,
                  speakerIcon: agent?.icon ?? null,
                  attachments: [],
                }}
                ownerName={ownerName}
                ownerAvatar={ownerAvatar}
                initials={initials}
                fallbackSpeaker={speakerName}
              />
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
      {isOwn && canChat ? bottomBar : readOnlyBanner}
    </div>
  );
}

function DragOverlay() {
  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div className="absolute inset-3 border-2 border-dashed border-brand/40 rounded-2xl bg-brand/5 flex items-center justify-center">
        <p className="text-sm font-medium text-brand">Déposez vos fichiers ici</p>
      </div>
    </div>
  );
}

function ConversationHeader({
  title,
  editable,
  onRename,
  speakerName,
  ownerName,
  ownerAvatar,
  initials,
  visibility,
  hidden,
  canShare,
  onShare,
}: {
  title: string;
  editable: boolean;
  onRename: (t: string) => void;
  speakerName: string;
  ownerName: string;
  ownerAvatar: string | null;
  initials: string;
  visibility: "private" | "shared";
  hidden: boolean;
  canShare: boolean;
  onShare: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  useEffect(() => setVal(title), [title]);
  const commit = () => {
    const t = val.trim();
    if (t && t !== title) onRename(t);
    else setVal(title);
    setEditing(false);
  };
  return (
    <div className="shrink-0 border-b border-border bg-surface/40 px-4 sm:px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <label htmlFor="conv-title" className="sr-only">
                Titre
              </label>
              <input
                id="conv-title"
                autoFocus
                value={val}
                maxLength={120}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") {
                    setVal(title);
                    setEditing(false);
                  }
                }}
                className="flex-1 bg-transparent border-b border-brand/40 outline-none text-sm font-semibold py-0.5"
              />
              <button
                type="button"
                onClick={commit}
                aria-label="Valider le titre"
                className="p-1 rounded hover:bg-muted text-brand"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!editable}
              onClick={() => setEditing(true)}
              className="group flex items-center gap-2 text-left max-w-full disabled:cursor-default"
            >
              <span className="text-sm font-semibold truncate">{title}</span>
              {editable && (
                <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          )}
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
            avec <span className="text-foreground font-medium">{speakerName}</span>
          </div>
        </div>
        {hidden && (
          <span className="text-[0.7rem] flex items-center gap-1 text-amber-700 bg-amber-500/10 px-2 py-1 rounded-md">
            <EyeOff className="w-3 h-3" /> Masquée par la modération
          </span>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!canShare}
          className={`shrink-0 flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded-md border transition-colors disabled:cursor-default ${visibility === "shared" ? "border-brand/30 bg-brand/5 text-brand" : "border-border text-muted-foreground"} ${canShare ? "hover:bg-muted" : ""}`}
          title={canShare ? "Modifier le partage" : undefined}
        >
          {visibility === "shared" ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {visibility === "shared" ? "Partagée (lecture)" : "Privée"}
        </button>
        <div className="shrink-0 flex items-center gap-2 text-[0.7rem] text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
          {ownerAvatar ? (
            <img src={ownerAvatar} className="w-4 h-4 rounded-full object-cover" alt="" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[0.6rem] font-semibold text-primary">
              {initials}
            </span>
          )}
          <span className="font-medium text-foreground">{ownerName}</span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  ownerName,
  ownerAvatar,
  initials,
  fallbackSpeaker,
}: {
  message: ChatMessageView;
  ownerName: string;
  ownerAvatar: string | null;
  initials: string;
  fallbackSpeaker: string;
}) {
  const isUser = message.role === "user";
  const name = isUser ? ownerName : (message.speakerName ?? fallbackSpeaker);
  return (
    <div className="flex items-start gap-3 group">
      {isUser ? (
        ownerAvatar ? (
          <img src={ownerAvatar} className="w-8 h-8 rounded-xl object-cover shrink-0" alt="" />
        ) : (
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">{initials || "?"}</span>
          </div>
        )
      ) : message.speakerAvatarUrl ? (
        <img
          src={message.speakerAvatarUrl}
          className="w-8 h-8 rounded-xl object-cover shrink-0"
          alt=""
        />
      ) : (
        <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 text-base">
          {message.speakerIcon ?? <Bot className="w-4 h-4 text-brand" />}
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-foreground">{name}</span>
          <span className="text-[0.6875rem] text-muted-foreground">
            {message.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.status === "cancelled" && (
            <span className="text-[0.65rem] text-muted-foreground italic">interrompue</span>
          )}
          {!isUser && message.status === "complete" && (
            <button
              type="button"
              aria-label="Copier la réponse"
              onClick={() => {
                void navigator.clipboard.writeText(message.content);
                toast.success("Réponse copiée");
              }}
              className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((f) =>
              f.mimeType.startsWith("image/") && f.url ? (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block w-fit">
                  <img
                    src={f.url}
                    alt={f.fileName}
                    className="max-w-[200px] max-h-36 rounded-xl object-cover ring-1 ring-border"
                  />
                </a>
              ) : (
                <a
                  key={f.id}
                  href={f.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs text-muted-foreground hover:bg-muted/80"
                >
                  <FileText className="w-3.5 h-3.5 text-brand shrink-0" /> {f.fileName}
                </a>
              ),
            )}
          </div>
        )}
        <div
          className={`text-sm leading-relaxed ${message.status === "error" ? "text-destructive" : "text-foreground"}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}
