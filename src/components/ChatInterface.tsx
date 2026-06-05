import { useState, useRef, useEffect } from "react";
import { useApp, type Message } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { partners } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { streamGemini, type GeminiMessage } from "@/lib/gemini";
import { streamGroq, type GroqMessage } from "@/lib/groq";
import { streamOpenAI } from "@/lib/openai";
import { useAIConfig } from "@/lib/useAIConfig";
import { SelectorPills } from "@/components/SelectorPills";
import { supabase } from "@/lib/supabase";
import { Send, Paperclip, X, FileText, Bot, Pencil, Check, Sparkles, Image } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHANTAL_BASE = `Tu es Chantal, l'assistante IA interne du groupe QUARTUS, promoteur immobilier.
Tu aides les équipes dans leurs tâches quotidiennes. Réponds toujours en français, de manière professionnelle et concise.`;

const AGENT_PROMPTS: Record<string, string> = {
  "Assistant rédaction": "Tu es spécialisé en rédaction professionnelle et commerciale pour l'immobilier haut de gamme.",
  "Comité Engagement": "Tu analyses des dossiers immobiliers pour les comités d'engagement : risques, rentabilité, recommandations structurées.",
  "Analyse commerciale": "Tu fournis des analyses commerciales précises : marché, concurrence, positionnement, stratégie de vente.",
  "Analyse marketing": "Tu analyses les performances marketing : campagnes, KPIs, ROI, et proposes des optimisations.",
  "Graphiste": "Tu aides à la direction artistique et aux briefs créatifs pour des supports immobiliers premium.",
  "Développeur": "Tu fournis une assistance technique : architecture, code, automatisations, intégrations.",
  "Organisation": "Tu aides à la productivité, la structuration de projets et la coordination d'équipes.",
};

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-emerald-500/10",
  google: "bg-blue-500/10",
  groq: "bg-orange-500/10",
};

const ACCEPTED_TYPES = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function isAccepted(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) || file.name.endsWith(".txt");
}

async function generateTitle(
  messages: Array<{ role: string; content: string }>,
  apiKey: string
): Promise<string> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          ...messages.slice(0, 4),
          { role: "user", content: "Donne un titre de 3 à 5 mots à cette conversation. Réponds UNIQUEMENT avec le titre, sans ponctuation ni guillemets." },
        ],
        max_tokens: 20,
        stream: false,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

async function uploadFileToStorage(file: File, userId: string): Promise<string | null> {
  const safeExt = (file.name.split(".").pop() ?? "bin").replace(/[^a-zA-Z0-9]/g, "");
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;
  const { data, error } = await supabase.storage
    .from("chat-files")
    .upload(path, file, { contentType: file.type });
  if (error) { console.error("[Storage] Upload:", error.message); return null; }
  const { data: { publicUrl } } = supabase.storage.from("chat-files").getPublicUrl(data.path);
  return publicUrl;
}

