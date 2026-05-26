import { useState, useRef, useEffect } from "react";
import { useApp } from "@/lib/appContext";
import { models, agents, partners } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { ChevronDown, Cpu, Sparkles, Users, Check } from "lucide-react";

export function ModelAgentSelector({ compact = false }: { compact?: boolean }) {
  const { currentModel, currentAgent, currentPartner, setCurrentModel, setCurrentAgent, setCurrentPartner } = useApp();
  const [open, setOpen] = useState<"partner" | "model" | "agent" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activePartner = partners.find(p => p.id === currentPartner);

  if (compact) {
    return (
      <div ref={ref} className="flex items-center justify-end gap-1.5 flex-wrap">
        <CompactPill
          label={activePartner?.name ?? "Aucun partenaire"}
          icon={activePartner ? (
            <img src={partnerImages[activePartner.id]} alt={activePartner.name} className="w-4 h-4 rounded-full object-cover" />
          ) : <Users className="w-3 h-3 text-violet-600" />}
          accent="violet"
          active={open === "partner"}
          onClick={() => setOpen(o => (o === "partner" ? null : "partner"))}
        >
          {open === "partner" && (
            <Dropdown align="right">
              <DropdownItem
                selected={!currentPartner}
                onClick={() => { setCurrentPartner(null); setOpen(null); }}
                icon={<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">—</div>}
                title="Aucun partenaire" sub="Mode libre"
              />
              {partners.map(p => (
                <DropdownItem
                  key={p.id} selected={currentPartner === p.id}
                  onClick={() => { setCurrentModel(p.model); setCurrentAgent(p.agent); setCurrentPartner(p.id); setOpen(null); }}
                  icon={<div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-border"><img src={partnerImages[p.id]} alt={p.name} className="w-full h-full object-cover" /></div>}
                  title={p.name} sub={p.expertise}
                />
              ))}
            </Dropdown>
          )}
        </CompactPill>
        <CompactPill
          label={currentModel}
          icon={<Cpu className="w-3 h-3 text-blue-600" />}
          accent="blue"
          active={open === "model"}
          onClick={() => setOpen(o => (o === "model" ? null : "model"))}
        >
          {open === "model" && (
            <Dropdown align="right">
              {models.map(m => (
                <DropdownItem key={m.id} selected={currentModel === m.name}
                  onClick={() => { setCurrentModel(m.name); setOpen(null); }}
                  icon={<div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><Cpu className="w-4 h-4 text-blue-600" /></div>}
                  title={m.name} sub={m.desc}
                />
              ))}
            </Dropdown>
          )}
        </CompactPill>
        <CompactPill
          label={currentAgent}
          icon={<Sparkles className="w-3 h-3 text-indigo-600" />}
          accent="indigo"
          active={open === "agent"}
          onClick={() => setOpen(o => (o === "agent" ? null : "agent"))}
        >
          {open === "agent" && (
            <Dropdown align="right">
              {agents.map(a => (
                <DropdownItem key={a.id} selected={currentAgent === a.name}
                  onClick={() => { setCurrentAgent(a.name); setOpen(null); }}
                  icon={<div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><Sparkles className="w-4 h-4 text-indigo-600" /></div>}
                  title={a.name} sub={a.desc}
                />
              ))}
            </Dropdown>
          )}
        </CompactPill>
      </div>
    );
  }

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Partner */}
      <SelectorCard
        label="Partenaire"
        value={activePartner?.name ?? "Aucun"}
        icon={
          activePartner ? (
            <img src={partnerImages[activePartner.id]} alt={activePartner.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <Users className="w-5 h-5 text-violet-600" />
          )
        }
        accent="violet"
        active={open === "partner"}
        selected={!!activePartner}
        onClick={() => setOpen(o => (o === "partner" ? null : "partner"))}
      >
        {open === "partner" && (
          <Dropdown>
            <DropdownItem
              selected={!currentPartner}
              onClick={() => { setCurrentPartner(null); setOpen(null); }}
              icon={<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">—</div>}
              title="Aucun partenaire"
              sub="Mode libre"
            />
            {partners.map(p => (
              <DropdownItem
                key={p.id}
                selected={currentPartner === p.id}
                onClick={() => {
                  setCurrentModel(p.model);
                  setCurrentAgent(p.agent);
                  setCurrentPartner(p.id);
                  setOpen(null);
                }}
                icon={
                  <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-border">
                    <img src={partnerImages[p.id]} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                }
                title={p.name}
                sub={p.expertise}
              />
            ))}
          </Dropdown>
        )}
      </SelectorCard>

      {/* Model */}
      <SelectorCard
        label="Modèle"
        value={currentModel}
        icon={<Cpu className="w-5 h-5 text-blue-600" />}
        accent="blue"
        active={open === "model"}
        selected
        onClick={() => setOpen(o => (o === "model" ? null : "model"))}
      >
        {open === "model" && (
          <Dropdown>
            {models.map(m => (
              <DropdownItem
                key={m.id}
                selected={currentModel === m.name}
                onClick={() => { setCurrentModel(m.name); setOpen(null); }}
                icon={<div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><Cpu className="w-4 h-4 text-blue-600" /></div>}
                title={m.name}
                sub={m.desc}
              />
            ))}
          </Dropdown>
        )}
      </SelectorCard>

      {/* Agent */}
      <SelectorCard
        label="Agent"
        value={currentAgent}
        icon={<Sparkles className="w-5 h-5 text-indigo-600" />}
        accent="indigo"
        active={open === "agent"}
        selected
        onClick={() => setOpen(o => (o === "agent" ? null : "agent"))}
      >
        {open === "agent" && (
          <Dropdown>
            {agents.map(a => (
              <DropdownItem
                key={a.id}
                selected={currentAgent === a.name}
                onClick={() => { setCurrentAgent(a.name); setOpen(null); }}
                icon={<div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><Sparkles className="w-4 h-4 text-indigo-600" /></div>}
                title={a.name}
                sub={a.desc}
              />
            ))}
          </Dropdown>
        )}
      </SelectorCard>
    </div>
  );
}

const accents: Record<string, { ring: string; glow: string; iconBg: string }> = {
  violet: {
    ring: "border-violet-500/40 ring-violet-500/15",
    glow: "shadow-[0_0_0_4px_oklch(0.55_0.18_290_/_0.08)]",
    iconBg: "from-violet-500/15 to-violet-500/5 ring-violet-500/25",
  },
  blue: {
    ring: "border-blue-500/40 ring-blue-500/15",
    glow: "shadow-[0_0_0_4px_oklch(0.6_0.18_240_/_0.08)]",
    iconBg: "from-blue-500/15 to-blue-500/5 ring-blue-500/25",
  },
  indigo: {
    ring: "border-indigo-500/40 ring-indigo-500/15",
    glow: "shadow-[0_0_0_4px_oklch(0.55_0.18_265_/_0.08)]",
    iconBg: "from-indigo-500/15 to-indigo-500/5 ring-indigo-500/25",
  },
};

function SelectorCard({
  label, value, icon, accent, active, selected, onClick, children,
}: {
  label: string; value: string; icon: React.ReactNode; accent: "violet" | "blue" | "indigo";
  active: boolean; selected: boolean; onClick: () => void; children?: React.ReactNode;
}) {
  const a = accents[accent];
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border bg-card transition-all
          ${active || selected ? `${a.ring} ${active ? a.glow : ""}` : "border-border hover:border-foreground/15"}
          hover:shadow-soft`}
      >
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${a.iconBg} ring-1 flex items-center justify-center overflow-hidden shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold text-foreground truncate">{value}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${active ? "rotate-180" : ""}`} />
      </button>
      {children}
    </div>
  );
}

