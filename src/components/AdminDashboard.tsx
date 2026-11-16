/**
 * Reporting d'usage (administrateurs). Source : RPC report_usage (agrégats
 * calculés en base, aucune donnée de contenu). Indicateurs définis dans
 * docs/03-fonctionnement-metier.md § Reporting.
 *  - « — » = donnée indisponible (fournisseur sans tokens, tarif absent…),
 *    distinct de 0 ;
 *  - les coûts sont des ESTIMATIONS fondées sur les tarifs saisis et datés ;
 *  - les tests d'administration sont exclus par défaut.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Download,
  RefreshCw,
  Users,
  MessageSquare,
  Zap,
  Timer,
  Coins,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { hasPermission } from "@/lib/permissions";
import { errorMessage } from "@/lib/api";
import { downloadText } from "@/lib/workflowsClient";
import { demoReport } from "@/lib/reportingDemo";

type N = number | null;
export interface UsageReport {
  period: { from: string; to: string };
  instrumentation_since: string | null;
  kpis: {
    active_users: number;
    requests: number;
    success: number;
    errors: number;
    cancelled: number;
    latency_avg_ms: N;
    latency_p95_ms: N;
    duration_avg_ms: N;
    input_tokens: N;
    output_tokens: N;
    requests_with_tokens: number;
    estimated_cost: N;
    requests_with_cost: number;
    currencies: string[];
    conversations_created: number;
    workflow_runs: number;
    workflow_runs_succeeded: number;
    workflow_runs_failed: number;
    workflow_retries: number;
  };
  by_model: {
    model_id: string | null;
    name: string;
    provider: string | null;
    requests: number;
    errors: number;
    input_tokens: N;
    output_tokens: N;
    requests_with_tokens: number;
    estimated_cost: N;
    requests_with_cost: number;
    latency_avg_ms: N;
  }[];
  by_provider: {
    provider: string;
    requests: number;
    errors: number;
    estimated_cost: N;
    requests_with_cost: number;
  }[];
  by_agent: { agent_id: string; name: string; requests: number; users: number; errors: number }[];
  by_source: { source: string; requests: number; errors: number }[];
  by_workflow: {
    workflow_id: string;
    name: string;
    runs: number;
    succeeded: number;
    failed: number;
    retries: number;
    avg_duration_ms: N;
    estimated_cost: N;
    requests_without_cost: number;
  }[];
  daily: {
    day: string;
    requests: number;
    errors: number;
    active_users: number;
    estimated_cost: N;
  }[];
  pricing_used: {
    model: string;
    effective_from: string;
    currency: string;
    source_url: string | null;
  }[];
}

type Range = "7d" | "30d" | "90d" | "custom";
const fmt = (n: N, digits = 0) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: digits });
const ms = (n: N) =>
  n == null ? "—" : n < 1000 ? `${Math.round(Number(n))} ms` : `${(Number(n) / 1000).toFixed(1)} s`;
const SOURCE_LABEL: Record<string, string> = {
  chat: "Chat",
  workflow: "Workflows",
  title: "Titres automatiques",
  admin_test: "Tests admin",
};

function rangeDates(range: Range, from: string, to: string) {
  if (range === "custom")
    return {
      from: new Date(from).toISOString(),
      to: new Date(new Date(to).getTime() + 86400000).toISOString(),
    };
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return {
    from: new Date(Date.now() - days * 86400000).toISOString(),
    to: new Date(Date.now() + 60000).toISOString(),
  };
}

export function AdminDashboard() {
  const { profile } = useAuth();
  const canExport = hasPermission(profile?.role, "reporting.export");
  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));
  const [modelId, setModelId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<{
    models: { id: string; name: string }[];
    agents: { id: string; name: string }[];
    workflows: { id: string; name: string }[];
  }>({ models: [], agents: [], workflows: [] });

  useEffect(() => {
    void Promise.all([
      supabase.from("ai_models").select("id, name").order("name"),
      supabase.from("agents").select("id, name").order("name"),
      supabase.from("workflow_definitions").select("id, name").order("name"),
      supabase.from("app_settings").select("value").eq("key", "reporting_demo_mode").maybeSingle(),
    ]).then(([m, a, w, s]) => {
      setOptions({
        models: (m.data ?? []) as { id: string; name: string }[],
        agents: (a.data ?? []) as { id: string; name: string }[],
        workflows: (w.data ?? []) as { id: string; name: string }[],
      });
      setDemo((s.data as { value?: unknown } | null)?.value === true);
    });
  }, []);

  const params = useMemo(() => {
    const d = rangeDates(range, customFrom, customTo);
    return {
      p_from: d.from,
      p_to: d.to,
      p_model_ids: modelId ? [modelId] : null,
      p_agent_ids: agentId ? [agentId] : null,
      p_workflow_ids: workflowId ? [workflowId] : null,
      p_include_tests: includeTests,
    };
  }, [range, customFrom, customTo, modelId, agentId, workflowId, includeTests]);

  const load = useCallback(async () => {
    setLoading(true);
    if (demo) {
      setReport(demoReport(params.p_from, params.p_to));
      setLoading(false);
      return;
    }
    const { data, error: e } = await supabase.rpc("report_usage", params);
    if (e) {
      setError(errorMessage(e));
      setReport(null);
    } else {
      setError(null);
      setReport(data as UsageReport);
    }
    setLoading(false);
  }, [params, demo]);
  useEffect(() => void load(), [load]);

  async function exportCsv() {
    const { data, error: e } = await supabase.rpc("report_usage_rows", params);
    if (e) {
      toast.error(errorMessage(e));
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    if (!rows.length) {
      toast.info("Aucune donnée à exporter sur cette période");
      return;
    }
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
    downloadText(
      "﻿" +
        [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n"),
      `chantal-usage-${params.p_from.slice(0, 10)}_${params.p_to.slice(0, 10)}.csv`,
      "text/csv",
    );
  }

  const k = report?.kpis;
  const empty =
    !loading &&
    report &&
    k &&
    k.requests === 0 &&
    k.workflow_runs === 0 &&
    k.conversations_created === 0;
  const currency =
    k?.currencies?.length === 1 ? k.currencies[0] : k?.currencies?.length ? "devises mixtes" : "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reporting d'usage</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Usages réels mesurés côté serveur. Aucun contenu de conversation n'est exploité.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Actualiser
            </button>
            {canExport && !demo && (
              <button
                type="button"
                onClick={() => void exportCsv()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </div>
        </div>

        {demo && (
          <div
            role="alert"
            className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-800"
          >
            MODE DÉMONSTRATION — données fictives (paramètre « reporting_demo_mode »). Ne pas
            utiliser pour piloter.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <label className="text-xs">
            Période
            <br />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="90d">90 derniers jours</option>
              <option value="custom">Personnalisée</option>
            </select>
          </label>
          {range === "custom" && (
            <>
              <label className="text-xs">
                Du
                <br />
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Au
                <br />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            </>
          )}
          {(
            [
              ["Modèle", modelId, setModelId, options.models],
              ["Agent", agentId, setAgentId, options.agents],
              ["Workflow", workflowId, setWorkflowId, options.workflows],
            ] as const
          ).map(([l, val, set, opts]) => (
            <label key={l} className="text-xs">
              {l}
              <br />
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="mt-1 max-w-[12rem] rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Tous</option>
                {opts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-xs pb-2">
            <input
              type="checkbox"
              checked={includeTests}
              onChange={(e) => setIncludeTests(e.target.checked)}
            />{" "}
            Inclure les tests admin
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}
        {empty && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Info className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Aucune activité mesurée sur cette période.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {report?.instrumentation_since
                ? `Mesure active depuis le ${new Date(report.instrumentation_since).toLocaleDateString("fr-FR")}.`
                : "La mesure démarre avec les premiers usages après mise en production de cette version."}
            </p>
          </div>
        )}

        {report && k && !empty && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi
                icon={<Users className="w-4 h-4" />}
                label="Utilisateurs actifs"
                value={fmt(k.active_users)}
                hint="Au moins une requête IA ou une exécution sur la période"
              />
              <Kpi
                icon={<MessageSquare className="w-4 h-4" />}
                label="Requêtes IA"
                value={fmt(k.requests)}
                sub={`${fmt(k.errors)} en erreur · ${fmt(k.conversations_created)} conversations créées`}
              />
              <Kpi
                icon={<Zap className="w-4 h-4" />}
                label="Exécutions de workflows"
                value={fmt(k.workflow_runs)}
                sub={`${fmt(k.workflow_runs_succeeded)} réussies · ${fmt(k.workflow_runs_failed)} échecs · ${fmt(k.workflow_retries)} relances`}
              />
              <Kpi
                icon={<Timer className="w-4 h-4" />}
                label="Latence (1er token)"
                value={ms(k.latency_avg_ms)}
                sub={`p95 ${ms(k.latency_p95_ms)} · durée moy. ${ms(k.duration_avg_ms)}`}
              />
              <Kpi
                icon={<Coins className="w-4 h-4" />}
                label={`Coût estimé${currency ? ` (${currency})` : ""}`}
                value={fmt(k.estimated_cost, 2)}
                sub={`Couverture : ${fmt(k.requests_with_cost)} / ${fmt(k.requests)} requêtes`}
                warn={k.requests_with_cost < k.requests}
                hint="Estimation selon les tarifs saisis ; « — » si aucun tarif ou token disponible"
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Tokens d'entrée"
                value={fmt(k.input_tokens)}
                sub={`${fmt(k.requests_with_tokens)} / ${fmt(k.requests)} requêtes renseignées`}
                warn={k.requests_with_tokens < k.requests}
              />
              <Kpi label="Tokens de sortie" value={fmt(k.output_tokens)} />
              {report.by_source.map((s) => (
                <Kpi
                  key={s.source}
                  label={SOURCE_LABEL[s.source] ?? s.source}
                  value={fmt(s.requests)}
                  sub={`${fmt(s.errors)} erreurs`}
                />
              ))}
            </div>

            <Panel title="Requêtes par jour">
              {report.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune requête.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(d: string) => d.slice(5)}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar
                        dataKey="requests"
                        name="Requêtes"
                        fill="oklch(0.45 0.18 265 / 0.75)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="errors"
                        name="Erreurs"
                        fill="oklch(0.6 0.2 25 / 0.7)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Par modèle">
                <Table
                  headers={[
                    "Modèle",
                    "Fournisseur",
                    "Requêtes",
                    "Erreurs",
                    "Tokens (E/S)",
                    "Coût estimé",
                    "Latence",
                  ]}
                  rows={report.by_model.map((m) => [
                    m.name,
                    m.provider ?? "—",
                    fmt(m.requests),
                    fmt(m.errors),
                    m.requests_with_tokens
                      ? `${fmt(m.input_tokens)} / ${fmt(m.output_tokens)}`
                      : "—",
                    m.requests_with_cost ? fmt(m.estimated_cost, 2) : "—",
                    ms(m.latency_avg_ms),
                  ])}
                />
              </Panel>
              <Panel title="Par fournisseur">
                <Table
                  headers={["Fournisseur", "Requêtes", "Erreurs", "Coût estimé"]}
                  rows={report.by_provider.map((p) => [
                    p.provider,
                    fmt(p.requests),
                    fmt(p.errors),
                    p.requests_with_cost ? fmt(p.estimated_cost, 2) : "—",
                  ])}
                />
              </Panel>
              <Panel title="Par agent">
                <Table
                  headers={["Agent", "Requêtes", "Utilisateurs", "Erreurs"]}
                  rows={report.by_agent.map((a) => [
                    a.name,
                    fmt(a.requests),
                    fmt(a.users),
                    fmt(a.errors),
                  ])}
                />
              </Panel>
              <Panel title="Par workflow">
                <Table
                  headers={[
                    "Workflow",
                    "Exécutions",
                    "Réussies",
                    "Échecs",
                    "Relances",
                    "Durée moy.",
                    "Coût estimé",
                  ]}
                  rows={report.by_workflow.map((w) => [
                    w.name,
                    fmt(w.runs),
                    fmt(w.succeeded),
                    fmt(w.failed),
                    fmt(w.retries),
                    ms(w.avg_duration_ms),
                    w.requests_without_cost > 0 && w.estimated_cost == null
                      ? "—"
                      : fmt(w.estimated_cost, 2),
                  ])}
                />
              </Panel>
            </div>

            <Panel title="Tarifs utilisés pour les estimations">
              {report.pricing_used.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun tarif appliqué sur la période : les coûts sont indisponibles. Saisissez les
                  tarifs dans Admin › Modèles IA.
                </p>
              ) : (
                <Table
                  headers={["Modèle", "Tarif en vigueur depuis", "Devise", "Source"]}
                  rows={report.pricing_used.map((p) => [
                    p.model,
                    new Date(p.effective_from).toLocaleDateString("fr-FR"),
                    p.currency,
                    p.source_url ?? "—",
                  ])}
                />
              )}
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                Les paliers « long contexte » des fournisseurs ne sont pas modélisés : le coût réel
                peut être supérieur pour les très longues requêtes. Seule la facture du fournisseur
                fait foi.
              </p>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  hint,
  warn,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4" title={hint}>
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        {icon && <span className="text-brand">{icon}</span>}
        {label}
        {warn && (
          <AlertTriangle className="w-3 h-3 text-amber-600" aria-label="Données partielles" />
        )}
      </div>
      <div className="text-xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-[0.7rem] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground text-left">
            {headers.map((h) => (
              <th key={h} scope="col" className="py-1.5 pr-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j > 0 ? "tabular-nums" : "font-medium"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
