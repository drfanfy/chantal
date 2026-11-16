/**
 * Orchestrateur d'exécution des workflows.
 *
 * Exécution séquentielle dans la requête serveur (Vercel Function, 300 s max) :
 * chaque étape est persistée (workflow_run_steps) pour que le client suive la
 * progression réelle par interrogation. `executeRun` ne dépend pas du
 * transport HTTP : un worker / une file pourra l'appeler tel quel
 * (cf. docs/07-exploitation.md, « traitements longs »).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";
import { renderTemplate, type TemplateScope } from "@/lib/workflows/template";
import type { HttpStep, LlmStep, WorkflowDefinition } from "@/lib/workflows/schema";
import { readSecret, serverConfig } from "../env";
import { ApiError } from "../http";
import { assertSafeUrl, safeFetch } from "../netGuard";
import { resolveModel, runCompletion } from "../ai/gateway";
import { ProviderError } from "../ai/types";
import { evaluateCondition, extractJson, preview, runTransform, StepError } from "./ops";

export interface ExecuteRunOptions {
  admin: SupabaseClient;
  userId: string;
  role: UserRole;
  runId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  inputs: Record<string, unknown>;
  isTest: boolean;
  signal?: AbortSignal;
}

export interface RunOutcome {
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  output: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface HttpConnectionRow {
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
}

async function runLlmStep(o: ExecuteRunOptions, step: LlmStep, scope: TemplateScope, signal: AbortSignal, remainingMs: number) {
  if (!step.modelId) throw new StepError("model_missing", "Aucun modèle choisi pour cette étape");
  // Test administrateur : modèle non encore activé autorisé, mais connexion configurée exigée.
  const resolved = await resolveModel(o.admin, step.modelId, { role: o.role, purpose: o.isTest ? "test" : "workflows" });
  let system = renderTemplate(step.system ?? "", scope).text;
  if (step.agentId) {
    const { data: agent } = await o.admin.from("agents").select("system_prompt, is_active, archived_at").eq("id", step.agentId).maybeSingle<{ system_prompt: string | null; is_active: boolean; archived_at: string | null }>();
    if (!agent || !agent.is_active || agent.archived_at) throw new StepError("agent_unavailable", "Agent indisponible");
    system = [agent.system_prompt ?? "", system].filter(Boolean).join("\n\n");
  }
  const prompt = renderTemplate(step.prompt, scope).text;
  const result = await runCompletion({
    admin: o.admin,
    userId: o.userId,
    resolved,
    request: { system: system || undefined, messages: [{ role: "user", content: prompt }], maxOutputTokens: step.maxOutputTokens, responseFormat: step.responseFormat },
    meta: { source: o.isTest ? "admin_test" : "workflow", workflowId: o.workflowId, workflowRunId: o.runId, stepId: step.id, agentId: step.agentId ?? null, requestId: `wf:${o.runId}:${step.id}` },
    signal,
    timeoutMs: Math.max(1000, remainingMs),
    skipLimits: false,
  });
  let value: unknown = result.text;
  if (step.responseFormat === "json") {
    try {
      value = JSON.parse(extractJson(result.text));
    } catch {
      throw new StepError("invalid_json", "Le modèle n'a pas renvoyé de JSON valide");
    }
  }
  return { value, usageEventId: result.usageEventId };
}

async function runHttpStep(o: ExecuteRunOptions, step: HttpStep, scope: TemplateScope, signal: AbortSignal, remainingMs: number) {
  const cfg = serverConfig();
  const { data: conn } = await o.admin
    .from("workflow_http_connections")
    .select("id, name, base_url, auth_type, auth_header_name, secret_ref, allowed_methods, timeout_ms, max_response_bytes, is_enabled")
    .eq("id", step.connectionId)
    .maybeSingle<HttpConnectionRow>();
  if (!conn) throw new StepError("connection_missing", "Connexion HTTP introuvable");
  if (!conn.is_enabled) throw new StepError("connection_disabled", `Connexion « ${conn.name} » désactivée`);
  if (!conn.allowed_methods.includes(step.method)) throw new StepError("method_not_allowed", `Méthode ${step.method} non autorisée pour « ${conn.name} »`);
  const headers: Record<string, string> = { accept: "application/json, text/plain;q=0.9", "user-agent": "CHANTAL-Workflows/1.0" };
  if (conn.auth_type !== "none") {
    const secret = readSecret(conn.secret_ref);
    if (!secret) throw new StepError("not_configured", `Connexion « ${conn.name} » : secret serveur non configuré`);
    if (conn.auth_type === "bearer") headers.authorization = `Bearer ${secret}`;
    else headers[(conn.auth_header_name ?? "x-api-key").toLowerCase()] = secret;
  }
  // Valeurs encodées dans le chemin : impossible de sortir de l'URL de base.
  const path = step.path.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m) => encodeURIComponent(renderTemplate(m, scope).text));
  const url = await assertSafeUrl(conn.base_url.replace(/\/+$/, "") + path, { allowlist: cfg.workflowHttpAllowedHosts });
  let body: string | undefined;
  if (step.method !== "GET" && step.body.trim()) {
    body = renderTemplate(step.body, scope, { escape: "json" }).text;
    try {
      JSON.parse(body);
    } catch {
      throw new StepError("invalid_body", "Le corps de requête généré n'est pas un JSON valide");
    }
    headers["content-type"] = "application/json";
  }
  const res = await safeFetch(url, {
    method: step.method,
    headers,
    body,
    timeoutMs: Math.min(conn.timeout_ms, Math.max(1000, remainingMs)),
    maxBytes: conn.max_response_bytes,
    signal,
  });
  if (res.status >= 400) throw new StepError("http_error", `Le service « ${conn.name} » a répondu ${res.status}`);
  let value: unknown = res.text;
  try {
    value = JSON.parse(res.text);
  } catch {
    /* réponse texte */
  }
  if (step.responsePath) {
    const parts = step.responsePath.split(".");
    let cur: unknown = value;
    for (const p of parts) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
    if (cur === undefined) throw new StepError("json_path_missing", `Champ « ${step.responsePath} » absent de la réponse`);
    value = cur;
  }
  return { value };
}

