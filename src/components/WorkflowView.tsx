/**
 * Workflows (utilisateurs) : catalogue des workflows publiés autorisés, page
 * de lancement (résultat attendu, données nécessaires, formulaire), suivi réel
 * et historique personnel des exécutions.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Heart,
  History,
  Play,
  Search,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { useFavorites } from "@/lib/favorites";
import { hasPermission } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { validateInputs } from "@/lib/workflows/schema";
import {
  fetchCatalog,
  fetchSteps,
  RUN_SELECT,
  RUN_STATUS_LABEL,
  type CatalogWorkflow,
  type RunRow,
} from "@/lib/workflowsClient";
import { useRunTracker } from "@/lib/useRunTracker";
import { WorkflowForm } from "@/components/workflows/WorkflowForm";
import { RunPanel } from "@/components/workflows/RunPanel";

export function WorkflowView() {
  const { activeWorkflow, setActiveWorkflow } = useApp();
  const [catalog, setCatalog] = useState<CatalogWorkflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setError("Catalogue indisponible"));
  }, []);

  const wf = catalog?.find((w) => w.id === activeWorkflow);
  if (activeWorkflow && catalog && !wf) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-sm text-muted-foreground">
          Ce workflow n'est plus disponible (archivé, dépublié ou non autorisé pour votre rôle).
        </p>
        <button
          type="button"
          onClick={() => setActiveWorkflow(null)}
          className="text-sm text-brand hover:underline"
        >
          Retour au catalogue
        </button>
      </div>
    );
  }
  if (wf) return <WorkflowRunner key={wf.id} wf={wf} onBack={() => setActiveWorkflow(null)} />;
  return <WorkflowCatalog catalog={catalog} error={error} onPick={(id) => setActiveWorkflow(id)} />;
}

function WorkflowCatalog({
  catalog,
  error,
  onPick,
}: {
  catalog: CatalogWorkflow[] | null;
  error: string | null;
  onPick: (id: string) => void;
}) {
  const { isFavorite, toggle } = useFavorites();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [onlyFav, setOnlyFav] = useState(false);
  const categories = useMemo(
    () => ["Tous", ...new Set((catalog ?? []).map((w) => w.category))],
    [catalog],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? []).filter((w) => {
      if (category !== "Tous" && w.category !== category) return false;
      if (onlyFav && !isFavorite("workflow", w.id)) return false;
      if (q && ![w.name, w.description, ...w.tags].some((s) => s.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [catalog, search, category, onlyFav, isFavorite]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-blue-500/[0.02]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-medium mb-3">
              <Zap className="w-3 h-3" /> Automatisations
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Workflows</h1>
            <p className="text-sm text-muted-foreground">
              Remplissez un formulaire, CHANTAL enchaîne les étapes et produit le livrable.
            </p>
          </div>
          <MyRunsButton catalog={catalog ?? []} onOpen={onPick} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-xl w-full max-w-xl shadow-soft">
            <Search className="w-4 h-4 text-muted-foreground" />
            <label htmlFor="wf-search" className="sr-only">
              Rechercher
            </label>
            <input
              id="wf-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un workflow…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyFav}
              onChange={(e) => setOnlyFav(e.target.checked)}
            />{" "}
            Mes favoris
          </label>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          {categories.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={category === t}
              onClick={() => setCategory(t)}
              className={`px-3 py-1 rounded-full text-[0.75rem] font-medium border transition-all ${category === t ? "bg-brand/10 border-brand/40 text-brand" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {error ? (
          <div className="text-center text-sm text-destructive py-16">{error}</div>
        ) : !catalog ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-2xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : catalog.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Aucun workflow publié pour votre profil pour le moment.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-16">
            Aucun workflow ne correspond à vos filtres.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((w) => (
              <div
                key={w.id}
                className="relative text-left bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all group flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-600 text-lg">
                    {w.icon ?? <Brain className="w-5 h-5" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {w.isDemo && (
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 font-medium">
                        Exemple
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={
                        isFavorite("workflow", w.id) ? "Retirer des favoris" : "Ajouter aux favoris"
                      }
                      onClick={() => void toggle("workflow", w.id)}
                      className="p-1 rounded hover:bg-muted"
                    >
                      <Heart
                        className={`w-4 h-4 ${isFavorite("workflow", w.id) ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                  {w.category}
                </div>
                <h3 className="text-sm font-semibold mb-1.5">{w.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1">
                  {w.description}
                </p>
                <button
                  type="button"
                  onClick={() => onPick(w.id)}
                  className="mt-auto flex items-center justify-between pt-3 border-t border-border text-xs"
                >
                  <span className="text-muted-foreground">
                    {w.definition.inputs.length} champ(s) · {w.definition.steps.length} étape(s)
                  </span>
                  <span className="font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                    Ouvrir <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MyRunsButton({
  catalog,
  onOpen,
}: {
  catalog: CatalogWorkflow[];
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  useEffect(() => {
    if (!open || runs) return;
    void supabase
      .from("workflow_runs")
      .select(RUN_SELECT)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setRuns((data ?? []) as RunRow[]));
  }, [open, runs]);
  const name = (id: string) => catalog.find((w) => w.id === id)?.name ?? "Workflow (indisponible)";
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        <History className="w-3.5 h-3.5" /> Mes exécutions
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-elevated z-20 p-1">
          {!runs ? (
            <div className="p-3 text-xs text-muted-foreground">Chargement…</div>
          ) : runs.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Aucune exécution.</div>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpen(r.workflow_id);
                }}
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
              >
                <div className="text-xs font-medium truncate">{name(r.workflow_id)}</div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("fr-FR")} · {RUN_STATUS_LABEL[r.status]}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowRunner({ wf, onBack }: { wf: CatalogWorkflow; onBack: () => void }) {
  const { profile } = useAuth();
  const canRun = hasPermission(profile?.role, "workflow.run");
  const def = wf.definition;
  const initial = () =>
    Object.fromEntries(
      def.inputs.map((f) => [f.key, f.defaultValue ?? (f.type === "boolean" ? false : "")]),
    );
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tracker = useRunTracker();
  const [history, setHistory] = useState<RunRow[]>([]);

  const loadHistory = () =>
    void supabase
      .from("workflow_runs")
      .select(RUN_SELECT)
      .eq("workflow_id", wf.id)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setHistory((data ?? []) as RunRow[]));
  useEffect(loadHistory, [wf.id]);

  async function run(retryOf?: RunRow) {
    if (!retryOf) {
      const check = validateInputs(def.inputs, values);
      setErrors(check.errors);
      if (!check.ok) {
        toast.error("Complétez les champs signalés");
        return;
      }
    }
    try {
      await tracker.start("/api/workflows/run", {
        workflowId: wf.id,
        inputs: retryOf ? {} : values,
        ...(retryOf ? { retryOfRunId: retryOf.id } : {}),
      });
    } catch {
      /* erreur affichée par le panneau */
    }
    loadHistory();
  }

  async function openPast(r: RunRow) {
    tracker.setRun(r);
    tracker.setSteps(await fetchSteps(r.id));
    if (r.inputs) setValues({ ...initial(), ...r.inputs });
  }

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      <div className="lg:w-[400px] shrink-0 border-b lg:border-b-0 lg:border-r border-border p-6 overflow-y-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Catalogue
        </button>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold tracking-tight">{wf.name}</h2>
          {wf.isDemo && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 font-medium">
              Exemple
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-3">{wf.description}</p>
        {wf.expectedOutput && (
          <div className="mb-5 rounded-lg bg-muted/40 p-3 text-xs">
            <div className="font-medium mb-0.5">Résultat attendu</div>
            <div className="text-muted-foreground">{wf.expectedOutput}</div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <WorkflowForm
            fields={def.inputs}
            values={values}
            errors={errors}
            disabled={tracker.running}
            onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
          />
          <button
            type="submit"
            disabled={tracker.running || !canRun}
            className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {tracker.running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Exécution…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Lancer le workflow
              </>
            )}
          </button>
          {!canRun && (
            <p className="mt-2 text-xs text-muted-foreground">
              Votre rôle permet de consulter ce workflow mais pas de l'exécuter.
            </p>
          )}
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            Version {wf.version} · délai maximum {def.limits.timeoutSeconds} s
          </p>
        </form>
        {history.length > 0 && (
          <div className="mt-8">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Mes dernières exécutions
            </div>
            <ul className="space-y-1">
              {history.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openPast(r)}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-muted ${tracker.run?.id === r.id ? "bg-muted" : ""}`}
                  >
                    <span className="font-medium">{RUN_STATUS_LABEL[r.status]}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {new Date(r.created_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!tracker.run && !tracker.running ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center">
            Complétez le formulaire et lancez le workflow pour suivre sa progression.
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            {tracker.error && !tracker.run && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {tracker.error}
              </div>
            )}
            <RunPanel
              title={wf.name}
              run={tracker.run}
              steps={tracker.steps}
              elapsedMs={tracker.elapsed}
              filename={wf.slug}
              onRetry={tracker.run ? () => void run(tracker.run!) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
