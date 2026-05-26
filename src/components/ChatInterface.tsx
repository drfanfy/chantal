import { useState, useRef, useEffect } from "react";
import { useApp, type Message } from "@/lib/appContext";
import { fakeResponses, partners } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { Send, Paperclip, X, FileText, Bot, User, Pencil, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ChatInterface() {
  const {
    currentModel, currentAgent, currentPartner,
    addMessage, conversations, activeConversationId,
    pendingPrefill, consumePrefill,
    renameConversation, currentUser,
  } = useApp();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find(c => c.id === activeConversationId);
  const messages = activeConv?.messages ?? [];
  const hasMessages = messages.length > 0 || isTyping;
  const partner = partners.find(p => p.id === (activeConv?.partnerId ?? currentPartner));

  useEffect(() => {
    if (pendingPrefill) {
      const t = consumePrefill();
      if (t) {
        setInput(t);
        // focus + place cursor at end
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrefill]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() && !attachedFile) return;
    const content = input.trim();
    addMessage({ role: "user", content, file: attachedFile ? { name: attachedFile, type: "application/pdf" } : undefined });
    setInput("");
    setIsTyping(true);
    const responseKey = attachedFile ? "document" : currentAgent.includes("commerciale") ? "commercial" : "default";
    setAttachedFile(null);
    setTimeout(() => {
      addMessage({ role: "assistant", content: fakeResponses[responseKey] });
      setIsTyping(false);
    }, 1200 + Math.random() * 800);
  };

  const handleFileChange = () => setAttachedFile("Rapport_Q1_2025.pdf");

  const renderHighlightedText = (text: string) => {
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) =>
      part.startsWith("[") && part.endsWith("]") ? (
        <span key={i} className="highlight-var">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const InputBar = ({ centered = false }: { centered?: boolean }) => (
    <div className={centered ? "w-full max-w-2xl" : "max-w-3xl mx-auto"}>
      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-lg text-sm">
          <FileText className="w-4 h-4 text-brand" />
          <span className="flex-1 truncate">{attachedFile}</span>
          <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="chat-input-container flex items-end gap-2 px-4 py-3">
        <button onClick={() => fileRef.current?.click()} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5">
          <Paperclip className="w-4 h-4" />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.txt,.doc,.docx" />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Posez votre question à Chantal…"
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-40 leading-relaxed"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() && !attachedFile}
          className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0 mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // Empty chat: clean centered workspace (NO homepage content)
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-2xl text-center"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/15 to-violet-500/10 ring-1 ring-brand/20 mb-5">
              <Sparkles className="w-6 h-6 text-brand" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight mb-1.5">Nouvelle conversation</h2>
            <p className="text-sm text-muted-foreground mb-1">
              {partner ? (
                <>Vous travaillez avec <span className="text-foreground font-medium">{partner.name}</span> · <span className="text-foreground/80">{currentAgent}</span></>
              ) : (
                <>Modèle <span className="text-foreground font-medium">{currentModel}</span> · agent <span className="text-foreground/80">{currentAgent}</span></>
              )}
            </p>
            <p className="text-xs text-muted-foreground/70">Astuce : utilisez le menu Prompts pour pré-remplir une demande.</p>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="shrink-0 px-6 pb-5 pt-3 border-t border-border/50 bg-background"
        >
          <InputBar />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {activeConv && (
        <ConversationHeader
          conv={activeConv}
          onRename={(t) => renameConversation(activeConv.id, t)}
          partnerName={partner?.name}
          partnerImg={partner ? partnerImages[partner.id] : undefined}
          agent={activeConv.agent}
          model={activeConv.model}
          user={currentUser}
        />
      )}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <AnimatePresence>
            {messages.map(m => (
              <MessageBubble key={m.id} message={m} renderHighlighted={renderHighlightedText} model={activeConv?.model || currentModel} userName={currentUser} />
            ))}
          </AnimatePresence>
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-brand" />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm pt-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs">{currentModel} réfléchit...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="px-6 pb-5 pt-2 border-t border-border/50 bg-background">
        <InputBar />
      </div>
    </div>
  );
}

function ConversationHeader({
  conv, onRename, partnerName, partnerImg, agent, model, user,
}: {
  conv: { id: string; title: string };
  onRename: (t: string) => void;
  partnerName?: string;
  partnerImg?: string;
  agent: string;
  model: string;
  user: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(conv.title);

  useEffect(() => { setVal(conv.title); }, [conv.title]);

  const commit = () => {
    const t = val.trim();
    if (t && t !== conv.title) onRename(t);
    else setVal(conv.title);
    setEditing(false);
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface/40 px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(conv.title); setEditing(false); } }}
                className="flex-1 bg-transparent border-b border-brand/40 outline-none text-sm font-semibold py-0.5"
              />
              <button onClick={commit} className="p-1 rounded hover:bg-muted text-brand"><Check className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="group flex items-center gap-2 text-left max-w-full">
              <span className="text-sm font-semibold truncate">{conv.title}</span>
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 text-[0.7rem] text-muted-foreground">
            {partnerImg && (
              <img src={partnerImg} alt={partnerName} className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-border" />
            )}
            <span>
              Vous travaillez avec{" "}
              <span className="text-foreground font-medium">{partnerName ?? model}</span>
              {" "}—{" "}
              <span className="text-foreground/80">{agent}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
            <User className="w-3 h-3" />
            <span className="font-medium text-foreground">{user}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, renderHighlighted, model, userName }: { message: Message; renderHighlighted: (t: string) => React.ReactNode; model: string; userName: string }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-primary/10" : "bg-brand/10"}`}>
        {isUser ? <User className="w-4 h-4 text-primary" /> : <Bot className="w-4 h-4 text-brand" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-foreground">{isUser ? userName : model}</span>
          <span className="text-[0.6875rem] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {message.file && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-lg text-xs text-muted-foreground w-fit">
            <FileText className="w-3.5 h-3.5 text-brand" />
            {message.file.name}
          </div>
        )}
        {isUser ? (
          <div className="text-sm leading-relaxed text-foreground">{renderHighlighted(message.content)}</div>
        ) : (
          <div className="text-sm leading-relaxed text-foreground">
            <SimpleMarkdown content={message.content} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableIndex = 0;

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      const body = tableRows.slice(2);
      elements.push(
        <table key={`table-${tableIndex++}`} className="w-full text-sm my-3 border-collapse">
          <thead>
            <tr>{header.map((h, i) => <th key={i} className="text-left py-1.5 px-2 border-b border-border font-medium text-muted-foreground text-xs">{h.trim()}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="py-1.5 px-2 border-b border-border/50">{cell.trim()}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      tableRows = [];
    }
    inTable = false;
  };

  lines.forEach((line, i) => {
    if (line.includes("|") && line.trim().startsWith("|")) {
      inTable = true;
      const cells = line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      return;
    }
    if (inTable) flushTable();

    if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-4 border-border/50" />);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-base font-semibold mt-5 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-lg font-bold mt-5 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={i} className="ml-4 list-disc text-sm">{renderInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i} className="ml-4 list-decimal text-sm">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>);
    } else if (line.startsWith("> ")) {
      elements.push(<blockquote key={i} className="border-l-2 border-brand/30 pl-3 py-1 text-sm text-muted-foreground my-2">{renderInline(line.slice(2))}</blockquote>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    }
  });
  if (inTable) flushTable();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