function Dropdown({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div className={`dropdown-panel absolute top-full mt-2 z-50 max-h-80 overflow-y-auto min-w-[16rem] ${align === "right" ? "right-0" : "left-0 right-0"}`}>
      {children}
    </div>
  );
}

function CompactPill({
  label, icon, accent, active, onClick, children,
}: {
  label: string; icon: React.ReactNode; accent: "violet" | "blue" | "indigo";
  active: boolean; onClick: () => void; children?: React.ReactNode;
}) {
  const ring: Record<string, string> = {
    violet: "hover:border-violet-500/40",
    blue: "hover:border-blue-500/40",
    indigo: "hover:border-indigo-500/40",
  };
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border bg-card text-[0.75rem] font-medium transition-all
          ${active ? "border-brand/40 ring-2 ring-brand/10" : `border-border ${ring[accent]}`}`}
      >
        <span className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center overflow-hidden">{icon}</span>
        <span className="truncate max-w-[10rem]">{label}</span>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${active ? "rotate-180" : ""}`} />
      </button>
      {children}
    </div>
  );
}

function DropdownItem({ icon, title, sub, selected, onClick }: {
  icon: React.ReactNode; title: string; sub: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors ${selected ? "bg-brand/5" : ""}`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      {selected && <Check className="w-4 h-4 text-brand shrink-0" />}
    </button>
  );
}