export function ChatInterface() {
  const {
    currentModel, currentAgent, currentPartner,
    addMessage, prepareConversation, loadConversationsFromDB,
    conversations, activeConversationId,
    pendingPrefill, consumePrefill,
    renameConversation,
  } = useApp();
  const { profile } = useAuth();
  const currentUser = profile?.full_name ?? profile?.email ?? "Vous";
  const { models: dbModels, agents: dbAgents, partners: dbPartners } = useAIConfig();

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasLoadedFromDB = useRef(false);

  const activeConv = conversations.find(c => c.id === activeConversationId);
  const messages = activeConv?.messages ?? [];
  const hasMessages = messages.length > 0 || isTyping || streamingContent !== null;
  const hasAttachments = attachedFiles.length > 0;

  const activeDbPartner = currentPartner ? dbPartners.find(p => p.id === currentPartner) : null;
  const activeDbAgent = dbAgents.find(a => a.name === currentAgent);
  const activeDbModel = dbModels.find(m => m.name === currentModel);
  const legacyPartner = partners.find(p => p.id === (currentPartner ?? ""));

  const currentSpeakerName =
    activeDbPartner?.name ??
    legacyPartner?.name ??
    (currentAgent !== "Aucun" ? currentAgent : null) ??
    currentModel;

  // Nom et avatar de l'auteur de la conversation (peut être différent du viewer)
  const convOwner    = activeConv?.user ?? currentUser;
  const userInitials = convOwner
    .split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("");
  // isOwn : fiable car basé sur user_id comparé au chargement (pas sur le nom)
  // undefined = conversation nouvelle non encore en DB → toujours la sienne
  const isOwnConv = !activeConv || (activeConv.isOwn ?? true);
  const currentAiAvatarUrl =
    activeDbPartner?.avatar_url ??
    (legacyPartner ? (partnerImages[legacyPartner.id] ?? null) : null) ?? null;
  const currentAiIcon = activeDbAgent?.icon ?? null;
  const currentAiProvider = activeDbModel?.provider ?? "groq";

  useEffect(() => {
    if (profile?.id && !hasLoadedFromDB.current) {
      hasLoadedFromDB.current = true;
      void loadConversationsFromDB(profile.id, profile.role === "super_admin", profile.full_name ?? undefined);
    }
  }, [profile?.id, loadConversationsFromDB]);

  useEffect(() => {
    const urls = attachedFiles.map(f =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : ""
    );
    setPreviewUrls(urls);
    return () => urls.forEach(u => u && URL.revokeObjectURL(u));
  }, [attachedFiles]);

  useEffect(() => {
    if (pendingPrefill) {
      setInput(pendingPrefill);
      consumePrefill();
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrefill]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping, streamingContent !== null]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(isAccepted);
    if (dropped.length) setAttachedFiles(prev => [...prev, ...dropped]);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFiles.length) || isStreaming) return;

    const content = input.trim();
    // Capturer les infos du speaker au moment de l'envoi (figées par message)
    const speakerNameAtSend      = currentSpeakerName;
    const speakerAvatarUrlAtSend = currentAiAvatarUrl;
    const speakerIconAtSend      = currentAiIcon;

    // Uploader toutes les pièces jointes
    const fileAttachments: { name: string; type: string; url?: string }[] = [];
    for (const file of attachedFiles) {
      if (profile?.id) {
        const url = await uploadFileToStorage(file, profile.id);
        fileAttachments.push({ name: file.name, type: file.type, url: url ?? undefined });
      } else {
        fileAttachments.push({ name: file.name, type: file.type });
      }
    }

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      targetConvId = crypto.randomUUID();
      prepareConversation(targetConvId, content.slice(0, 40) || "Nouvelle conversation");
      if (profile?.id) {
        const { error: convErr } = await supabase.from("conversations").insert({
          id: targetConvId, user_id: profile.id,
          title: content.slice(0, 40) || "Nouvelle conversation",
        });
      }
    }

    const existingMessages = activeConv?.messages ?? [];
    const history: GroqMessage[] = [
      ...existingMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content },
    ];

    setInput("");
    setAttachedFiles([]);
    addMessage({ role: "user", content, files: fileAttachments.length ? fileAttachments : undefined });

    const { error: uErr } = await supabase.from("messages").insert({ conversation_id: targetConvId, role: "user", content });

    const modelId = activeDbModel?.model_id ?? "llama-3.1-8b-instant";
    const provider = activeDbModel?.provider ?? "groq";
    const hardcodedPrompt = AGENT_PROMPTS[currentAgent] ?? "";
    const hardcodedInstruction = hardcodedPrompt ? `${CHANTAL_BASE}\n\n${hardcodedPrompt}` : CHANTAL_BASE;
    const systemInstruction = activeDbPartner?.system_prompt ?? activeDbAgent?.system_prompt ?? hardcodedInstruction;

    const openAIMessages: GroqMessage[] = [{ role: "system", content: systemInstruction }, ...history];

    const stream = (() => {
      if (provider === "google") {
        return streamGemini(
          history.map(m => ({ role: (m.role === "assistant" ? "model" : "user") as "user" | "model", parts: [{ text: m.content }] })),
          systemInstruction, modelId
        );
      }
      if (provider === "openai") return streamOpenAI(openAIMessages, modelId);
      return streamGroq(openAIMessages, modelId);
    })();

    setIsStreaming(true); setIsTyping(true); setStreamingContent(null);

    try {
      let accumulated = "";
      let waitingForFirst = true;
      for await (const chunk of stream) {
        if (waitingForFirst) { setIsTyping(false); waitingForFirst = false; }
        accumulated += chunk;
        setStreamingContent(accumulated);
      }
      addMessage({
        role: "assistant", content: accumulated,
        speakerName: speakerNameAtSend,
        speakerAvatarUrl: speakerAvatarUrlAtSend,
        speakerIcon: speakerIconAtSend,
      });
      const { error: aErr } = await supabase.from("messages").insert({
        conversation_id: targetConvId, role: "assistant", content: accumulated,
        speaker_name: speakerNameAtSend,
        speaker_avatar_url: speakerAvatarUrlAtSend ?? null,
        speaker_icon: speakerIconAtSend ?? null,
      });

      // Générer un titre IA après le premier échange (conversation nouvellement créée)
      if (!activeConversationId) {
        const openAiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
        if (openAiKey) {
          const titleHistory = [
            { role: "user", content },
            { role: "assistant", content: accumulated },
          ];
          const aiTitle = await generateTitle(titleHistory, openAiKey);
          if (aiTitle) {
            renameConversation(targetConvId!, aiTitle);
            void supabase.from("conversations").update({ title: aiTitle }).eq("id", targetConvId!);
          }
        }
      }
    } catch (err) {
      console.error("[Chat] Erreur stream:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const userMsg =
        msg.includes("401") || msg.includes("403")
          ? "Clé API invalide ou expirée. Vérifiez VITE_GROQ_API_KEY dans votre .env."
          : msg.includes("404") || msg.toLowerCase().includes("model")
          ? "Modèle introuvable ou déprécié. Mettez à jour le model_id dans Admin → Modèles IA (ex : llama-3.1-8b-instant)."
          : msg.includes("429")
          ? "Limite de débit Groq atteinte. Réessayez dans quelques secondes."
          : `Une erreur est survenue : ${msg}`;
      addMessage({
        role: "assistant", content: userMsg,
        speakerName:      speakerNameAtSend,
        speakerAvatarUrl: speakerAvatarUrlAtSend,
        speakerIcon:      speakerIconAtSend,
      });
      if (targetConvId) {
        void supabase.from("messages").insert({
          conversation_id: targetConvId, role: "assistant", content: userMsg,
          speaker_name:       speakerNameAtSend,
          speaker_avatar_url: speakerAvatarUrlAtSend ?? null,
          speaker_icon:       speakerIconAtSend ?? null,
        });
      }
    } finally {
      setStreamingContent(null); setIsStreaming(false); setIsTyping(false);
    }
  };

  const renderHighlightedText = (text: string) =>
    text.split(/(\[[^\]]+\])/g).map((part, i) =>
      part.startsWith("[") && part.endsWith("]")
        ? <span key={i} className="highlight-var">{part}</span>
        : <span key={i}>{part}</span>
    );

  // Avatar : celui du viewer si conv perso, sinon celui de l'auteur chargé depuis DB
  const ownerAvatar = isOwnConv ? (profile?.avatar_url ?? null) : (activeConv?.ownerAvatarUrl ?? null);
  const avatarBase  = { userInitials, userAvatar: ownerAvatar, providerBg: PROVIDER_BG };

  // ── Barre de saisie — sélecteurs à gauche, textarea à droite ────────────────

  const bottomBar = (
    <div className="shrink-0 border-t border-border/50 bg-background">
      <div className="max-w-5xl mx-auto px-4 pb-4 pt-2">

      {/* Aperçu pièces jointes (multiples) */}
      {hasAttachments && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-xl max-w-xs">
              {previewUrls[i]
                ? <img src={previewUrls[i]} alt={file.name} className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-border" />
                : file.type.startsWith("image/")
                  ? <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0"><Image className="w-4 h-4 text-brand" /></div>
                  : <div className="w-9 h-9 rounded-lg bg-muted-foreground/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground" /></div>
              }
              <div className="min-w-0">
                <div className="text-xs font-medium truncate max-w-[8rem]">{file.name}</div>
                <div className="text-[0.65rem] text-muted-foreground">{formatFileSize(file.size)}</div>
              </div>
              <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ligne : sélecteurs ancrés à gauche (hors flow) + input centré */}
      <div className="relative flex justify-center items-end">

        {/* Sélecteurs — juste à gauche du chat-input-container centré (50% + demi-largeur + gap) */}
        <div className="absolute right-[calc(50%+22rem)] bottom-2">
          <SelectorPills />
        </div>

        {/* Barre de saisie — centrée indépendamment des pills */}
        <div className="chat-input-container w-full max-w-2xl flex items-end gap-2 px-3 py-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileRef} type="file" className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
            multiple
            onChange={e => {
              const added = Array.from(e.target.files ?? []).filter(isAccepted);
              if (added.length) setAttachedFiles(prev => [...prev, ...added]);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Posez votre question…"
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-40 leading-relaxed"
            rows={1}
          />
          <button
            onClick={() => void handleSend()}
            disabled={(!input.trim() && !hasAttachments) || isStreaming}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0 mb-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

      </div>
      </div>
    </div>
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full overflow-hidden relative"
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      >
        {isDragging && <DragOverlay />}
        <div className="flex-1 overflow-y-auto flex items-center justify-center px-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="w-full max-w-2xl text-center"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/15 to-violet-500/10 ring-1 ring-brand/20 mb-5">
              <Sparkles className="w-6 h-6 text-brand" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight mb-1.5">Nouvelle conversation</h2>
            <p className="text-sm text-muted-foreground mb-1">
              Vous discutez avec <span className="text-foreground font-medium">{currentSpeakerName}</span>
            </p>
            <p className="text-xs text-muted-foreground/70">Astuce : utilisez le menu Prompts pour pré-remplir une demande.</p>
          </motion.div>
        </div>
        {isOwnConv ? bottomBar : (
          <div className="shrink-0 border-t border-border/50 bg-muted/20 px-6 py-3 text-xs text-center text-muted-foreground">
            Conversation de <span className="font-medium text-foreground">{activeConv?.user}</span> — lecture seule
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative"
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {isDragging && <DragOverlay />}
      {activeConv && (
        <ConversationHeader
          conv={activeConv}
          onRename={t => renameConversation(activeConv.id, t)}
          speakerName={currentSpeakerName}
          speakerImg={currentAiAvatarUrl}
          user={convOwner}
          userAvatar={ownerAvatar}
          userInitials={userInitials}
        />
      )}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <AnimatePresence>
            {messages.map(m => (
              <MessageBubble key={m.id} message={m}
                renderHighlighted={renderHighlightedText}
                currentUser={activeConv?.user ?? currentUser} currentSpeakerName={currentSpeakerName}
                {...avatarBase}
                aiAvatarUrl={currentAiAvatarUrl} aiIcon={currentAiIcon} aiProvider={currentAiProvider}
              />
            ))}
          </AnimatePresence>
          {streamingContent !== null && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <MessageBubble
                message={{ id: "streaming", role: "assistant", content: streamingContent, timestamp: new Date(), speakerName: currentSpeakerName }}
                renderHighlighted={renderHighlightedText}
                currentUser={activeConv?.user ?? currentUser} currentSpeakerName={currentSpeakerName}
                {...avatarBase}
                aiAvatarUrl={currentAiAvatarUrl} aiIcon={currentAiIcon} aiProvider={currentAiProvider}
              />
            </motion.div>
          )}
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
              <AvatarBubble isUser={false} {...avatarBase} aiAvatarUrl={currentAiAvatarUrl} aiIcon={currentAiIcon} aiProvider={currentAiProvider} />
              <div className="flex items-center gap-2 text-muted-foreground text-sm pt-2">
                <div className="flex gap-1">
                  {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
                <span className="text-xs">{currentSpeakerName} réfléchit…</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {isOwnConv ? bottomBar : (
        <div className="shrink-0 border-t border-border/50 bg-muted/20 px-6 py-3 text-xs text-center text-muted-foreground">
          Conversation de <span className="font-medium text-foreground">{activeConv?.user}</span> — lecture seule
        </div>
      )}
    </div>
  );
}

// ─── DragOverlay ──────────────────────────────────────────────────────────────

function DragOverlay() {
  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div className="absolute inset-3 border-2 border-dashed border-brand/40 rounded-2xl bg-brand/5 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-3">
            <Paperclip className="w-6 h-6 text-brand" />
          </div>
          <p className="text-sm font-medium text-brand">Déposez votre fichier ici</p>
          <p className="text-xs text-muted-foreground mt-1">Images, PDF, texte</p>
        </div>
      </div>
    </div>
  );
}

// ─── ConversationHeader ───────────────────────────────────────────────────────

function ConversationHeader({ conv, onRename, speakerName, speakerImg, user, userAvatar, userInitials }: {
  conv: { id: string; title: string };
  onRename: (t: string) => void;
  speakerName: string; speakerImg?: string | null;
  user: string; userAvatar?: string | null; userInitials: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(conv.title);
  useEffect(() => { setVal(conv.title); }, [conv.title]);
  const commit = () => { const t = val.trim(); if (t && t !== conv.title) onRename(t); else setVal(conv.title); setEditing(false); };

  return (
    <div className="shrink-0 border-b border-border bg-surface/40 px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(conv.title); setEditing(false); } }}
                className="flex-1 bg-transparent border-b border-brand/40 outline-none text-sm font-semibold py-0.5" />
              <button onClick={commit} className="p-1 rounded hover:bg-muted text-brand"><Check className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="group flex items-center gap-2 text-left max-w-full">
              <span className="text-sm font-semibold truncate">{conv.title}</span>
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 text-[0.7rem] text-muted-foreground">
            {speakerImg && <img src={speakerImg} className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-border" alt="" />}
            <span>avec <span className="text-foreground font-medium">{speakerName}</span></span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 text-[0.7rem] text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
          {userAvatar
            ? <img src={userAvatar} className="w-4 h-4 rounded-full object-cover" alt={user} />
            : <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[0.6rem] font-semibold text-primary">{userInitials}</span>
          }
          <span className="font-medium text-foreground">{user}</span>
        </div>
      </div>
    </div>
  );
}

// ─── AvatarBubble ─────────────────────────────────────────────────────────────

interface AvatarBubbleProps {
  isUser: boolean;
  userAvatar?: string | null;
  userInitials: string;
  aiAvatarUrl?: string | null;
  aiIcon?: string | null;
  aiProvider: string;
  providerBg: Record<string, string>;
}

function AvatarBubble({ isUser, userAvatar, userInitials, aiAvatarUrl, aiIcon, aiProvider, providerBg }: AvatarBubbleProps) {
  if (isUser) {
    if (userAvatar) return <img src={userAvatar} className="w-8 h-8 rounded-xl object-cover shrink-0" alt="" />;
    return <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><span className="text-xs font-semibold text-primary">{userInitials || "?"}</span></div>;
  }
  if (aiAvatarUrl) return <img src={aiAvatarUrl} className="w-8 h-8 rounded-xl object-cover shrink-0" alt="" />;
  if (aiIcon) return <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 text-base">{aiIcon}</div>;
  return <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${providerBg[aiProvider] ?? "bg-brand/10"}`}><Bot className="w-4 h-4 text-brand" /></div>;
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  renderHighlighted: (t: string) => React.ReactNode;
  currentUser: string;
  currentSpeakerName: string;
  userAvatar?: string | null;
  userInitials: string;
  aiAvatarUrl?: string | null;
  aiIcon?: string | null;
  aiProvider: string;
  providerBg: Record<string, string>;
}

function MessageBubble({ message, renderHighlighted, currentUser, currentSpeakerName, userAvatar, userInitials, aiAvatarUrl, aiIcon, aiProvider, providerBg }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const displaySpeaker = isUser ? currentUser : (message.speakerName ?? currentSpeakerName);
  // Avatar figé au moment de l'envoi — priorité sur le sélecteur courant
  const effectiveAiAvatarUrl = isUser ? null : (message.speakerAvatarUrl ?? aiAvatarUrl);
  const effectiveAiIcon      = isUser ? null : (message.speakerIcon      ?? aiIcon);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
      <AvatarBubble isUser={isUser} userAvatar={userAvatar} userInitials={userInitials} aiAvatarUrl={effectiveAiAvatarUrl} aiIcon={effectiveAiIcon} aiProvider={aiProvider} providerBg={providerBg} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-foreground">{displaySpeaker}</span>
          <span className="text-[0.6875rem] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {message.files && message.files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.files.map((f, i) =>
              f.type.startsWith("image/") && f.url
                ? <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block w-fit">
                    <img src={f.url} alt={f.name} className="max-w-[200px] max-h-36 rounded-xl object-cover ring-1 ring-border" />
                  </a>
                : <a key={i} href={f.url ?? "#"} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs text-muted-foreground hover:bg-muted/80 transition-colors">
                    <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                    {f.name}
                  </a>
            )}
          </div>
        )}
        {isUser
          ? <div className="text-sm leading-relaxed text-foreground">{renderHighlighted(message.content)}</div>
          : <div className="text-sm leading-relaxed text-foreground"><SimpleMarkdown content={message.content} /></div>
        }
      </div>
    </motion.div>
  );
}

// ─── SimpleMarkdown ───────────────────────────────────────────────────────────

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false, tableRows: string[][] = [], tableIndex = 0;
  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0], body = tableRows.slice(2);
      elements.push(
        <table key={`t-${tableIndex++}`} className="w-full text-sm my-3 border-collapse">
          <thead><tr>{header.map((h,i) => <th key={i} className="text-left py-1.5 px-2 border-b border-border font-medium text-muted-foreground text-xs">{h.trim()}</th>)}</tr></thead>
          <tbody>{body.map((row,ri) => <tr key={ri}>{row.map((cell,ci) => <td key={ci} className="py-1.5 px-2 border-b border-border/50">{cell.trim()}</td>)}</tr>)}</tbody>
        </table>
      );
      tableRows = [];
    }
    inTable = false;
  };
  lines.forEach((line, i) => {
    if (line.includes("|") && line.trim().startsWith("|")) { inTable = true; tableRows.push(line.split("|").filter((_,idx,arr) => idx>0 && idx<arr.length-1)); return; }
    if (inTable) flushTable();
    if (line.startsWith("---")) elements.push(<hr key={i} className="my-4 border-border/50" />);
    else if (line.startsWith("### ")) elements.push(<h3 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="text-base font-semibold mt-5 mb-2">{line.slice(3)}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={i} className="text-lg font-bold mt-5 mb-2">{line.slice(2)}</h1>);
    else if (line.startsWith("- ")) elements.push(<li key={i} className="ml-4 list-disc text-sm">{renderInline(line.slice(2))}</li>);
    else if (/^\d+\.\s/.test(line)) elements.push(<li key={i} className="ml-4 list-decimal text-sm">{renderInline(line.replace(/^\d+\.\s/,""))}</li>);
    else if (line.startsWith("> ")) elements.push(<blockquote key={i} className="border-l-2 border-brand/30 pl-3 py-1 text-sm text-muted-foreground my-2">{renderInline(line.slice(2))}</blockquote>);
    else if (line.trim() === "") elements.push(<div key={i} className="h-2" />);
    else elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
  });
  if (inTable) flushTable();
  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part,i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold">{part.slice(2,-2)}</strong>
      : <span key={i}>{part}</span>
  );
}
