/**
 * Catalogue IA (super administrateurs uniquement — contrôlé par la RLS et les
 * routes serveur). Trois niveaux :
 *   adaptateur (code) → connexion (endpoint + référence de secret) → modèle.
 * Ajouter un modèle sur un adaptateur existant ne nécessite ni code ni
 * redéploiement. Aucune clé n'est saisie ici : seulement le NOM de la variable
 * d'environnement serveur qui la contient.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  FlaskConical,
  Copy,
  Archive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiFetch, apiPost, errorMessage } from "@/lib/api";
import { invalidateAIConfig } from "@/lib/useAIConfig";
import {
  Badge,
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CheckboxField,
  ConfirmDialog,
  DataTable,
  EditorSheet,
  FormGrid,
  FormSection,
  ROLE_OPTIONS,
  SearchBox,
  SectionHeader,
  SelectField,
  TextAreaField,
  TextField,
  formatDate,
  useDirtyForm,
  type Column,
} from "./ui";

type Capability = "text" | "streaming" | "vision" | "files" | "structured_output" | "tools";
const CAP_LABELS: Record<Capability, string> = {
  text: "Texte",
  streaming: "Streaming",
  vision: "Images en entrée",
  files: "Fichiers PDF",
  structured_output: "Sortie JSON",
  tools: "Outils (appel de fonctions)",
};

interface AdapterInfo {
  id: string;
  label: string;
  description: string;
  supported: Record<Capability, boolean>;
  supportsTemperature: boolean;
  requiresBaseUrl: boolean;
  officialHosts: string[];
  defaultBaseUrl: string | null;
}
interface AiStatus {
  adapters: AdapterInfo[];
  connections: { id: string; configured: boolean; reason: string | null }[];
  models: {
    id: string;
    configured: boolean;
    reason: string | null;
    effectiveCapabilities: Partial<Record<Capability, boolean>>;
  }[];
  environment: {
    appEnv: string;
    aiAllowedHosts: string[];
    mockEnabled: boolean;
    requestTimeoutMs: number;
    maxConcurrentPerUser: number;
  };
}
interface ConnectionRow {
  id: string;
  name: string;
  adapter: string;
  base_url: string | null;
  api_version: string | null;
  region: string | null;
  deployment: string | null;
  secret_ref: string | null;
  is_enabled: boolean;
  notes: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  archived_at: string | null;
}
interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  api_model_id: string | null;
  connection_id: string | null;
  icon: string | null;
  avatar_url: string | null;
  display_order: number;
  capabilities: Partial<Record<Capability, boolean>>;
  default_params: { max_output_tokens?: number; temperature?: number };
  param_limits: { max_output_tokens?: number; temperature_min?: number; temperature_max?: number };
  availability: { chat?: boolean; agents?: boolean; workflows?: boolean };
  status: "draft" | "active" | "disabled" | "archived";
  min_role: string;
  quota_requests_per_user_day: number | null;
  quota_tokens_per_month: number | null;
  max_concurrency_per_user: number | null;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  last_test_latency_ms: number | null;
  config_updated_at: string;
  provider: string;
}
interface PricingRow {
  id: string;
  model_id: string;
  currency: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok: number | null;
  effective_from: string;
  source_url: string | null;
  notes: string | null;
}

const STATUS_BADGE = {
  draft: <Badge>Brouillon</Badge>,
  active: <Badge tone="green">Actif</Badge>,
  disabled: <Badge tone="amber">Désactivé</Badge>,
  archived: <Badge tone="gray">Archivé</Badge>,
} as const;

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function ModelsSection() {
  const [tab, setTab] = useState<"models" | "connections">("models");
  const [models, setModels] = useState<ModelRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editModel, setEditModel] = useState<ModelRow | "new" | null>(null);
  const [editConn, setEditConn] = useState<ConnectionRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, c, p, st] = await Promise.all([
      supabase.from("ai_models").select("*").order("display_order").order("name"),
      supabase.from("ai_provider_connections").select("*").order("name"),
      supabase.from("ai_model_pricing").select("*").order("effective_from", { ascending: false }),
      apiFetch<AiStatus>("/api/admin/ai-status").catch((e) => {
        toast.error(errorMessage(e));
        return null;
      }),
    ]);
    setError(m.error ? errorMessage(m.error) : null);
    setModels((m.data ?? []) as ModelRow[]);
    setConnections((c.data ?? []) as ConnectionRow[]);
    setPricing((p.data ?? []) as PricingRow[]);
    setStatus(st);
    setLoading(false);
    invalidateAIConfig();
  }, []);
  useEffect(() => void load(), [load]);

  const connById = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections]);
  const statusById = useMemo(() => new Map((status?.models ?? []).map((s) => [s.id, s])), [status]);
  const connStatusById = useMemo(
    () => new Map((status?.connections ?? []).map((s) => [s.id, s])),
    [status],
  );
  const filteredModels = models.filter(
    (m) =>
      (showArchived || m.status !== "archived") &&
      (!q || [m.name, m.api_model_id ?? ""].some((s) => s.toLowerCase().includes(q.toLowerCase()))),
  );

  const modelColumns: Column<ModelRow>[] = [
    {
      key: "name",
      header: "Modèle",
      cell: (m) => (
        <div>
          <div className="font-medium">
            {m.icon} {m.name}
          </div>
          <div className="font-mono text-[0.7rem] text-muted-foreground">
            {m.api_model_id ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "conn",
      header: "Connexion",
      cell: (m) => {
        const c = m.connection_id ? connById.get(m.connection_id) : null;
        return c ? (
          <span className="text-xs">
            {c.name} <span className="text-muted-foreground">({c.adapter})</span>
          </span>
        ) : (
          <Badge tone="red">Aucune</Badge>
        );
      },
      hideOnMobile: true,
    },
    { key: "status", header: "Statut", cell: (m) => STATUS_BADGE[m.status] },
    {
      key: "config",
      header: "Configuration",
      cell: (m) => {
        const s = statusById.get(m.id);
        return s?.configured ? (
          <Badge tone="green">Configuré</Badge>
        ) : (
          <Badge tone="amber" title={s?.reason ?? undefined}>
            Non configuré
          </Badge>
        );
      },
    },
    {
      key: "test",
      header: "Dernier test",
      cell: (m) => (
        <TestBadge
          status={m.last_test_status}
          at={m.last_test_at}
          stale={!!m.last_test_at && m.last_test_at < m.config_updated_at}
        />
      ),
      hideOnMobile: true,
    },
  ];

  const connColumns: Column<ConnectionRow>[] = [
    {
      key: "name",
      header: "Connexion",
      cell: (c) => (
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="text-[0.7rem] text-muted-foreground">
            {status?.adapters.find((a) => a.id === c.adapter)?.label ?? c.adapter}
          </div>
        </div>
      ),
    },
    {
      key: "endpoint",
      header: "Endpoint",
      cell: (c) => (
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          {c.base_url ?? "officiel par défaut"}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "secret",
      header: "Secret (référence)",
      cell: (c) => <span className="font-mono text-[0.7rem]">{c.secret_ref ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      key: "enabled",
      header: "Activée",
      cell: (c) =>
        c.archived_at ? (
          <Badge>Archivée</Badge>
        ) : c.is_enabled ? (
          <Badge tone="green">Oui</Badge>
        ) : (
          <Badge tone="amber">Non</Badge>
        ),
    },
    {
      key: "config",
      header: "Configuration",
      cell: (c) => {
        const s = connStatusById.get(c.id);
        return s?.configured ? (
          <Badge tone="green">Configurée</Badge>
        ) : (
          <Badge tone="amber" title={s?.reason ?? undefined}>
            {s?.reason ?? "Non configurée"}
          </Badge>
        );
      },
    },
    {
      key: "models",
      header: "Modèles",
      cell: (c) => models.filter((m) => m.connection_id === c.id).length,
      hideOnMobile: true,
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Modèles IA"
        description="Catalogue administrable : connexions aux fournisseurs (sans aucune clé en base) et modèles proposés aux utilisateurs. Un modèle ne peut être activé qu'après un test réussi."
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            {tab === "models" ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => setEditModel("new")}>
                <Plus className="w-3.5 h-3.5" /> Nouveau modèle
              </button>
            ) : (
              <button type="button" className={BTN_PRIMARY} onClick={() => setEditConn("new")}>
                <Plus className="w-3.5 h-3.5" /> Nouvelle connexion
              </button>
            )}
          </>
        }
      />
      {status && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Environnement : <strong>{status.environment.appEnv}</strong>
          </span>
          <span>Délai max : {Math.round(status.environment.requestTimeoutMs / 1000)} s</span>
          <span>Concurrence max / utilisateur : {status.environment.maxConcurrentPerUser}</span>
          <span>
            Hôtes autorisés (compatibles OpenAI) :{" "}
            {status.environment.aiAllowedHosts.join(", ") || "aucun"}
          </span>
          {status.environment.mockEnabled && (
            <Badge tone="amber">Fournisseur fictif activé (hors production)</Badge>
          )}
        </div>
      )}
      <div role="tablist" className="mb-3 inline-flex rounded-lg bg-muted p-0.5">
        {(["models", "connections"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-background shadow-soft font-medium" : "text-muted-foreground"}`}
          >
            {t === "models" ? `Modèles (${models.length})` : `Connexions (${connections.length})`}
          </button>
        ))}
      </div>
      {tab === "models" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SearchBox value={q} onChange={setQ} placeholder="Nom ou identifiant API…" />
            <CheckboxField
              label="Afficher les archivés"
              checked={showArchived}
              onChange={setShowArchived}
            />
          </div>
          <DataTable
            columns={modelColumns}
            rows={filteredModels}
            loading={loading}
            error={error}
            empty="Aucun modèle. Créez d'abord une connexion, puis un modèle."
            onRowClick={setEditModel}
          />
        </>
      ) : (
        <DataTable
          columns={connColumns}
          rows={connections}
          loading={loading}
          empty="Aucune connexion."
          onRowClick={setEditConn}
        />
      )}

      {editModel && status && (
        <ModelEditor
          key={editModel === "new" ? "new" : editModel.id}
          model={editModel === "new" ? null : editModel}
          connections={connections.filter((c) => !c.archived_at)}
          adapters={status.adapters}
          pricing={pricing}
          configStatus={editModel === "new" ? null : (statusById.get(editModel.id) ?? null)}
          onClose={() => setEditModel(null)}
          onChanged={(keepOpen, row) => {
            void load();
            if (!keepOpen) setEditModel(null);
            else if (row) setEditModel(row);
          }}
        />
      )}
      {editConn && status && (
        <ConnectionEditor
          key={editConn === "new" ? "new" : editConn.id}
          conn={editConn === "new" ? null : editConn}
          adapters={status.adapters}
          configStatus={editConn === "new" ? null : (connStatusById.get(editConn.id) ?? null)}
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

function TestBadge({
  status,
  at,
  stale,
}: {
  status: string | null;
  at: string | null;
  stale?: boolean;
}) {
  if (!status) return <Badge>Jamais testé</Badge>;
  if (stale)
    return (
      <Badge tone="amber" title={`Test du ${formatDate(at)} antérieur à la dernière modification`}>
        À retester
      </Badge>
    );
  return status === "success" ? (
    <Badge tone="green" title={formatDate(at)}>
      <CheckCircle2 className="w-3 h-3" /> OK
    </Badge>
  ) : (
    <Badge tone="red" title={formatDate(at)}>
      <AlertCircle className="w-3 h-3" /> Échec
    </Badge>
  );
}

function modelFormFrom(m: ModelRow | null) {
  return {
    name: m?.name ?? "",
    api_model_id: m?.api_model_id ?? "",
    connection_id: m?.connection_id ?? "",
    description: m?.description ?? "",
    icon: m?.icon ?? "",
    avatar_url: m?.avatar_url ?? "",
    display_order: String(m?.display_order ?? 100),
    capabilities: {
      text: true,
      streaming: true,
      vision: false,
      files: false,
      structured_output: false,
      tools: false,
      ...(m?.capabilities ?? {}),
    } as Record<Capability, boolean>,
    max_output_tokens: String(m?.default_params?.max_output_tokens ?? 4000),
    temperature:
      m?.default_params?.temperature !== undefined ? String(m.default_params.temperature) : "",
    limit_max_output_tokens:
      m?.param_limits?.max_output_tokens !== undefined
        ? String(m.param_limits.max_output_tokens)
        : "",
    temperature_min:
      m?.param_limits?.temperature_min !== undefined ? String(m.param_limits.temperature_min) : "",
    temperature_max:
      m?.param_limits?.temperature_max !== undefined ? String(m.param_limits.temperature_max) : "",
    availability: { chat: true, agents: true, workflows: true, ...(m?.availability ?? {}) },
    min_role: m?.min_role ?? "beta_tester",
    status: m?.status ?? "draft",
    quota_requests_per_user_day:
      m?.quota_requests_per_user_day != null ? String(m.quota_requests_per_user_day) : "",
    quota_tokens_per_month:
      m?.quota_tokens_per_month != null ? String(m.quota_tokens_per_month) : "",
    max_concurrency_per_user:
      m?.max_concurrency_per_user != null ? String(m.max_concurrency_per_user) : "",
  };
}

function ModelEditor({
  model,
  connections,
  adapters,
  pricing,
  configStatus,
  onClose,
  onChanged,
}: {
  model: ModelRow | null;
  connections: ConnectionRow[];
  adapters: AdapterInfo[];
  pricing: PricingRow[];
  configStatus: AiStatus["models"][number] | null;
  onClose: () => void;
  onChanged: (keepOpen: boolean, row?: ModelRow) => void;
}) {
  const form = useDirtyForm(modelFormFrom(model));
  const v = form.value;
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error: string | null;
    reply: string | null;
    latencyMs: number;
  } | null>(null);
  const [deps, setDeps] = useState<{
    partners: { name: string }[];
    agents: { name: string }[];
    workflow_drafts: { name: string }[];
    workflow_published: { name: string; version: number }[];
  } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const conn = connections.find((c) => c.id === v.connection_id);
  const adapter = adapters.find((a) => a.id === conn?.adapter);
  const modelPricing = pricing.filter((p) => p.model_id === model?.id);

  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = "Nom obligatoire";
  if (!v.api_model_id.trim()) errors.api = "Identifiant API obligatoire";
  else if (!/^[\w.:/@-]{1,200}$/.test(v.api_model_id.trim()))
    errors.api = "Caractères autorisés : lettres, chiffres, . _ - : / @";
  if (!v.connection_id) errors.conn = "Choisissez une connexion";
  const mot = Number(v.max_output_tokens);
  if (!Number.isInteger(mot) || mot < 16 || mot > 200000) errors.mot = "Entier entre 16 et 200 000";
  if (v.limit_max_output_tokens && Number(v.limit_max_output_tokens) < mot)
    errors.mot = "Supérieur à la limite définie";
  if (
    v.temperature &&
    (Number.isNaN(Number(v.temperature)) || Number(v.temperature) < 0 || Number(v.temperature) > 2)
  )
    errors.temp = "Entre 0 et 2";
  const valid = Object.keys(errors).length === 0;

  function payload() {
    const caps = Object.fromEntries(
      (Object.keys(CAP_LABELS) as Capability[]).map((c) => [
        c,
        c === "text" ? true : !!v.capabilities[c] && !!adapter?.supported[c],
      ]),
    );
    const default_params: Record<string, number> = { max_output_tokens: mot };
    if (adapter?.supportsTemperature && v.temperature)
      default_params.temperature = Number(v.temperature);
    const param_limits: Record<string, number> = {};
    if (v.limit_max_output_tokens)
      param_limits.max_output_tokens = Number(v.limit_max_output_tokens);
    if (v.temperature_min) param_limits.temperature_min = Number(v.temperature_min);
    if (v.temperature_max) param_limits.temperature_max = Number(v.temperature_max);
    return {
      name: v.name.trim(),
      api_model_id: v.api_model_id.trim(),
      connection_id: v.connection_id,
      provider: conn?.adapter ?? "openai_compatible",
      description: v.description.trim() || null,
      icon: v.icon.trim() || null,
      avatar_url: v.avatar_url.trim() || null,
      display_order: Number(v.display_order) || 100,
      capabilities: caps,
      default_params,
      param_limits,
      availability: v.availability,
      min_role: v.min_role,
      status: v.status,
      quota_requests_per_user_day: numOrNull(v.quota_requests_per_user_day),
      quota_tokens_per_month: numOrNull(v.quota_tokens_per_month),
      max_concurrency_per_user: numOrNull(v.max_concurrency_per_user),
    };
  }

  async function save(keepOpen = false) {
    if (!valid) {
      toast.error("Corrigez les champs signalés");
      return;
    }
    setSaving(true);
    const p = payload();
    const res = model
      ? await supabase.from("ai_models").update(p).eq("id", model.id).select("*").single()
      : await supabase
          .from("ai_models")
          .insert({ ...p, status: p.status === "active" ? "draft" : p.status })
          .select("*")
          .single();
    setSaving(false);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    form.reset(modelFormFrom(res.data as ModelRow));
    toast.success(
      model ? "Modèle enregistré" : "Modèle créé (brouillon) : testez-le avant activation",
    );
    onChanged(keepOpen || !model, res.data as ModelRow);
  }

  async function test() {
    if (!model) return;
    if (form.dirty) {
      toast.error(
        "Enregistrez d'abord vos modifications : le test porte sur la configuration enregistrée",
      );
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiPost<{
        ok: boolean;
        error: string | null;
        reply: string | null;
        latencyMs: number;
      }>("/api/admin/ai-test", { modelId: model.id });
      setTestResult(r);
      if (r.ok) toast.success(`Test réussi (${r.latencyMs} ms)`);
      else toast.error("Test en échec");
      onChanged(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  async function duplicate() {
    if (!model) return;
    const p = payload();
    const { data, error } = await supabase
      .from("ai_models")
      .insert({ ...p, name: `${p.name} (copie)`, status: "draft" })
      .select("*")
      .single();
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Copie créée en brouillon");
      onChanged(true, data as ModelRow);
    }
  }

  async function prepareArchive() {
    if (!model) return;
    const { data, error } = await supabase.rpc("model_dependencies", { p_model_id: model.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    setDeps(data as typeof deps);
    setArchiveOpen(true);
  }

  async function archive() {
    if (!model) return;
    const { error } = await supabase
      .from("ai_models")
      .update({ status: "archived" })
      .eq("id", model.id);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Modèle archivé (historique conservé)");
      setArchiveOpen(false);
      onChanged(false);
    }
  }

  const testFresh =
    model?.last_test_status === "success" &&
    !!model.last_test_at &&
    model.last_test_at >= model.config_updated_at;

  return (
    <EditorSheet
      open
      onClose={onClose}
      dirty={form.dirty}
      title={model ? model.name : "Nouveau modèle"}
      subtitle={
        model ? (
          <span className="flex flex-wrap items-center gap-2">
            {STATUS_BADGE[model.status]}{" "}
            {configStatus?.configured ? (
              <Badge tone="green">Configuré</Badge>
            ) : (
              <Badge tone="amber">{configStatus?.reason ?? "Non configuré"}</Badge>
            )}{" "}
            <TestBadge
              status={model.last_test_status}
              at={model.last_test_at}
              stale={!!model.last_test_at && model.last_test_at < model.config_updated_at}
            />
          </span>
        ) : (
          "Le modèle est créé en brouillon ; activation après test réussi."
        )
      }
      footer={
        <>
          {model && (
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => void prepareArchive()}
              disabled={model.status === "archived"}
            >
              <Archive className="w-3.5 h-3.5" /> Archiver…
            </button>
          )}
          {model && (
            <button type="button" className={BTN_SECONDARY} onClick={() => void duplicate()}>
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
          )}
          {model && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void test()}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FlaskConical className="w-3.5 h-3.5" />
              )}{" "}
              Tester
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving || !form.dirty || !valid}
            onClick={() => void save(true)}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-8">
        {testResult && (
          <div
            role="status"
            className={`rounded-lg border p-3 text-sm ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}
          >
            <div className="font-medium">
              {testResult.ok ? `Test réussi en ${testResult.latencyMs} ms` : "Test en échec"}
            </div>
            {testResult.reply && (
              <div className="text-xs text-muted-foreground mt-1">
                Réponse : « {testResult.reply} »
              </div>
            )}
            {testResult.error && (
              <div className="text-xs text-destructive mt-1">{testResult.error}</div>
            )}
          </div>
        )}
        {model?.last_test_error && !testResult && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Dernière erreur de test : {model.last_test_error}
          </div>
        )}

        <FormSection title="Identification">
          <FormGrid>
            <TextField
              label="Nom affiché"
              required
              value={v.name}
              onChange={(x) => form.patch({ name: x })}
              error={errors.name}
              maxLength={80}
            />
            <TextField
              label="Identifiant API exact"
              required
              mono
              value={v.api_model_id}
              onChange={(x) => form.patch({ api_model_id: x })}
              error={errors.api}
              help="Tel que documenté par le fournisseur (ex. claude-sonnet-5-5). Le modifier impose un nouveau test."
            />
            <SelectField
              label="Connexion fournisseur"
              required
              value={v.connection_id}
              onChange={(x) => form.patch({ connection_id: x })}
              error={errors.conn}
              options={[
                { value: "", label: "— Choisir —" },
                ...connections.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.adapter})${c.is_enabled ? "" : " — désactivée"}`,
                })),
              ]}
            />
            <FormGrid>
              <TextField
                label="Icône (emoji)"
                value={v.icon}
                onChange={(x) => form.patch({ icon: x })}
                maxLength={4}
              />
              <TextField
                label="Ordre d'affichage"
                type="number"
                value={v.display_order}
                onChange={(x) => form.patch({ display_order: x })}
              />
            </FormGrid>
          </FormGrid>
          <TextAreaField
            label="Description"
            value={v.description}
            onChange={(x) => form.patch({ description: x })}
            rows={2}
            maxLength={500}
          />
          <TextField
            label="URL d'avatar (optionnelle)"
            value={v.avatar_url}
            onChange={(x) => form.patch({ avatar_url: x })}
          />
        </FormSection>

        <FormSection
          title="Capacités"
          description={
            adapter
              ? `Seules les capacités réellement exécutées par l'adaptateur « ${adapter.label} » peuvent être cochées.`
              : "Choisissez une connexion pour voir les capacités disponibles."
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(CAP_LABELS) as Capability[]).map((c) => {
              const supported = !!adapter?.supported[c];
              return (
                <CheckboxField
                  key={c}
                  label={CAP_LABELS[c]}
                  checked={c === "text" || (supported && v.capabilities[c])}
                  disabled={c === "text" || !supported}
                  onChange={(x) => form.patch({ capabilities: { ...v.capabilities, [c]: x } })}
                  help={
                    !supported
                      ? "Non pris en charge par l'adaptateur"
                      : c === "files" || c === "vision"
                        ? "Vérifiez que le modèle le permet chez le fournisseur"
                        : undefined
                  }
                />
              );
            })}
          </div>
        </FormSection>

        <FormSection
          title="Paramètres par défaut et limites"
          description="Appliqués côté serveur à chaque appel ; les valeurs demandées sont bornées par les limites."
        >
          <FormGrid cols={3}>
            <TextField
              label="Tokens de sortie (défaut)"
              type="number"
              value={v.max_output_tokens}
              onChange={(x) => form.patch({ max_output_tokens: x })}
              error={errors.mot}
            />
            <TextField
              label="Tokens de sortie (limite)"
              type="number"
              value={v.limit_max_output_tokens}
              onChange={(x) => form.patch({ limit_max_output_tokens: x })}
              help="Vide = pas de limite supplémentaire"
            />
            {adapter?.supportsTemperature ? (
              <TextField
                label="Température (défaut)"
                value={v.temperature}
                onChange={(x) => form.patch({ temperature: x })}
                error={errors.temp}
                help="Vide = valeur du fournisseur"
              />
            ) : (
              <div className="text-xs text-muted-foreground pt-6">
                Température non transmise par cet adaptateur.
              </div>
            )}
          </FormGrid>
          {adapter?.supportsTemperature && (
            <FormGrid>
              <TextField
                label="Température minimale"
                value={v.temperature_min}
                onChange={(x) => form.patch({ temperature_min: x })}
              />
              <TextField
                label="Température maximale"
                value={v.temperature_max}
                onChange={(x) => form.patch({ temperature_max: x })}
              />
            </FormGrid>
          )}
        </FormSection>

        <FormSection title="Accès, disponibilité et quotas">
          <FormGrid>
            <SelectField
              label="Rôle minimum"
              value={v.min_role}
              onChange={(x) => form.patch({ min_role: x })}
              options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <SelectField
              label="Statut"
              value={v.status}
              onChange={(x) => form.patch({ status: x })}
              options={[
                { value: "draft", label: "Brouillon" },
                {
                  value: "active",
                  label: testFresh ? "Actif" : "Actif (test réussi requis)",
                  disabled: !testFresh,
                },
                { value: "disabled", label: "Désactivé" },
                { value: "archived", label: "Archivé" },
              ]}
              help={
                testFresh
                  ? undefined
                  : "Lancez un test réussi de la configuration enregistrée pour pouvoir activer."
              }
            />
          </FormGrid>
          <div className="flex flex-wrap gap-6">
            <CheckboxField
              label="Chat"
              checked={!!v.availability.chat}
              onChange={(x) => form.patch({ availability: { ...v.availability, chat: x } })}
            />
            <CheckboxField
              label="Agents et partenaires"
              checked={!!v.availability.agents}
              onChange={(x) => form.patch({ availability: { ...v.availability, agents: x } })}
            />
            <CheckboxField
              label="Workflows"
              checked={!!v.availability.workflows}
              onChange={(x) => form.patch({ availability: { ...v.availability, workflows: x } })}
            />
          </div>
          <FormGrid cols={3}>
            <TextField
              label="Requêtes / utilisateur / jour"
              type="number"
              value={v.quota_requests_per_user_day}
              onChange={(x) => form.patch({ quota_requests_per_user_day: x })}
              help="Vide = illimité"
            />
            <TextField
              label="Tokens / mois (tous utilisateurs)"
              type="number"
              value={v.quota_tokens_per_month}
              onChange={(x) => form.patch({ quota_tokens_per_month: x })}
              help="Vide = illimité"
            />
            <TextField
              label="Requêtes simultanées / utilisateur"
              type="number"
              value={v.max_concurrency_per_user}
              onChange={(x) => form.patch({ max_concurrency_per_user: x })}
              help="Borné par AI_MAX_CONCURRENT_PER_USER"
            />
          </FormGrid>
        </FormSection>

        {model && (
          <PricingEditor modelId={model.id} rows={modelPricing} onChanged={() => onChanged(true)} />
        )}
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title="Archiver ce modèle ?"
        confirmLabel="Archiver"
        danger
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => void archive()}
        description={
          <>
            <p>
              Le modèle ne sera plus proposé. Les conversations, exécutions et statistiques passées
              sont conservées. Aucun modèle de remplacement n'est appliqué automatiquement.
            </p>
            {deps &&
            deps.partners.length +
              deps.agents.length +
              deps.workflow_drafts.length +
              deps.workflow_published.length >
              0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-foreground">
                <div className="font-medium mb-1">Dépendances qui ne fonctionneront plus :</div>
                <ul className="list-disc pl-4">
                  {deps.partners.map((d) => (
                    <li key={`p${d.name}`}>Partenaire « {d.name} »</li>
                  ))}
                  {deps.agents.map((d) => (
                    <li key={`a${d.name}`}>Agent « {d.name} » (modèle par défaut)</li>
                  ))}
                  {deps.workflow_published.map((d) => (
                    <li key={`w${d.name}`}>
                      Workflow publié « {d.name} » (v{d.version})
                    </li>
                  ))}
                  {deps.workflow_drafts.map((d) => (
                    <li key={`d${d.name}`}>Brouillon de workflow « {d.name} »</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>Aucune dépendance détectée.</p>
            )}
          </>
        }
      />
    </EditorSheet>
  );
}

function PricingEditor({
  modelId,
  rows,
  onChanged,
}: {
  modelId: string;
  rows: PricingRow[];
  onChanged: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({
    effective_from: today,
    currency: "USD",
    input: "",
    output: "",
    cached: "",
    source_url: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const current = rows.find((r) => r.effective_from <= today);
  async function add() {
    const inp = Number(draft.input);
    const out = Number(draft.output);
    if (
      !draft.input ||
      !draft.output ||
      Number.isNaN(inp) ||
      Number.isNaN(out) ||
      inp < 0 ||
      out < 0
    ) {
      toast.error("Tarifs d'entrée et de sortie obligatoires (≥ 0)");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ai_model_pricing").insert({
      model_id: modelId,
      effective_from: draft.effective_from,
      currency: draft.currency,
      input_per_mtok: inp,
      output_per_mtok: out,
      cached_input_per_mtok: draft.cached ? Number(draft.cached) : null,
      source_url: draft.source_url || null,
      notes: draft.notes || null,
    });
    setSaving(false);
    if (error)
      toast.error(
        error.code === "23505" ? "Un tarif existe déjà à cette date" : errorMessage(error),
      );
    else {
      toast.success("Tarif ajouté");
      setDraft({ ...draft, input: "", output: "", cached: "", notes: "" });
      onChanged();
    }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("ai_model_pricing").delete().eq("id", id);
    if (error) toast.error(errorMessage(error));
    else onChanged();
  }
  return (
    <FormSection
      title="Tarifs (estimation des coûts)"
      description="Prix par million de tokens, avec date d'effet. Les estimations du reporting utilisent le tarif en vigueur à la date de chaque requête. Sans tarif : coût « indisponible »."
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun tarif saisi.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2">Date d'effet</th>
                <th className="px-3 py-2">Entrée</th>
                <th className="px-3 py-2">Entrée (cache)</th>
                <th className="px-3 py-2">Sortie</th>
                <th className="px-3 py-2">Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {r.effective_from}{" "}
                    {current?.id === r.id && <Badge tone="green">En vigueur</Badge>}
                    {r.effective_from > today && <Badge tone="blue">À venir</Badge>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Number(r.input_per_mtok)} {r.currency}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.cached_input_per_mtok != null
                      ? `${Number(r.cached_input_per_mtok)} ${r.currency}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Number(r.output_per_mtok)} {r.currency}
                  </td>
                  <td className="px-3 py-2 max-w-[14rem] truncate">
                    {r.source_url ? (
                      <a
                        className="text-brand hover:underline"
                        href={r.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.source_url}
                      </a>
                    ) : (
                      "—"
                    )}
                    {r.notes && <div className="text-muted-foreground">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.effective_from > today && (
                      <button
                        type="button"
                        aria-label="Supprimer ce tarif à venir"
                        onClick={() => void remove(r.id)}
                        className="p-1 text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 md:grid-cols-6">
        <TextField
          label="Date d'effet"
          type="date"
          value={draft.effective_from}
          onChange={(x) => setDraft({ ...draft, effective_from: x })}
        />
        <SelectField
          label="Devise"
          value={draft.currency}
          onChange={(x) => setDraft({ ...draft, currency: x })}
          options={[
            { value: "USD", label: "USD" },
            { value: "EUR", label: "EUR" },
          ]}
        />
        <TextField
          label="Entrée / 1M"
          value={draft.input}
          onChange={(x) => setDraft({ ...draft, input: x })}
        />
        <TextField
          label="Cache / 1M"
          value={draft.cached}
          onChange={(x) => setDraft({ ...draft, cached: x })}
        />
        <TextField
          label="Sortie / 1M"
          value={draft.output}
          onChange={(x) => setDraft({ ...draft, output: x })}
        />
        <div className="flex items-end">
          <button
            type="button"
            className={`${BTN_SECONDARY} w-full`}
            disabled={saving}
            onClick={() => void add()}
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
        <div className="md:col-span-3">
          <TextField
            label="URL de la source officielle"
            value={draft.source_url}
            onChange={(x) => setDraft({ ...draft, source_url: x })}
          />
        </div>
        <div className="md:col-span-3">
          <TextField
            label="Notes (paliers, conditions)"
            value={draft.notes}
            onChange={(x) => setDraft({ ...draft, notes: x })}
          />
        </div>
      </div>
    </FormSection>
  );
}

function connFormFrom(c: ConnectionRow | null, adapters: AdapterInfo[]) {
  return {
    name: c?.name ?? "",
    adapter: c?.adapter ?? adapters[0]?.id ?? "openai",
    base_url: c?.base_url ?? "",
    api_version: c?.api_version ?? "",
    region: c?.region ?? "",
    deployment: c?.deployment ?? "",
    secret_ref: c?.secret_ref ?? "",
    is_enabled: c?.is_enabled ?? false,
    notes: c?.notes ?? "",
    archived: !!c?.archived_at,
  };
}

function ConnectionEditor({
  conn,
  adapters,
  configStatus,
  onClose,
  onSaved,
}: {
  conn: ConnectionRow | null;
  adapters: AdapterInfo[];
  configStatus: { configured: boolean; reason: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useDirtyForm(connFormFrom(conn, adapters));
  const v = form.value;
  const adapter = adapters.find((a) => a.id === v.adapter);
  const [saving, setSaving] = useState(false);
  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = "Nom obligatoire";
  if (v.base_url && !/^https:\/\/[^\s/]+(\/\S*)?$/.test(v.base_url))
    errors.base = "URL https:// valide attendue";
  if (adapter?.requiresBaseUrl && !v.base_url) errors.base = "Obligatoire pour cet adaptateur";
  if (v.secret_ref && !/^[A-Z][A-Z0-9_]{2,63}$/.test(v.secret_ref))
    errors.secret = "Nom de variable en MAJUSCULES (ex. CHANTAL_SECRET_AZURE)";
  if (/^(sk-|AIza|gsk_)/.test(v.secret_ref))
    errors.secret = "Ne saisissez jamais la clé elle-même : uniquement le nom de la variable";
  const valid = Object.keys(errors).length === 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    const p = {
      name: v.name.trim(),
      adapter: v.adapter,
      base_url: v.base_url.trim() || null,
      api_version: v.api_version.trim() || null,
      region: v.region.trim() || null,
      deployment: v.deployment.trim() || null,
      secret_ref: v.secret_ref.trim() || null,
      is_enabled: v.is_enabled,
      notes: v.notes.trim() || null,
      archived_at: v.archived ? (conn?.archived_at ?? new Date().toISOString()) : null,
    };
    const { error } = conn
      ? await supabase.from("ai_provider_connections").update(p).eq("id", conn.id)
      : await supabase.from("ai_provider_connections").insert(p);
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
      title={conn ? conn.name : "Nouvelle connexion"}
      subtitle={
        configStatus ? (
          configStatus.configured ? (
            <Badge tone="green">Configurée côté serveur</Badge>
          ) : (
            <Badge tone="amber">{configStatus.reason}</Badge>
          )
        ) : undefined
      }
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!form.dirty || !valid || saving}
            onClick={() => void save()}
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Nom"
          required
          value={v.name}
          onChange={(x) => form.patch({ name: x })}
          error={errors.name}
        />
        <SelectField
          label="Adaptateur"
          value={v.adapter}
          disabled={!!conn}
          onChange={(x) => form.patch({ adapter: x })}
          options={adapters.map((a) => ({ value: a.id, label: a.label }))}
          help={
            conn
              ? "L'adaptateur ne peut pas changer : créez une nouvelle connexion."
              : adapter?.description
          }
        />
        <TextField
          label="URL de base"
          value={v.base_url}
          onChange={(x) => form.patch({ base_url: x })}
          error={errors.base}
          mono
          help={
            adapter?.requiresBaseUrl
              ? "Endpoint compatible (ex. https://api.groq.com/openai/v1). L'hôte doit figurer dans AI_ALLOWED_HOSTS (environnement serveur)."
              : `Vide = endpoint officiel (${adapter?.defaultBaseUrl ?? "—"}).`
          }
        />
        <TextField
          label="Référence du secret (nom de variable d'environnement)"
          value={v.secret_ref}
          onChange={(x) => form.patch({ secret_ref: x.toUpperCase() })}
          error={errors.secret}
          mono
          help="La clé reste dans l'environnement serveur (Vercel / gestionnaire de secrets). Noms acceptés : OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, AZURE_OPENAI_API_KEY ou CHANTAL_SECRET_*."
        />
        <FormGrid cols={3}>
          <TextField
            label="Version d'API"
            value={v.api_version}
            onChange={(x) => form.patch({ api_version: x })}
            help="Ex. Azure : en-tête api-version"
          />
          <TextField label="Région" value={v.region} onChange={(x) => form.patch({ region: x })} />
          <TextField
            label="Déploiement"
            value={v.deployment}
            onChange={(x) => form.patch({ deployment: x })}
          />
        </FormGrid>
        <TextAreaField
          label="Notes"
          value={v.notes}
          onChange={(x) => form.patch({ notes: x })}
          rows={2}
        />
        <CheckboxField
          label="Connexion activée"
          checked={v.is_enabled}
          onChange={(x) => form.patch({ is_enabled: x })}
          help="Désactiver une connexion désactive immédiatement ses modèles actifs (aucun remplacement automatique)."
        />
        {conn && (
          <CheckboxField
            label="Archivée"
            checked={v.archived}
            onChange={(x) => form.patch({ archived: x })}
          />
        )}
        {conn?.last_test_at && (
          <p className="text-xs text-muted-foreground">
            Dernier test : {formatDate(conn.last_test_at)} —{" "}
            {conn.last_test_status === "success"
              ? "réussi"
              : `échec (${conn.last_test_error ?? ""})`}
          </p>
        )}
      </div>
    </EditorSheet>
  );
}
