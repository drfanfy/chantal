/**
 * Workflows (administration) : brouillon éditable (général, champs, étapes,
 * sortie, JSON), test réel du brouillon, publication (serveur, après test
 * réussi de la définition exacte), versions immuables, statistiques d'usage,
 * duplication, archivage. Connexions HTTP encadrées.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Copy,
  Send,
  Trash2,
  FlaskConical,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiPost, errorDetails, errorMessage } from "@/lib/api";
import {
  CONDITION_LABELS,
  CONDITION_OPERATORS,
  EMPTY_DEFINITION,
  INPUT_TYPES,
  TRANSFORM_LABELS,
  TRANSFORM_OPERATIONS,
  formatZodIssues,
  validateInputs,
  workflowDefinitionSchema,
  type InputField,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@/lib/workflows/schema";
import { useRunTracker } from "@/lib/useRunTracker";
import { WorkflowForm } from "@/components/workflows/WorkflowForm";
import { RunPanel } from "@/components/workflows/RunPanel";
import {
  Badge,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CheckboxField,
  ConfirmDialog,
  DataTable,
  EditorSheet,
  FilterSelect,
  FormGrid,
  FormSection,
  ROLE_OPTIONS,
  SearchBox,
  SectionHeader,
  SelectField,
  TextAreaField,
  TextField,
  formatDate,
  toSlug,
  useDirtyForm,
  type Column,
} from "./ui";

interface WfRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  expected_output: string;
  category: string;
  tags: string[];
  icon: string | null;
  status: "draft" | "published" | "archived";
  is_demo: boolean;
  min_role: string;
  draft: WorkflowDefinition;
  published_version_id: string | null;
  updated_at: string;
}
interface VersionRow {
  id: string;
  version: number;
  change_summary: string;
  published_at: string;
  definition_hash: string;
}
interface Opt {
  id: string;
  name: string;
  status?: string;
  is_enabled?: boolean;
}
interface HttpConn {
  id: string;
  name: string;
  base_url: string;
  auth_type: "none" | "bearer" | "header";
  auth_header_name: string | null;
  secret_ref: string | null;
  allowed_methods: string[];
  timeout_ms: number;
  max_response_bytes: number;
  is_enabled: boolean;
  notes: string | null;
}

const STATUS = {
  draft: <Badge>Brouillon</Badge>,
  published: <Badge tone="green">Publié</Badge>,
  archived: <Badge>Archivé</Badge>,
};
const STEP_LABEL = {
  llm: "Étape IA",
  transform: "Transformation",
  condition: "Condition",
  http: "Appel HTTP / webhook",
} as const;

function normalizeDraft(d: unknown): WorkflowDefinition {
  const x = (d ?? {}) as Partial<WorkflowDefinition>;
  return {
    ...EMPTY_DEFINITION,
    ...x,
    inputs: x.inputs ?? [],
    steps: x.steps ?? [],
    output: { ...EMPTY_DEFINITION.output, ...(x.output ?? {}) },
    limits: { ...EMPTY_DEFINITION.limits, ...(x.limits ?? {}) },
  };
}

export function WorkflowsSection() {
  const [tab, setTab] = useState<"workflows" | "http">("workflows");
  const [rows, setRows] = useState<WfRow[]>([]);
  const [models, setModels] = useState<Opt[]>([]);
  const [agents, setAgents] = useState<Opt[]>([]);
  const [conns, setConns] = useState<HttpConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | WfRow["status"]>("all");
  const [editing, setEditing] = useState<WfRow | "new" | null>(null);
  const [editConn, setEditConn] = useState<HttpConn | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, m, a, c] = await Promise.all([
      supabase.from("workflow_definitions").select("*").order("updated_at", { ascending: false }),
      supabase.from("ai_models").select("id, name, status").neq("status", "archived").order("name"),
      supabase.from("agents").select("id, name").is("archived_at", null).order("name"),
      supabase.from("workflow_http_connections").select("*").order("name"),
    ]);
    if (w.error) toast.error(errorMessage(w.error));
    setRows((w.data ?? []) as WfRow[]);
    setModels((m.data ?? []) as Opt[]);
    setAgents((a.data ?? []) as Opt[]);
    setConns((c.data ?? []) as HttpConn[]);
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  const filtered = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!q || [r.name, r.slug, r.category].some((s) => s.toLowerCase().includes(q.toLowerCase()))),
  );
  const columns: Column<WfRow>[] = [
    {
      key: "n",
      header: "Workflow",
      cell: (r) => (
        <div>
          <div className="font-medium">
            {r.icon} {r.name}
          </div>
          <div className="text-[0.7rem] text-muted-foreground font-mono">{r.slug}</div>
        </div>
      ),
    },
    {
      key: "c",
      header: "Catégorie",
      cell: (r) => <span className="text-xs">{r.category}</span>,
      hideOnMobile: true,
    },
    {
      key: "s",
      header: "Statut",
      cell: (r) => (
        <span className="flex gap-1 flex-wrap">
          {STATUS[r.status]}
          {r.is_demo && <Badge tone="amber">Exemple</Badge>}
        </span>
      ),
    },
    {
      key: "st",
      header: "Étapes",
      cell: (r) => normalizeDraft(r.draft).steps.length,
      hideOnMobile: true,
    },
    {
      key: "u",
      header: "Modifié",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDate(r.updated_at)}</span>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Workflows"
        description="Formulaire → étapes IA, conditions, transformations, appels HTTP encadrés → livrable. Les versions publiées sont immuables ; chaque exécution référence sa version exacte."
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            {tab === "workflows" ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
                <Plus className="w-3.5 h-3.5" /> Nouveau workflow
              </button>
            ) : (
              <button type="button" className={BTN_PRIMARY} onClick={() => setEditConn("new")}>
                <Plus className="w-3.5 h-3.5" /> Nouvelle connexion HTTP
              </button>
            )}
          </>
        }
      />
      <div role="tablist" className="mb-3 inline-flex rounded-lg bg-muted p-0.5">
        {(
          [
            ["workflows", `Workflows (${rows.length})`],
            ["http", `Connexions HTTP (${conns.length})`],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1 text-sm ${tab === k ? "bg-background shadow-soft font-medium" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "workflows" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SearchBox value={q} onChange={setQ} />
            <FilterSelect
              label="Statut"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Tous" },
                { value: "draft", label: "Brouillons" },
                { value: "published", label: "Publiés" },
                { value: "archived", label: "Archivés" },
              ]}
            />
          </div>
          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            empty="Aucun workflow."
            onRowClick={setEditing}
          />
        </>
      ) : (
        <DataTable
          rows={conns}
          loading={loading}
          empty="Aucune connexion HTTP."
          onRowClick={setEditConn}
          columns={[
            {
              key: "n",
              header: "Connexion",
              cell: (c) => <span className="font-medium">{c.name}</span>,
            },
            {
              key: "u",
              header: "URL de base",
              cell: (c) => <span className="font-mono text-[0.7rem]">{c.base_url}</span>,
              hideOnMobile: true,
            },
            {
              key: "a",
              header: "Authentification",
              cell: (c) => (
                <span className="text-xs">
                  {c.auth_type === "none" ? "Aucune" : `${c.auth_type} · ${c.secret_ref ?? "?"}`}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: "e",
              header: "Activée",
              cell: (c) =>
                c.is_enabled ? <Badge tone="green">Oui</Badge> : <Badge tone="amber">Non</Badge>,
            },
          ]}
        />
      )}
      {editing && (
        <WorkflowEditor
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          models={models}
          agents={agents}
          conns={conns}
          onClose={() => setEditing(null)}
          onChanged={(r) => {
            void load();
            if (r) setEditing(r);
          }}
        />
      )}
      {editConn && (
        <HttpConnEditor
          conn={editConn === "new" ? null : editConn}
          onClose={() => setEditConn(null)}
          onSaved={() => {
            setEditConn(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function WorkflowEditor({
  row,
  models,
  agents,
  conns,
  onClose,
  onChanged,
}: {
  row: WfRow | null;
  models: Opt[];
  agents: Opt[];
  conns: HttpConn[];
  onClose: () => void;
  onChanged: (r?: WfRow) => void;
}) {
  const form = useDirtyForm({
    name: row?.name ?? "",
    slug: row?.slug ?? "",
    description: row?.description ?? "",
    expected_output: row?.expected_output ?? "",
    category: row?.category ?? "Général",
    tags: (row?.tags ?? []).join(", "),
    icon: row?.icon ?? "",
    min_role: row?.min_role ?? "beta_tester",
    is_demo: row?.is_demo ?? false,
    draft: normalizeDraft(row?.draft),
  });
  const v = form.value;
  const def = v.draft;
  const setDef = (p: Partial<WorkflowDefinition>) => form.patch({ draft: { ...def, ...p } });
  const [tab, setTab] = useState<
    "general" | "inputs" | "steps" | "output" | "test" | "versions" | "json"
  >("general");
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [stats, setStats] = useState<Record<string, number | string | null> | null>(null);

  useEffect(() => {
    if (!row) return;
    void supabase
      .from("workflow_versions")
      .select("id, version, change_summary, published_at, definition_hash")
      .eq("workflow_id", row.id)
      .order("version", { ascending: false })
      .then(({ data }) => setVersions((data ?? []) as VersionRow[]));
    void supabase
      .rpc("workflow_usage_stats", { p_workflow_id: row.id })
      .then(({ data }) => setStats(data as Record<string, number | string | null>));
  }, [row]);

  const validation = useMemo(() => workflowDefinitionSchema.safeParse(def), [def]);
  const issues = validation.success ? [] : formatZodIssues(validation.error);
  const slug = v.slug || toSlug(v.name);

  async function save(): Promise<WfRow | null> {
    if (!v.name.trim()) {
      toast.error("Nom obligatoire");
      return null;
    }
    setBusy(true);
    const p = {
      name: v.name.trim(),
      slug,
      description: v.description,
      expected_output: v.expected_output,
      category: v.category.trim() || "Général",
      tags: v.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      icon: v.icon.trim() || null,
      min_role: v.min_role,
      is_demo: v.is_demo,
      draft: def,
    };
    const res = row
      ? await supabase.from("workflow_definitions").update(p).eq("id", row.id).select("*").single()
      : await supabase.from("workflow_definitions").insert(p).select("*").single();
    setBusy(false);
    if (res.error) {
      toast.error(res.error.code === "23505" ? "Ce slug existe déjà" : errorMessage(res.error));
      return null;
    }
    form.reset({ ...v, slug });
    toast.success(
      validation.success
        ? "Brouillon enregistré"
        : "Brouillon enregistré (incomplet : publication impossible tant que des erreurs subsistent)",
    );
    onChanged(res.data as WfRow);
    return res.data as WfRow;
  }

  async function publish() {
    if (!row) return;
    setBusy(true);
    setServerIssues([]);
    try {
      const r = await apiPost<{ version: { version: number } }>("/api/admin/workflows", {
        action: "publish",
        workflowId: row.id,
        changeSummary: summary,
      });
      toast.success(`Version ${r.version.version} publiée`);
      setPublishOpen(false);
      const { data } = await supabase
        .from("workflow_definitions")
        .select("*")
        .eq("id", row.id)
        .single();
      onChanged(data as WfRow);
    } catch (e) {
      toast.error(errorMessage(e));
      setServerIssues(errorDetails(e));
      setPublishOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "archived" | "draft" | "published") {
    if (!row) return;
    const { error } = await supabase
      .from("workflow_definitions")
      .update({ status })
      .eq("id", row.id);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Statut mis à jour");
      onChanged();
      onClose();
    }
  }

  async function duplicate() {
    if (!row) return;
    const { data, error } = await supabase.rpc("duplicate_workflow", { p_workflow_id: row.id });
    if (error) toast.error(errorMessage(error));
    else {
      const { data: w } = await supabase
        .from("workflow_definitions")
        .select("*")
        .eq("id", data)
        .single();
      toast.success("Copie créée en brouillon");
      onChanged(w as WfRow);
    }
  }

  const tabs = [
    ["general", "Général"],
    ["inputs", `Champs (${def.inputs.length})`],
    ["steps", `Étapes (${def.steps.length})`],
    ["output", "Sortie"],
    ["test", "Tester"],
    ["versions", "Versions et usage"],
    ["json", "JSON"],
  ] as const;
  return (
    <EditorSheet
      open
      onClose={onClose}
      dirty={form.dirty}
      title={v.name || "Nouveau workflow"}
      subtitle={
        row && (
          <span className="flex flex-wrap items-center gap-1.5">
            {STATUS[row.status]}
            {versions[0] && (
              <span>
                v{versions[0].version} publiée le {formatDate(versions[0].published_at)}
              </span>
            )}
            {!validation.success && <Badge tone="amber">{issues.length} point(s) à corriger</Badge>}
          </span>
        )
      }
      footer={
        <>
          {row && row.status !== "archived" && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void setStatus("archived")}
            >
              <Trash2 className="w-3.5 h-3.5" /> Archiver
            </button>
          )}
          {row?.status === "archived" && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void setStatus(row.published_version_id ? "published" : "draft")}
            >
              Rétablir
            </button>
          )}
          {row && (
            <button type="button" className={BTN_SECONDARY} onClick={() => void duplicate()}>
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy || !form.dirty}
            onClick={() => void save()}
          >
            Enregistrer le brouillon
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !row || form.dirty || !validation.success}
            title={form.dirty ? "Enregistrez d'abord" : undefined}
            onClick={() => setPublishOpen(true)}
          >
            <Send className="w-3.5 h-3.5" /> Publier…
          </button>
        </>
      }
    >
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-0.5 w-fit">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            disabled={(k === "test" || k === "versions") && !row}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${tab === k ? "bg-background shadow-soft font-medium" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {(issues.length > 0 || serverIssues.length > 0) && tab !== "test" && (
        <div
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
          role="alert"
        >
          <div className="font-medium mb-1">À corriger avant publication :</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {[...serverIssues, ...issues].slice(0, 12).map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === "general" && (
        <div className="space-y-4">
          <FormGrid>
            <TextField
              label="Nom"
              required
              value={v.name}
              onChange={(x) => form.patch({ name: x })}
              maxLength={120}
            />
            <TextField
              label="Slug"
              mono
              value={v.slug}
              onChange={(x) => form.patch({ slug: toSlug(x) })}
              help="Vide = déduit du nom"
            />
            <TextField
              label="Catégorie"
              value={v.category}
              onChange={(x) => form.patch({ category: x })}
            />
            <TextField
              label="Icône (emoji)"
              value={v.icon}
              onChange={(x) => form.patch({ icon: x })}
              maxLength={4}
            />
            <SelectField
              label="Rôle minimum"
              value={v.min_role}
              onChange={(x) => form.patch({ min_role: x })}
              options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <TextField
              label="Tags (virgules)"
              value={v.tags}
              onChange={(x) => form.patch({ tags: x })}
            />
          </FormGrid>
          <TextAreaField
            label="Description (catalogue)"
            rows={3}
            value={v.description}
            onChange={(x) => form.patch({ description: x })}
            maxLength={1000}
          />
          <TextAreaField
            label="Résultat attendu (affiché avant le lancement)"
            rows={3}
            value={v.expected_output}
            onChange={(x) => form.patch({ expected_output: x })}
            maxLength={2000}
          />
          <CheckboxField
            label="Exemple de démonstration (badge « Exemple »)"
            checked={v.is_demo}
            onChange={(x) => form.patch({ is_demo: x })}
          />
        </div>
      )}

      {tab === "inputs" && (
        <InputsEditor inputs={def.inputs} onChange={(inputs) => setDef({ inputs })} />
      )}
      {tab === "steps" && (
        <StepsEditor
          steps={def.steps}
          onChange={(steps) => setDef({ steps })}
          models={models}
          agents={agents}
          conns={conns}
          inputs={def.inputs}
        />
      )}
      {tab === "output" && (
        <div className="space-y-4">
          <TextAreaField
            label="Gabarit de sortie"
            mono
            rows={10}
            value={def.output.template}
            onChange={(x) => setDef({ output: { ...def.output, template: x } })}
            help="Références : {{vars.variable_de_sortie}} et {{inputs.cle}}."
          />
          <FormGrid cols={3}>
            <SelectField
              label="Format"
              value={def.output.format}
              onChange={(x) => setDef({ output: { ...def.output, format: x } })}
              options={[
                { value: "markdown", label: "Markdown" },
                { value: "text", label: "Texte" },
                { value: "json", label: "JSON" },
              ]}
            />
            <TextField
              label="Nom du fichier téléchargé"
              value={def.output.filename ?? ""}
              onChange={(x) => setDef({ output: { ...def.output, filename: x || undefined } })}
            />
            <TextField
              label="Délai maximum (s)"
              type="number"
              value={String(def.limits.timeoutSeconds)}
              onChange={(x) => setDef({ limits: { timeoutSeconds: Number(x) || 240 } })}
              help="10 à 290 s (limite des fonctions serveur)"
            />
          </FormGrid>
        </div>
      )}
      {tab === "test" && row && (
        <TestTab workflowId={row.id} def={def} dirty={form.dirty} valid={validation.success} />
      )}
      {tab === "versions" && (
        <div className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                ["Exécutions", stats.runs],
                ["Réussies", stats.succeeded],
                ["Échecs", stats.failed],
                ["Utilisateurs", stats.users],
                [
                  "Durée moy.",
                  stats.avg_duration_ms != null
                    ? `${(Number(stats.avg_duration_ms) / 1000).toFixed(1)} s`
                    : "—",
                ],
                ["Tests admin", stats.test_runs],
                [
                  "Dernière exécution",
                  stats.last_run_at ? formatDate(String(stats.last_run_at)) : "—",
                ],
              ].map(([l, val]) => (
                <div key={String(l)} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="font-semibold">{String(val ?? 0)}</div>
                </div>
              ))}
            </div>
          )}
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Jamais publié.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((ver) => (
                <li
                  key={ver.id}
                  className="rounded-lg border border-border p-3 text-sm flex flex-wrap items-center gap-2"
                >
                  <strong>v{ver.version}</strong>{" "}
                  {ver.id === row?.published_version_id && <Badge tone="green">En ligne</Badge>}
                  <span className="text-muted-foreground">
                    {formatDate(ver.published_at)} — {ver.change_summary}
                  </span>
                  <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
                    {ver.definition_hash.slice(0, 12)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Les versions publiées sont immuables. Pour revenir à une version antérieure, modifiez le
            brouillon puis publiez : une nouvelle version est créée.
          </p>
        </div>
      )}
      {tab === "json" && <JsonTab def={def} onApply={(d) => setDef(d)} />}

      <ConfirmDialog
        open={publishOpen}
        busy={busy}
        title="Publier ce workflow ?"
        confirmLabel="Publier"
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
        description={
          <p>
            La définition enregistrée devient la version {(versions[0]?.version ?? 0) + 1}. Le
            serveur vérifie qu'un test réussi existe pour cette définition exacte et que les modèles
            et connexions utilisés sont actifs.
          </p>
        }
      >
        <TextField
          label="Résumé des modifications"
          value={summary}
          onChange={setSummary}
          maxLength={300}
        />
      </ConfirmDialog>
    </EditorSheet>
  );
}

function InputsEditor({
  inputs,
  onChange,
}: {
  inputs: InputField[];
  onChange: (i: InputField[]) => void;
}) {
  const upd = (i: number, p: Partial<InputField>) =>
    onChange(inputs.map((x, j) => (j === i ? ({ ...x, ...p } as InputField) : x)));
  const move = (i: number, d: number) => {
    const a = [...inputs];
    const [x] = a.splice(i, 1);
    a.splice(i + d, 0, x);
    onChange(a);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Champs du formulaire présenté à l'utilisateur. Référence dans les étapes :{" "}
        <code>{"{{inputs.cle}}"}</code>.
      </p>
      {inputs.map((f, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Champ {i + 1}</span>
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Monter"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className="p-1 disabled:opacity-30"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Descendre"
              disabled={i === inputs.length - 1}
              onClick={() => move(i, 1)}
              className="p-1 disabled:opacity-30"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Supprimer le champ"
              onClick={() => onChange(inputs.filter((_, j) => j !== i))}
              className="p-1 text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <FormGrid cols={3}>
            <TextField label="Libellé" value={f.label} onChange={(x) => upd(i, { label: x })} />
            <TextField
              label="Clé"
              mono
              value={f.key}
              onChange={(x) => upd(i, { key: x.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            />
            <SelectField
              label="Type"
              value={f.type}
              onChange={(x) => upd(i, { type: x })}
              options={INPUT_TYPES.map((t) => ({
                value: t,
                label: {
                  text: "Texte court",
                  textarea: "Texte long",
                  number: "Nombre",
                  select: "Liste",
                  date: "Date",
                  boolean: "Case à cocher",
                }[t],
              }))}
            />
          </FormGrid>
          <FormGrid cols={3}>
            <CheckboxField
              label="Obligatoire"
              checked={!!f.required}
              onChange={(x) => upd(i, { required: x })}
            />
            {(f.type === "text" || f.type === "textarea") && (
              <TextField
                label="Longueur max."
                type="number"
                value={f.maxLength ? String(f.maxLength) : ""}
                onChange={(x) => upd(i, { maxLength: x ? Number(x) : undefined })}
              />
            )}
            {f.type === "number" && (
              <>
                <TextField
                  label="Min"
                  type="number"
                  value={f.min !== undefined ? String(f.min) : ""}
                  onChange={(x) => upd(i, { min: x === "" ? undefined : Number(x) })}
                />
                <TextField
                  label="Max"
                  type="number"
                  value={f.max !== undefined ? String(f.max) : ""}
                  onChange={(x) => upd(i, { max: x === "" ? undefined : Number(x) })}
                />
              </>
            )}
          </FormGrid>
          {f.type === "select" && (
            <TextField
              label="Options (séparées par des virgules)"
              value={(f.options ?? []).join(", ")}
              onChange={(x) =>
                upd(i, {
                  options: x
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean),
                })
              }
            />
          )}
          <TextField label="Aide" value={f.help ?? ""} onChange={(x) => upd(i, { help: x })} />
        </div>
      ))}
      <button
        type="button"
        className={BTN_SECONDARY}
        onClick={() =>
          onChange([
            ...inputs,
            {
              key: `champ_${inputs.length + 1}`,
              label: "",
              type: "text",
              required: false,
              help: "",
            },
          ])
        }
      >
        <Plus className="w-3.5 h-3.5" /> Ajouter un champ
      </button>
    </div>
  );
}

function StepsEditor({
  steps,
  onChange,
  models,
  agents,
  conns,
  inputs,
}: {
  steps: WorkflowStep[];
  onChange: (s: WorkflowStep[]) => void;
  models: Opt[];
  agents: Opt[];
  conns: HttpConn[];
  inputs: InputField[];
}) {
  const upd = (i: number, p: Partial<WorkflowStep>) =>
    onChange(steps.map((x, j) => (j === i ? ({ ...x, ...p } as WorkflowStep) : x)));
  const move = (i: number, d: number) => {
    const a = [...steps];
    const [x] = a.splice(i, 1);
    a.splice(i + d, 0, x);
    onChange(a);
  };
  const add = (type: WorkflowStep["type"]) => {
    const n = steps.length + 1;
    const base = {
      id: `etape_${n}`,
      name: STEP_LABEL[type],
      outputVar: `resultat_${n}`,
      when: null,
    };
    const step: WorkflowStep =
      type === "llm"
        ? {
            ...base,
            type,
            modelId: null,
            agentId: null,
            system: "",
            prompt: "",
            maxOutputTokens: 4000,
            responseFormat: "text",
          }
        : type === "transform"
          ? { ...base, type, operation: "template", input: "" }
          : type === "condition"
            ? {
                ...base,
                type,
                condition: { left: "", operator: "not_empty", right: "" },
                onFalse: "continue",
              }
            : {
                ...base,
                type,
                connectionId: conns[0]?.id ?? "",
                method: "POST",
                path: "",
                body: "",
              };
    onChange([...steps, step]);
  };
  const refs = [...inputs.map((f) => `{{inputs.${f.key}}}`)];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Étapes exécutées dans l'ordre. Chaque étape écrit sa sortie dans{" "}
        <code>{"{{vars.variable}}"}</code>, utilisable par les étapes suivantes. Aucune exécution de
        code libre.
      </p>
      {steps.map((s, i) => {
        const avail = [...refs, ...steps.slice(0, i).map((p) => `{{vars.${p.outputVar}}}`)];
        return (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="blue">
                {i + 1}. {STEP_LABEL[s.type]}
              </Badge>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="Monter"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="p-1 disabled:opacity-30"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Descendre"
                disabled={i === steps.length - 1}
                onClick={() => move(i, 1)}
                className="p-1 disabled:opacity-30"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Supprimer l'étape"
                onClick={() => onChange(steps.filter((_, j) => j !== i))}
                className="p-1 text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <FormGrid cols={3}>
              <TextField label="Nom" value={s.name} onChange={(x) => upd(i, { name: x })} />
              <TextField
                label="Identifiant"
                mono
                value={s.id}
                onChange={(x) => upd(i, { id: x.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
              <TextField
                label="Variable de sortie"
                mono
                value={s.outputVar}
                onChange={(x) => upd(i, { outputVar: x.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
            </FormGrid>
            <p className="text-[0.7rem] text-muted-foreground">
              Références disponibles :{" "}
              {avail.length
                ? avail.map((r) => (
                    <code key={r} className="mr-1">
                      {r}
                    </code>
                  ))
                : "aucune"}
            </p>
            {s.type === "llm" && (
              <>
                <FormGrid cols={3}>
                  <SelectField
                    label="Modèle"
                    value={s.modelId ?? ""}
                    onChange={(x) => upd(i, { modelId: x || null })}
                    options={[
                      { value: "", label: "— Choisir —" },
                      ...models.map((m) => ({
                        value: m.id,
                        label: `${m.name}${m.status !== "active" ? " (non actif)" : ""}`,
                      })),
                    ]}
                  />
                  <SelectField
                    label="Agent (optionnel)"
                    value={s.agentId ?? ""}
                    onChange={(x) => upd(i, { agentId: x || null })}
                    options={[
                      { value: "", label: "— Aucun —" },
                      ...agents.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                  <SelectField
                    label="Format de réponse"
                    value={s.responseFormat}
                    onChange={(x) => upd(i, { responseFormat: x })}
                    options={[
                      { value: "text", label: "Texte" },
                      { value: "json", label: "JSON (si le modèle le permet)" },
                    ]}
                  />
                </FormGrid>
                <TextAreaField
                  label="Instructions système"
                  mono
                  rows={4}
                  value={s.system}
                  onChange={(x) => upd(i, { system: x })}
                />
                <TextAreaField
                  label="Consigne (prompt)"
                  mono
                  rows={8}
                  value={s.prompt}
                  onChange={(x) => upd(i, { prompt: x })}
                />
                <TextField
                  label="Tokens de sortie max."
                  type="number"
                  value={String(s.maxOutputTokens)}
                  onChange={(x) => upd(i, { maxOutputTokens: Number(x) || 4000 })}
                />
              </>
            )}
            {s.type === "transform" && (
              <>
                <SelectField
                  label="Opération"
                  value={s.operation}
                  onChange={(x) => upd(i, { operation: x })}
                  options={TRANSFORM_OPERATIONS.map((o) => ({
                    value: o,
                    label: TRANSFORM_LABELS[o],
                  }))}
                />
                <TextAreaField
                  label="Entrée (gabarit)"
                  mono
                  rows={4}
                  value={s.input}
                  onChange={(x) => upd(i, { input: x })}
                />
                {s.operation === "json_get" && (
                  <TextField
                    label="Chemin JSON (ex. risques.niveau)"
                    mono
                    value={s.path ?? ""}
                    onChange={(x) => upd(i, { path: x })}
                  />
                )}
                {s.operation === "truncate" && (
                  <TextField
                    label="Longueur"
                    type="number"
                    value={String(s.length ?? "")}
                    onChange={(x) => upd(i, { length: Number(x) || undefined })}
                  />
                )}
              </>
            )}
            {s.type === "condition" && (
              <>
                <FormGrid cols={3}>
                  <TextField
                    label="Valeur testée"
                    mono
                    value={s.condition.left}
                    onChange={(x) => upd(i, { condition: { ...s.condition, left: x } })}
                  />
                  <SelectField
                    label="Opérateur"
                    value={s.condition.operator}
                    onChange={(x) => upd(i, { condition: { ...s.condition, operator: x } })}
                    options={CONDITION_OPERATORS.map((o) => ({
                      value: o,
                      label: CONDITION_LABELS[o],
                    }))}
                  />
                  <TextField
                    label="Comparée à"
                    mono
                    value={s.condition.right}
                    onChange={(x) => upd(i, { condition: { ...s.condition, right: x } })}
                  />
                </FormGrid>
                <SelectField
                  label="Si la condition est fausse"
                  value={s.onFalse}
                  onChange={(x) => upd(i, { onFalse: x })}
                  options={[
                    { value: "continue", label: "Continuer (variable = false)" },
                    { value: "stop", label: "Arrêter le workflow avec un message" },
                  ]}
                />
                {s.onFalse === "stop" && (
                  <TextField
                    label="Message d'arrêt"
                    value={s.stopMessage ?? ""}
                    onChange={(x) => upd(i, { stopMessage: x })}
                  />
                )}
              </>
            )}
            {s.type === "http" && (
              <>
                <FormGrid cols={3}>
                  <SelectField
                    label="Connexion"
                    value={s.connectionId}
                    onChange={(x) => upd(i, { connectionId: x })}
                    options={[
                      { value: "", label: "— Choisir —" },
                      ...conns.map((c) => ({
                        value: c.id,
                        label: `${c.name}${c.is_enabled ? "" : " (désactivée)"}`,
                      })),
                    ]}
                    help="URL et secret définis par la connexion"
                  />
                  <SelectField
                    label="Méthode"
                    value={s.method}
                    onChange={(x) => upd(i, { method: x })}
                    options={["GET", "POST", "PUT", "PATCH"].map((m) => ({
                      value: m as "GET",
                      label: m,
                    }))}
                  />
                  <TextField
                    label="Chemin relatif"
                    mono
                    value={s.path}
                    onChange={(x) => upd(i, { path: x })}
                    help="Ex. /webhook/analyse ; valeurs encodées"
                  />
                </FormGrid>
                <TextAreaField
                  label="Corps JSON (gabarit)"
                  mono
                  rows={5}
                  value={s.body}
                  onChange={(x) => upd(i, { body: x })}
                  help={'Placez les références entre guillemets : {"ville":"{{inputs.ville}}"}'}
                />
                <TextField
                  label="Champ de la réponse à extraire (optionnel)"
                  mono
                  value={s.responsePath ?? ""}
                  onChange={(x) => upd(i, { responsePath: x || undefined })}
                />
              </>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Exécuter seulement si… {s.when ? <Badge tone="blue">conditionnée</Badge> : null}
              </summary>
              <div className="mt-2 space-y-2">
                <CheckboxField
                  label="Conditionner cette étape"
                  checked={!!s.when}
                  onChange={(x) =>
                    upd(i, { when: x ? { left: "", operator: "equals", right: "" } : null })
                  }
                />
                {s.when && (
                  <FormGrid cols={3}>
                    <TextField
                      label="Valeur"
                      mono
                      value={s.when.left}
                      onChange={(x) => upd(i, { when: { ...s.when!, left: x } })}
                    />
                    <SelectField
                      label="Opérateur"
                      value={s.when.operator}
                      onChange={(x) => upd(i, { when: { ...s.when!, operator: x } })}
                      options={CONDITION_OPERATORS.map((o) => ({
                        value: o,
                        label: CONDITION_LABELS[o],
                      }))}
                    />
                    <TextField
                      label="Comparée à"
                      mono
                      value={s.when.right}
                      onChange={(x) => upd(i, { when: { ...s.when!, right: x } })}
                    />
                  </FormGrid>
                )}
              </div>
            </details>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STEP_LABEL) as WorkflowStep["type"][]).map((t) => (
          <button key={t} type="button" className={BTN_SECONDARY} onClick={() => add(t)}>
            <Plus className="w-3.5 h-3.5" /> {STEP_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function TestTab({
  workflowId,
  def,
  dirty,
  valid,
}: {
  workflowId: string;
  def: WorkflowDefinition;
  dirty: boolean;
  valid: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(def.inputs.map((f) => [f.key, f.defaultValue ?? ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tracker = useRunTracker();
  async function run() {
    const c = validateInputs(def.inputs, values);
    setErrors(c.errors);
    if (!c.ok) return;
    try {
      const r = await tracker.start("/api/admin/workflows", {
        action: "test",
        workflowId,
        inputs: values,
      });
      if (r.status === "succeeded")
        toast.success("Test réussi : cette définition peut être publiée");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  if (dirty)
    return (
      <p className="text-sm text-amber-700">
        Enregistrez le brouillon : le test porte sur la définition enregistrée.
      </p>
    );
  if (!valid)
    return <p className="text-sm text-amber-700">Corrigez la définition avant de la tester.</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
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
          onChange={(k, val) => setValues((s) => ({ ...s, [k]: val }))}
          idPrefix="test"
        />
        <button type="submit" className={`${BTN_PRIMARY} mt-4 w-full`} disabled={tracker.running}>
          {tracker.running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FlaskConical className="w-3.5 h-3.5" />
          )}{" "}
          Lancer le test
        </button>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Appels réels aux fournisseurs (coûts comptés en « test admin », exclus du reporting
          standard).
        </p>
      </form>
      <div>
        {tracker.run || tracker.running ? (
          <RunPanel
            title="Test du brouillon"
            run={tracker.run}
            steps={tracker.steps}
            elapsedMs={tracker.elapsed}
            showPreviews
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Saisissez des valeurs de test et lancez l'exécution.
          </p>
        )}
        {tracker.error && !tracker.run && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {tracker.error}
          </p>
        )}
      </div>
    </div>
  );
}

function JsonTab({
  def,
  onApply,
}: {
  def: WorkflowDefinition;
  onApply: (d: WorkflowDefinition) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(def, null, 2));
  const [err, setErr] = useState<string | null>(null);
  function apply() {
    try {
      const parsed = JSON.parse(text) as WorkflowDefinition;
      onApply(normalizeDraft(parsed));
      setErr(null);
      toast.success("Définition appliquée au brouillon (pensez à enregistrer)");
    } catch {
      setErr("JSON invalide");
    }
  }
  return (
    <div className="space-y-3">
      <TextAreaField
        label="Définition (avancé)"
        mono
        rows={24}
        value={text}
        onChange={setText}
        error={err}
        help="Utile pour copier un workflow entre environnements. Validé à l'enregistrement et à la publication."
      />
      <div className="flex gap-2">
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => setText(JSON.stringify(def, null, 2))}
        >
          Recharger
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={apply}>
          Appliquer au brouillon
        </button>
      </div>
    </div>
  );
}

function HttpConnEditor({
  conn,
  onClose,
  onSaved,
}: {
  conn: HttpConn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useDirtyForm({
    name: conn?.name ?? "",
    base_url: conn?.base_url ?? "https://",
    auth_type: conn?.auth_type ?? "none",
    auth_header_name: conn?.auth_header_name ?? "",
    secret_ref: conn?.secret_ref ?? "",
    allowed_methods: conn?.allowed_methods ?? ["POST"],
    timeout_ms: String(conn?.timeout_ms ?? 30000),
    max_response_bytes: String(conn?.max_response_bytes ?? 1000000),
    is_enabled: conn?.is_enabled ?? false,
    notes: conn?.notes ?? "",
  });
  const v = form.value;
  const [saving, setSaving] = useState(false);
  const urlErr = /^https:\/\/[^\s/]+(\/\S*)?$/.test(v.base_url) ? null : "URL https:// attendue";
  const secretErr =
    v.auth_type !== "none" && !/^[A-Z][A-Z0-9_]{2,63}$/.test(v.secret_ref)
      ? "Nom de variable serveur (CHANTAL_SECRET_…)"
      : null;
  async function save() {
    if (urlErr || secretErr || !v.name.trim()) return;
    setSaving(true);
    const p = {
      name: v.name.trim(),
      base_url: v.base_url.trim(),
      auth_type: v.auth_type,
      auth_header_name: v.auth_type === "header" ? v.auth_header_name || "x-api-key" : null,
      secret_ref: v.auth_type === "none" ? null : v.secret_ref,
      allowed_methods: v.allowed_methods,
      timeout_ms: Number(v.timeout_ms),
      max_response_bytes: Number(v.max_response_bytes),
      is_enabled: v.is_enabled,
      notes: v.notes || null,
    };
    const { error } = conn
      ? await supabase.from("workflow_http_connections").update(p).eq("id", conn.id)
      : await supabase.from("workflow_http_connections").insert(p);
    setSaving(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Connexion enregistrée");
      onSaved();
    }
  }
  return (
    <EditorSheet
      open
      onClose={onClose}
      dirty={form.dirty}
      wide={false}
      title={conn ? conn.name : "Nouvelle connexion HTTP"}
      subtitle="Pour appeler un service interne, un webhook ou un moteur externe (n8n, Make, API métier…). L'hôte doit être autorisé par WORKFLOW_HTTP_ALLOWED_HOSTS côté serveur."
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!form.dirty || saving || !!urlErr || !!secretErr}
            onClick={() => void save()}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nom" required value={v.name} onChange={(x) => form.patch({ name: x })} />
        <TextField
          label="URL de base"
          required
          mono
          value={v.base_url}
          onChange={(x) => form.patch({ base_url: x })}
          error={urlErr}
        />
        <FormGrid>
          <SelectField
            label="Authentification"
            value={v.auth_type}
            onChange={(x) => form.patch({ auth_type: x })}
            options={[
              { value: "none", label: "Aucune" },
              { value: "bearer", label: "Bearer (Authorization)" },
              { value: "header", label: "En-tête personnalisé" },
            ]}
          />
          {v.auth_type === "header" && (
            <TextField
              label="Nom de l'en-tête"
              value={v.auth_header_name}
              onChange={(x) => form.patch({ auth_header_name: x })}
            />
          )}
        </FormGrid>
        {v.auth_type !== "none" && (
          <TextField
            label="Référence du secret"
            mono
            value={v.secret_ref}
            onChange={(x) => form.patch({ secret_ref: x.toUpperCase() })}
            error={secretErr}
            help="Nom de la variable d'environnement serveur, jamais la valeur."
          />
        )}
        <div className="flex gap-4">
          {["GET", "POST", "PUT", "PATCH"].map((m) => (
            <CheckboxField
              key={m}
              label={m}
              checked={v.allowed_methods.includes(m)}
              onChange={(x) =>
                form.patch({
                  allowed_methods: x
                    ? [...v.allowed_methods, m]
                    : v.allowed_methods.filter((y) => y !== m),
                })
              }
            />
          ))}
        </div>
        <FormGrid>
          <TextField
            label="Délai max. (ms)"
            type="number"
            value={v.timeout_ms}
            onChange={(x) => form.patch({ timeout_ms: x })}
          />
          <TextField
            label="Taille max. de réponse (octets)"
            type="number"
            value={v.max_response_bytes}
            onChange={(x) => form.patch({ max_response_bytes: x })}
          />
        </FormGrid>
        <TextAreaField
          label="Notes"
          rows={2}
          value={v.notes}
          onChange={(x) => form.patch({ notes: x })}
        />
        <CheckboxField
          label="Activée"
          checked={v.is_enabled}
          onChange={(x) => form.patch({ is_enabled: x })}
        />
      </div>
    </EditorSheet>
  );
}
