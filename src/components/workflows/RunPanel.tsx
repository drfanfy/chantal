import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Circle,
  MinusCircle,
  Copy,
  Download,
  Clock,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { downloadText, RUN_STATUS_LABEL, type RunRow, type StepRow } from "@/lib/workflowsClient";

const STEP_TYPE_LABEL: Record<string, string> = {
  llm: "IA",
  transform: "Transformation",
  condition: "Condition",
  http: "Appel externe",
};

export function StepIcon({ status }: { status: StepRow["status"] }) {
  if (status === "succeeded")
    return <CheckCircle2 className="w-4 h-4 text-success" aria-label="Terminé" />;
  if (status === "running")
    return <Loader2 className="w-4 h-4 text-brand animate-spin" aria-label="En cours" />;
  if (status === "failed")
    return <AlertCircle className="w-4 h-4 text-destructive" aria-label="Échec" />;
  if (status === "skipped")
    return <MinusCircle className="w-4 h-4 text-muted-foreground/60" aria-label="Ignorée" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" aria-label="En attente" />;
}

/** Progression réelle (étapes persistées par le serveur) et résultat exploitable. */
export function RunPanel({
  title,
  run,
  steps,
  elapsedMs,
  onRetry,
  filename = "resultat",
  showPreviews = false,
}: {
  title: string;
  run: RunRow | null;
  steps: StepRow[];
  elapsedMs: number;
  onRetry?: () => void;
  filename?: string;
  showPreviews?: boolean;
}) {
  const status = run?.status ?? "running";
  const done = run && !["queued", "running"].includes(run.status);
  const ext = run?.output_format === "json" ? "json" : run?.output_format === "text" ? "txt" : "md";
  const mime = ext === "json" ? "application/json" : ext === "md" ? "text/markdown" : "text/plain";

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[0.65rem] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Exécution{run?.is_test ? " de test" : ""}
            </div>
            <h3 className="text-base font-semibold">{title}</h3>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {((run?.duration_ms ?? elapsedMs) / 1000).toFixed(1)} s
              </span>
              {run && run.attempt > 1 && <span>Tentative {run.attempt}</span>}
            </div>
          </div>
          <span
            role="status"
            className={`status-badge flex items-center gap-1.5 ${status === "succeeded" ? "success" : ["failed", "timed_out", "cancelled"].includes(status) ? "error" : "running"}`}
          >
            {!done && <Loader2 className="w-3 h-3 animate-spin" />}
            {RUN_STATUS_LABEL[status]}
          </span>
        </div>
        {steps.length === 0 ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Préparation…
          </div>
        ) : (
          <ol className="space-y-1.5">
            {steps.map((s) => (
              <li
                key={s.step_id}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg ${s.status === "running" ? "bg-brand/5" : s.status === "failed" ? "bg-destructive/5" : ""}`}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                  <StepIcon status={s.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm ${s.status === "pending" || s.status === "skipped" ? "text-muted-foreground" : "text-foreground font-medium"}`}
                  >
                    {s.step_name}
                  </div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    {STEP_TYPE_LABEL[s.step_type] ?? s.step_type}
                    {s.duration_ms != null && ` · ${(s.duration_ms / 1000).toFixed(1)} s`}
                    {s.status === "skipped" && " · ignorée"}
                  </div>
                  {s.error_message && (
                    <div className="text-[0.75rem] text-destructive mt-1">{s.error_message}</div>
                  )}
                  {showPreviews && s.output_preview && (
                    <details className="mt-1">
                      <summary className="text-[0.7rem] text-muted-foreground cursor-pointer">
                        Sortie de l'étape
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[0.7rem]">
                        {s.output_preview}
                      </pre>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {run && ["failed", "timed_out", "cancelled"].includes(run.status) && (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <div className="font-medium text-destructive">L'exécution n'a pas abouti</div>
          <p className="mt-1 text-muted-foreground">{run.error_message ?? "Erreur inconnue."}</p>
          {onRetry && run.attempt < 3 && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Relancer (même version, mêmes données)
            </button>
          )}
        </div>
      )}

      {run?.output != null && run.status === "succeeded" && (
        <div className="workflow-card">
          <div className="flex items-center justify-end gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(run.output ?? "");
                toast.success("Résultat copié");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Copy className="w-3.5 h-3.5" /> Copier
            </button>
            <button
              type="button"
              onClick={() => downloadText(run.output ?? "", `${filename}.${ext}`, mime)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Download className="w-3.5 h-3.5" /> Télécharger .{ext}
            </button>
          </div>
          {run.output_format === "markdown" ? (
            <Markdown content={run.output} />
          ) : (
            <pre className="whitespace-pre-wrap text-sm font-mono">{run.output}</pre>
          )}
        </div>
      )}
    </div>
  );
}
