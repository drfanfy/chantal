import { useState, useEffect, useRef, useMemo } from "react";
import { useApp } from "@/lib/appContext";
import { workflows, workflowResults, workflowTags } from "@/lib/data";
import { motion, AnimatePresence } from "framer-motion";
import { Play, CheckCircle2, AlertCircle, Loader2, FileInput, Database, Brain, ShieldCheck, FileOutput, ArrowRight, Clock, Circle, Search, Zap } from "lucide-react";

type Status = "idle" | "running" | "success" | "error";

interface WorkflowNode {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const workflowNodes: WorkflowNode[] = [
  { id: "input", label: "Formulaire reçu", icon: <FileInput className="w-5 h-5" />, description: "Paramètres validés" },
  { id: "process", label: "Préparation des données", icon: <Database className="w-5 h-5" />, description: "Structuration et nettoyage" },
  { id: "ai", label: "Analyse IA", icon: <Brain className="w-5 h-5" />, description: "Modèle Claude 3.5 Sonnet" },
  { id: "validate", label: "Structuration", icon: <ShieldCheck className="w-5 h-5" />, description: "Contrôle qualité" },
  { id: "output", label: "Génération finale", icon: <FileOutput className="w-5 h-5" />, description: "Rapport structuré" },
];

export function WorkflowView() {
  const { activeWorkflow, setActiveWorkflow } = useApp();
  const wf = workflows.find(w => w.id === activeWorkflow);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [execTime, setExecTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [result, setResult] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  if (!wf) return <WorkflowPicker onPick={(id) => setActiveWorkflow(id)} />;

  const handleRun = () => {
    setStatus("running");
    setResult("");
    setActiveStep(0);
    const start = new Date();
    setStartedAt(start);
    setElapsed(0);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - start.getTime()) / 100) / 10);
    }, 100);
    const time = 1.5 + Math.random() * 2;
    setExecTime(Number(time.toFixed(1)));

    const stepDelay = (time * 1000) / workflowNodes.length;
    workflowNodes.forEach((_, i) => {
      setTimeout(() => setActiveStep(i), stepDelay * (i + 0.5));
    });

    setTimeout(() => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (Math.random() < 0.08) {
        setStatus("error");
        setResult("Erreur : impossible de contacter le modèle. Veuillez réessayer.");
      } else {
        setStatus("success");
        setResult(workflowResults[wf.id] || workflowResults["veille-seo"]);
        setActiveStep(workflowNodes.length);
      }
    }, time * 1000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Diagram */}
      <WorkflowDiagram status={status} activeStep={activeStep} />

      {/* Form + Results */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Form */}
        <div className="w-[380px] shrink-0 border-r border-border p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold tracking-tight mb-1">{wf.name}</h2>
          <p className="text-sm text-muted-foreground mb-6">Renseignez les paramètres pour lancer le workflow.</p>

          <div className="space-y-4">
            {wf.fields.map(field => (
              <div key={field}>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field}</label>
                {field.toLowerCase().includes("données") || field.toLowerCase().includes("complémentaires") ? (
                  <textarea
                    value={formValues[field] || ""}
                    onChange={e => setFormValues(v => ({ ...v, [field]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all resize-none"
                    rows={3}
                    placeholder={`Entrez ${field.toLowerCase()}...`}
                  />
                ) : (
                  <input
                    type="text"
                    value={formValues[field] || ""}
                    onChange={e => setFormValues(v => ({ ...v, [field]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-surface text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
                    placeholder={`Entrez ${field.toLowerCase()}...`}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleRun}
            disabled={status === "running"}
            className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === "running" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Exécution...</>
            ) : (
              <><Play className="w-4 h-4" /> Lancer le workflow</>
            )}
          </button>
        </div>

        {/* Right: Run View + Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {status === "idle" ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Configurez et lancez le workflow pour voir la progression et les résultats.
            </div>
          ) : (
            <div className="max-w-3xl space-y-6">
              {/* Run header */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-soft">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[0.65rem] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Exécution en cours</div>
                    <h3 className="text-base font-semibold">{wf.name}</h3>
                    {startedAt && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span>Démarré à {startedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{(status === "running" ? elapsed : execTime).toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                  {status === "running" && <span className="status-badge running flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> En cours</span>}
                  {status === "success" && <span className="status-badge success flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Terminé</span>}
                  {status === "error" && <span className="status-badge error flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Erreur</span>}
                </div>

                {/* Step list */}
                <ol className="space-y-1.5">
                  {workflowNodes.map((n, i) => {
                    const stepStatus: "pending" | "running" | "success" | "error" =
                      status === "error" && i === activeStep ? "error" :
                      activeStep > i || (status === "success" && activeStep >= workflowNodes.length) ? "success" :
                      activeStep === i && status === "running" ? "running" : "pending";
                    return (
                      <li key={n.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        stepStatus === "running" ? "bg-brand/8" : stepStatus === "success" ? "bg-success/5" : stepStatus === "error" ? "bg-destructive/5" : ""
                      }`}>
                        <div className="w-5 h-5 flex items-center justify-center shrink-0">
                          {stepStatus === "success" && <CheckCircle2 className="w-4 h-4 text-success" />}
                          {stepStatus === "running" && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
                          {stepStatus === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                          {stepStatus === "pending" && <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${stepStatus === "pending" ? "text-muted-foreground" : "text-foreground font-medium"}`}>{n.label}</div>
                          <div className="text-[0.7rem] text-muted-foreground">{n.description}</div>
                        </div>
                        <span className="text-[0.7rem] text-muted-foreground capitalize">
                          {stepStatus === "running" ? "en cours…" : stepStatus === "success" ? "terminé" : stepStatus === "error" ? "erreur" : "en attente"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Results */}
              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="workflow-card">
                    <ResultMarkdown content={result} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkflowDiagram({ status, activeStep }: { status: Status; activeStep: number }) {
  return (
    <div className="border-b border-border bg-surface/50 px-6 py-5">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          {workflowNodes.map((node, i) => (
            <div key={node.id} className="flex items-center flex-1">
              <motion.div
                className={`
                  relative flex flex-col items-center flex-1
                `}
                animate={{
                  scale: activeStep === i ? 1.05 : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500
                    ${activeStep > i || status === "success"
                      ? "bg-success/15 text-success shadow-sm"
                      : activeStep === i
                        ? "bg-brand/15 text-brand shadow-md ring-2 ring-brand/20"
                        : "bg-muted text-muted-foreground"
                    }
                  `}
                >
                  {activeStep > i || (status === "success" && activeStep >= workflowNodes.length) ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : activeStep === i ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    node.icon
                  )}
                </div>
                <span className={`text-[0.6875rem] font-medium mt-2 text-center transition-colors duration-300 ${
                  activeStep >= i ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {node.label}
                </span>
                <span className="text-[0.625rem] text-muted-foreground text-center mt-0.5 hidden sm:block">
                  {node.description}
                </span>
              </motion.div>
              {i < workflowNodes.length - 1 && (
                <div className="flex items-center px-2 -mt-6">
                  <div className={`h-0.5 w-8 transition-all duration-500 rounded-full ${
                    activeStep > i ? "bg-success" : activeStep === i ? "bg-brand/40" : "bg-border"
                  }`} />
                  <ArrowRight className={`w-3.5 h-3.5 -ml-1 transition-colors duration-500 ${
                    activeStep > i ? "text-success" : "text-border"
                  }`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultMarkdown({ content }: { content: string }) {
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
        <table key={`t-${tableIndex++}`} className="w-full text-sm my-3 border-collapse">
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
      tableRows.push(line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1));
      return;
    }
    if (inTable) flushTable();

    if (line.startsWith("### ")) elements.push(<h3 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="text-base font-semibold mt-5 mb-2">{line.slice(3)}</h2>);
    else if (line.startsWith("- ")) elements.push(<li key={i} className="ml-4 list-disc text-sm">{renderInlineBold(line.slice(2))}</li>);
    else if (/^\d+\.\s/.test(line)) elements.push(<li key={i} className="ml-4 list-decimal text-sm">{renderInlineBold(line.replace(/^\d+\.\s/, ""))}</li>);
    else if (line.trim() === "") elements.push(<div key={i} className="h-2" />);
    else elements.push(<p key={i} className="text-sm leading-relaxed">{renderInlineBold(line)}</p>);
  });
  if (inTable) flushTable();

  return <>{elements}</>;
}

function renderInlineBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

function WorkflowPicker({ onPick }: { onPick: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("Tous");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter(w => {
      if (activeTag !== "Tous" && !(w.tags ?? []).includes(activeTag) && w.category !== activeTag) return false;
      if (q && !w.name.toLowerCase().includes(q) && !(w.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, activeTag]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-blue-500/[0.02]">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-medium mb-3">
            <Zap className="w-3 h-3" /> Automatisations
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Workflows</h1>
          <p className="text-sm text-muted-foreground">Lancez un workflow structuré pour produire un livrable en quelques minutes.</p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-xl max-w-xl shadow-soft mb-4">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un workflow…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {search && <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">Effacer</button>}
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          {["Tous", ...workflowTags].map(t => (
            <button
              key={t}
              onClick={() => setActiveTag(t)}
              className={`px-3 py-1 rounded-full text-[0.75rem] font-medium border transition-all ${
                activeTag === t
                  ? "bg-brand/10 border-brand/40 text-brand"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-16">Aucun workflow trouvé.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(w => (
              <button
                key={w.id}
                onClick={() => onPick(w.id)}
                className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-600">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    {w.tag === "populaire" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">🔥 Populaire</span>}
                    {w.tag === "nouveau" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">✨ Nouveau</span>}
                  </div>
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground mb-1">{w.category}</div>
                <h3 className="text-sm font-semibold mb-1.5">{w.name}</h3>
                {w.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{w.description}</p>}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {(w.tags ?? []).slice(0, 3).map(t => (
                    <span key={t} className="text-[0.6rem] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-[0.7rem] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />~{w.duration ?? 3} min</span>
                  <span className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                    Lancer <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
