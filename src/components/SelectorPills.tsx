import { useState, useRef, useEffect } from "react";
import { ChevronDown, Cpu, Users, Sparkles, Check, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { useAIConfig } from "@/lib/useAIConfig";

/**
 * Sélecteurs Partenaire / Modèle / Agent (par identifiant).
 * Les modèles non configurés côté serveur sont visibles mais désactivés,
 * avec la mention « Non configuré » : aucune bascule silencieuse.
 */
export function SelectorPills({ disabled = false }: { disabled?: boolean }) {
  const {
    currentModelId,
    currentAgentId,
    currentPartnerId,
    setCurrentModelId,
    setCurrentAgentId,
    selectPartner,
  } = useApp();
  const { models, agents, partners, loading } = useAIConfig();
  const [open, setOpen] = useState<"partner" | "model" | "agent" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  // Sélection par défaut : premier modèle configuré disponible pour le chat
  useEffect(() => {
    if (loading || currentModelId) return;
    const first = models.find((m) => m.configured && m.availability?.chat !== false);
    if (first) setCurrentModelId(first.id);
  }, [loading, models, currentModelId, setCurrentModelId]);

  const activePartner = partners.find((p) => p.id === currentPartnerId);
  const activeModel = models.find((m) => m.id === currentModelId);
  const activeAgent = agents.find((a) => a.id === currentAgentId);
  const chatModels = models.filter((m) => m.availability?.chat !== false);

  return (
    <div ref={ref} className="flex items-center gap-1 flex-wrap">
      <Pill
        label={activePartner?.name ?? "Partenaire"}
        active={open === "partner"}
        disabled={disabled}
        onClick={() => setOpen((o) => (o === "partner" ? null : "partner"))}
        icon={
          activePartner?.avatar_url ? (
            <img
              src={activePartner.avatar_url}
              className="w-3.5 h-3.5 rounded-full object-cover"
              alt=""
            />
          ) : (
            <Users className="w-3 h-3 text-violet-500" />
          )
        }
      >
        {open === "partner" && (
          <PillDropdown label="Partenaires">
            <PillItem
              selected={!currentPartnerId}
              onClick={() => {
                selectPartner(null);
                setOpen(null);
              }}
              icon={<span className="text-muted-foreground text-xs">—</span>}
              label="Aucun"
            />
            {loading && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>
            )}
            {!loading && partners.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">Aucun partenaire</div>
            )}
            {partners.map((p) => {
              const unusable = !!p.ai_model_id && !p.model?.configured;
              return (
                <PillItem
                  key={p.id}
                  selected={currentPartnerId === p.id}
                  disabled={unusable}
                  hint={unusable ? "Modèle non configuré" : undefined}
                  onClick={() => {
                    selectPartner(p);
                    setOpen(null);
                  }}
                  icon={
                    p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        className="w-4 h-4 rounded-full object-cover"
                        alt=""
                      />
                    ) : (
                      <span className="text-[0.6rem] font-semibold text-violet-600 leading-none">
                        {p.name[0]}
                      </span>
                    )
                  }
                  label={p.name}
                />
              );
            })}
          </PillDropdown>
        )}
      </Pill>

      <Pill
        label={activeModel?.name ?? (loading ? "…" : "Modèle")}
        active={open === "model"}
        disabled={disabled || !!activePartner}
        warn={!!activeModel && !activeModel.configured}
        onClick={() => setOpen((o) => (o === "model" ? null : "model"))}
        icon={<Cpu className="w-3 h-3 text-blue-500" />}
      >
        {open === "model" && (
          <PillDropdown label="Modèles">
            {loading && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>
            )}
            {!loading && chatModels.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                Aucun modèle disponible
              </div>
            )}
            {chatModels.map((m) => (
              <PillItem
                key={m.id}
                selected={currentModelId === m.id}
                disabled={!m.configured}
                hint={m.configured ? undefined : (m.reason ?? "Non configuré")}
                onClick={() => {
                  setCurrentModelId(m.id);
                  setOpen(null);
                }}
                icon={<Cpu className="w-3.5 h-3.5 text-blue-500" />}
                label={m.name}
              />
            ))}
          </PillDropdown>
        )}
      </Pill>

      <Pill
        label={activeAgent?.name ?? "Agent"}
        active={open === "agent"}
        disabled={disabled || !!activePartner}
        onClick={() => setOpen((o) => (o === "agent" ? null : "agent"))}
        icon={
          activeAgent?.icon ? (
            <span className="text-xs leading-none">{activeAgent.icon}</span>
          ) : (
            <Sparkles className="w-3 h-3 text-indigo-500" />
          )
        }
      >
        {open === "agent" && (
          <PillDropdown label="Agents">
            <PillItem
              selected={!currentAgentId}
              onClick={() => {
                setCurrentAgentId(null);
                setOpen(null);
              }}
              icon={<span className="text-muted-foreground text-xs">—</span>}
              label="Aucun (mode libre)"
            />
            {loading && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">Chargement…</div>
            )}
            {agents.map((a) => (
              <PillItem
                key={a.id}
                selected={currentAgentId === a.id}
                onClick={() => {
                  setCurrentAgentId(a.id);
                  setOpen(null);
                }}
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

function Pill({
  label,
  active,
  disabled,
  warn,
  onClick,
  icon,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  warn?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={active}
        aria-haspopup="listbox"
        className={`flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
          active
            ? "bg-brand/10 text-brand"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">{icon}</span>
        <span className="max-w-[10rem] truncate">{label}</span>
        {warn && <AlertCircle className="w-3 h-3 text-amber-600" aria-label="Non configuré" />}
        <ChevronDown
          className={`w-3 h-3 shrink-0 transition-transform ${active ? "rotate-180" : ""}`}
        />
      </button>
      {children}
    </div>
  );
}

function PillDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="absolute bottom-full mb-2 left-0 z-50 min-w-[13rem] max-h-[50vh] overflow-y-auto bg-card border border-border rounded-xl shadow-elevated py-1"
    >
      {children}
    </div>
  );
}

function PillItem({
  selected,
  disabled,
  hint,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  disabled?: boolean;
  hint?: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed ${selected ? "bg-brand/5 font-medium text-foreground" : "text-muted-foreground"}`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 text-left min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-[0.65rem] text-amber-700 truncate">{hint}</span>}
      </span>
      {selected && <Check className="w-2.5 h-2.5 text-brand ml-auto shrink-0" />}
    </button>
  );
}
