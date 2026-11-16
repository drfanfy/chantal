import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderPrompt, recordPromptUsage, type PublishedPrompt } from "@/lib/prompts";

/** Saisie des variables d'un prompt, aperçu, puis envoi dans le chat. */
export function PromptUseDialog({
  prompt,
  onClose,
  onUse,
}: {
  prompt: PublishedPrompt | null;
  onClose: () => void;
  onUse: (text: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (prompt)
      setValues(Object.fromEntries(prompt.variables.map((v) => [v.name, v.default ?? ""])));
  }, [prompt]);
  const missing = useMemo(
    () => (prompt?.variables ?? []).filter((v) => v.required !== false && !values[v.name]?.trim()),
    [prompt, values],
  );
  const preview = prompt
    ? renderPrompt(
        prompt,
        Object.fromEntries(
          Object.entries(values).map(([k, v]) => [
            k,
            v.trim() || `[${prompt.variables.find((x) => x.name === k)?.label ?? k}]`,
          ]),
        ),
      )
    : "";

  async function use() {
    if (!prompt || missing.length) return;
    void recordPromptUsage(prompt.versionId);
    onUse(renderPrompt(prompt, values));
  }

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {prompt && (
          <>
            <DialogHeader>
              <DialogTitle>{prompt.title}</DialogTitle>
              <DialogDescription>
                {prompt.description}
                {prompt.isDemo && (
                  <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-amber-700">
                    Exemple
                  </span>
                )}
                <span className="ml-2 text-[0.65rem] text-muted-foreground">v{prompt.version}</span>
              </DialogDescription>
            </DialogHeader>
            {prompt.instructions && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {prompt.instructions}
              </p>
            )}
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void use();
              }}
            >
              {prompt.variables.map((v) => (
                <div key={v.name}>
                  <label htmlFor={`var-${v.name}`} className="mb-1 block text-xs font-medium">
                    {v.label}
                    {v.required !== false && <span className="text-destructive"> *</span>}
                  </label>
                  <input
                    id={`var-${v.name}`}
                    value={values[v.name] ?? ""}
                    onChange={(e) => setValues((s) => ({ ...s, [v.name]: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                  />
                  {v.description && (
                    <p className="mt-1 text-[0.7rem] text-muted-foreground">{v.description}</p>
                  )}
                </div>
              ))}
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Aperçu</div>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs font-sans">
                  {preview}
                </pre>
              </div>
              {prompt.examples.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Exemples ({prompt.examples.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {prompt.examples.map((ex, i) => (
                      <div key={i} className="rounded-md border border-border p-2">
                        {ex.title && <div className="font-medium">{ex.title}</div>}
                        {ex.input && (
                          <div className="text-muted-foreground whitespace-pre-wrap">
                            Entrée : {ex.input}
                          </div>
                        )}
                        {ex.output && (
                          <div className="text-muted-foreground whitespace-pre-wrap">
                            Résultat attendu : {ex.output}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <DialogFooter>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={missing.length > 0}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Utiliser dans le chat
                </button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
