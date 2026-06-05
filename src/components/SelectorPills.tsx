import { useState, useRef, useEffect } from "react";
import { useApp } from "@/lib/appContext";
import { useAIConfig } from "@/lib/useAIConfig";
import { ChevronDown, Cpu, Users, Sparkles, Check } from "lucide-react";

export function SelectorPills() {
  const { currentModel, currentAgent, currentPartner, setCurrentModel, setCurrentAgent, setCurrentPartner } = useApp();
  const { models, agents, partners, loading } = useAIConfig();
  const [open, setOpen] = useState<"partner" | "model" | "agent" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activePartner = partners.find(p => p.id === currentPartner);
  const activeAgentIcon = agents.find(a => a.name === currentAgent)?.icon ?? null;

  return (
    <div ref={ref} className="flex items-center gap-1">
      {/* Partenaire */}
      <Pill
        label={activePartner?.name ?? "Partenaire"}
        active={open === "partner"}
        onClick={() => setOpen(o => o === "partner" ? null : "partner")}
        icon={
          activePartner?.avatar_url
            ? <img src={activePartner.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" alt="" />
            : <Users className="w-3 h-3 text-violet-500" />
        }
      >
        {open === "partner" && (
          <PillDropdown>
            <PillItem selected={!currentPartner}
              onClick={() => { setCurrentPartner(null); setOpen(null); }}
              icon={<span className="text-muted-foreground text-xs">—</span>}
              label="Aucun" />
            {loading && <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>}
            {partners.map(p => (
              <PillItem key={p.id} selected={currentPartner === p.id}
                onClick={() => {
                  if (p.model) setCurrentModel(p.model.name);
                  if (p.agent) setCurrentAgent(p.agent.name);
                  setCurrentPartner(p.id);
                  setOpen(null);
                }}
                icon={
                  p.avatar_url
                    ? <img src={p.avatar_url} className="w-4 h-4 rounded-full object-cover" alt="" />
                    : <span className="text-[0.6rem] font-semibold text-violet-600 leading-none">{p.name[0]}</span>
                }
                label={p.name}
              />
            ))}
          </PillDropdown>
        )}
      </Pill>

      {/* Modèle */}
      <Pill
        label={currentModel}
        active={open === "model"}
        onClick={() => setOpen(o => o === "model" ? null : "model")}
        icon={<Cpu className="w-3 h-3 text-blue-500" />}
      >
        {open === "model" && (
          <PillDropdown>
            {loading && <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>}
            {!loading && models.length === 0 && <div className="px-3 py-1.5 text-xs text-muted-foreground">Aucun modèle</div>}
            {models.map(m => (
              <PillItem key={m.id} selected={currentModel === m.name}
                onClick={() => { setCurrentModel(m.name); setOpen(null); }}
                icon={<Cpu className="w-3.5 h-3.5 text-blue-500" />}
                label={m.name}
              />
            ))}
          </PillDropdown>
        )}
      </Pill>

      {/* Agent */}
      <Pill
        label={currentAgent}
        active={open === "agent"}
        onClick={() => setOpen(o => o === "agent" ? null : "agent")}
        icon={
          activeAgentIcon
            ? <span className="text-xs leading-none">{activeAgentIcon}</span>
            : <Sparkles className="w-3 h-3 text-indigo-500" />
        }
      >
        {open === "agent" && (
          <PillDropdown>
            {loading && <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>}
            {!loading && agents.length === 0 && <div className="px-3 py-1.5 text-xs text-muted-foreground">Aucun agent</div>}
            {agents.map(a => (
              <PillItem key={a.id} selected={currentAgent === a.name}
                onClick={() => { setCurrentAgent(a.name); setOpen(null); }}
                icon={<span className="text-sm leading-none">{a.icon ?? "✨"}</span>}
                label={a.name}
              />
            ))}
          </PillDropdown>
        )}
      </Pill>
    </div>
  );
}

function Pill({ label, active, onClick, icon, children }: {
  label: string; active: boolean; onClick: () => void;
  icon: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          active
            ? "bg-brand/10 text-brand"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">{icon}</span>
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${active ? "rotate-180" : ""}`} />
      </button>
      {children}
    </div>
  );
}

function PillDropdown({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 min-w-[11rem] bg-card border border-border rounded-xl shadow-elevated py-1">
      {children}
    </div>
  );
}

function PillItem({ selected, onClick, icon, label }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 ${
        selected ? "bg-brand/5 font-medium text-foreground" : "text-muted-foreground"
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
      <span className="truncate flex-1 text-left">{label}</span>
      {selected && <Check className="w-2.5 h-2.5 text-brand ml-auto shrink-0" />}
    </button>
  );
}