export async function executeRun(o: ExecuteRunOptions): Promise<RunOutcome> {
  const { admin, runId, definition } = o;
  const timeoutMs = definition.limits.timeoutSeconds * 1000;
  const deadline = Date.now() + timeoutMs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  const signal = o.signal ? AbortSignal.any([o.signal, ctrl.signal]) : ctrl.signal;

  await admin.from("workflow_run_steps").insert(
    definition.steps.map((s, i) => ({ run_id: runId, step_id: s.id, step_type: s.type, step_name: s.name, position: i, status: "pending" })),
  );
  const startedAt = Date.now();
  await admin
    .from("workflow_runs")
    .update({ status: "running", started_at: new Date(startedAt).toISOString(), deadline_at: new Date(deadline + 30_000).toISOString() })
    .eq("id", runId);

  const scope: TemplateScope = { inputs: o.inputs, vars: {} as Record<string, unknown> };
  const vars = scope.vars as Record<string, unknown>;
  const setStep = (stepId: string, patch: Record<string, unknown>) =>
    admin.from("workflow_run_steps").update(patch).eq("run_id", runId).eq("step_id", stepId);

  let outcome: RunOutcome = { status: "succeeded", output: null, errorCode: null, errorMessage: null };
  let stopped: string | null = null;

  try {
    for (const step of definition.steps) {
      if (stopped !== null) {
        await setStep(step.id, { status: "skipped" });
        continue;
      }
      if (signal.aborted) throw new StepError(ctrl.signal.aborted ? "timeout" : "cancelled", ctrl.signal.aborted ? "Délai maximum du workflow dépassé" : "Exécution annulée");
      if (step.when && !evaluateCondition(step.when, scope)) {
        await setStep(step.id, { status: "skipped", output_preview: "Condition non remplie" });
        continue;
      }
      const t0 = Date.now();
      await admin.from("workflow_runs").update({ current_step_id: step.id }).eq("id", runId);
      await setStep(step.id, { status: "running", started_at: new Date(t0).toISOString() });
      try {
        let value: unknown;
        let usageEventId: string | null = null;
        const remaining = deadline - Date.now();
        switch (step.type) {
          case "llm": {
            const r = await runLlmStep(o, step, scope, signal, remaining);
            value = r.value;
            usageEventId = r.usageEventId;
            break;
          }
          case "transform":
            value = runTransform(step, scope);
            break;
          case "condition": {
            value = evaluateCondition(step.condition, scope);
            if (!value && step.onFalse === "stop") stopped = step.stopMessage?.trim() || "Le workflow s'est arrêté : condition non remplie.";
            break;
          }
          case "http":
            value = (await runHttpStep(o, step, scope, signal, remaining)).value;
            break;
        }
        vars[step.outputVar] = value;
        await setStep(step.id, {
          status: "succeeded",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          output_preview: preview(value),
          usage_event_id: usageEventId,
        });
      } catch (e) {
        const msg = e instanceof StepError || e instanceof ApiError || e instanceof ProviderError ? e.message : "Erreur inattendue";
        await setStep(step.id, { status: "failed", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, error_message: msg });
        throw e;
      }
    }
    const output = stopped ?? renderTemplate(definition.output.template, scope).text;
    if (definition.output.format === "json" && stopped === null) {
      try {
        JSON.parse(output);
      } catch {
        throw new StepError("invalid_output", "La sortie finale n'est pas un JSON valide");
      }
    }
    outcome = { status: "succeeded", output, errorCode: null, errorMessage: null };
  } catch (e) {
    const timedOut = ctrl.signal.aborted || (e instanceof ProviderError && e.code === "timeout") || (e instanceof StepError && e.code === "timeout");
    const cancelled = !timedOut && (o.signal?.aborted || (e instanceof ProviderError && e.code === "cancelled"));
    const code = e instanceof StepError || e instanceof ApiError ? e.code : e instanceof ProviderError ? `provider_${e.code}` : "internal";
    const message = e instanceof StepError || e instanceof ApiError || e instanceof ProviderError ? e.message : "Erreur inattendue pendant l'exécution";
    outcome = { status: timedOut ? "timed_out" : cancelled ? "cancelled" : "failed", output: null, errorCode: timedOut ? "timeout" : code, errorMessage: timedOut ? "Délai maximum du workflow dépassé" : message };
    await admin.from("workflow_run_steps").update({ status: "skipped" }).eq("run_id", runId).eq("status", "pending");
  } finally {
    clearTimeout(timer);
  }

  await admin
    .from("workflow_runs")
    .update({
      status: outcome.status,
      output: outcome.output,
      output_format: definition.output.format,
      error_code: outcome.errorCode,
      error_message: outcome.errorMessage,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      current_step_id: null,
    })
    .eq("id", runId);
  return outcome;
}
