/**
 * Passerelle IA : point d'entrée UNIQUE de tous les appels aux fournisseurs
 * (chat, workflows, titres, tests d'administration).
 *
 *  - résolution du modèle : statut, droits (min_role), disponibilité par usage,
 *    connexion activée, secret présent → sinon erreur explicite « Non configuré » ;
 *  - aucune bascule silencieuse vers un autre modèle ou fournisseur ;
 *  - quotas (requêtes/jour/utilisateur, tokens/mois) et concurrence ;
 *  - délai maximum + annulation (AbortSignal) ;
 *  - un événement d'usage par requête logique (créé « started », finalisé une fois).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasMinRole, type UserRole } from "@/lib/permissions";
import { isAllowedSecretName, readSecret, serverConfig, type ServerConfig } from "../env";
import { ApiError } from "../http";
import { assertSafeUrl, hostAllowed } from "../netGuard";
import { estimateCost, type PricingRow } from "./cost";
import { effectiveCapabilities, getAdapter } from "./registry";
import {
  ProviderError,
  type CapabilityMap,
  type ChatMessage,
  type CompletionRequest,
  type ProviderAdapter,
  type ResolvedConnection,
} from "./types";

export type Purpose = "chat" | "workflows" | "agents" | "title" | "test";

export interface ModelRow {
  id: string;
  name: string;
  api_model_id: string | null;
  connection_id: string | null;
  status: string;
  min_role: string;
  capabilities: CapabilityMap | null;
  default_params: { max_output_tokens?: number; temperature?: number } | null;
  param_limits: { max_output_tokens?: number; temperature_min?: number; temperature_max?: number } | null;
  availability: { chat?: boolean; agents?: boolean; workflows?: boolean } | null;
  quota_requests_per_user_day: number | null;
  quota_tokens_per_month: number | null;
  max_concurrency_per_user: number | null;
}

export interface ConnectionRow {
  id: string;
  name: string;
  adapter: string;
  base_url: string | null;
  api_version: string | null;
  region: string | null;
  deployment: string | null;
  secret_ref: string | null;
  is_enabled: boolean;
  archived_at: string | null;
}

export const MODEL_COLUMNS =
  "id, name, api_model_id, connection_id, status, min_role, capabilities, default_params, param_limits, availability, quota_requests_per_user_day, quota_tokens_per_month, max_concurrency_per_user";
export const CONNECTION_COLUMNS = "id, name, adapter, base_url, api_version, region, deployment, secret_ref, is_enabled, archived_at";

export interface ConfigStatus {
  configured: boolean;
  reason: string | null;
}

/** État de configuration d'une connexion, SANS appel réseau et sans exposer de secret. */
export function connectionStatus(conn: ConnectionRow, cfg: ServerConfig = serverConfig()): ConfigStatus {
  const adapter = getAdapter(conn.adapter);
  if (!adapter) return { configured: false, reason: `Adaptateur « ${conn.adapter} » non implémenté` };
  if (conn.adapter === "mock") {
    return cfg.aiEnableMockProvider
      ? { configured: true, reason: null }
      : { configured: false, reason: "Fournisseur fictif désactivé (AI_ENABLE_MOCK_PROVIDER, jamais en production)" };
  }
  if (conn.secret_ref) {
    if (!isAllowedSecretName(conn.secret_ref)) {
      return { configured: false, reason: `Nom de secret « ${conn.secret_ref} » non autorisé (utilisez CHANTAL_SECRET_… ou un nom standard)` };
    }
    if (!readSecret(conn.secret_ref)) return { configured: false, reason: `Variable d'environnement serveur « ${conn.secret_ref} » absente` };
  } else if (conn.adapter !== "openai_compatible") {
    return { configured: false, reason: "Référence de secret manquante" };
  }
  if (adapter.requiresBaseUrl && !conn.base_url) return { configured: false, reason: "URL de base obligatoire pour cet adaptateur" };
  if (conn.base_url) {
    let host: string;
    try {
      host = new URL(conn.base_url).hostname;
    } catch {
      return { configured: false, reason: "URL de base invalide" };
    }
    if (!hostAllowed(host, [...adapter.officialHosts, ...cfg.aiAllowedHosts])) {
      return { configured: false, reason: `Hôte « ${host} » absent de AI_ALLOWED_HOSTS` };
    }
  }
  return { configured: true, reason: null };
}

export interface ResolvedModel {
  model: ModelRow;
  connection: ConnectionRow;
  adapter: ProviderAdapter;
  capabilities: CapabilityMap;
}

export async function loadModel(admin: SupabaseClient, modelId: string): Promise<{ model: ModelRow; connection: ConnectionRow | null }> {
  const { data: model, error } = await admin.from("ai_models").select(MODEL_COLUMNS).eq("id", modelId).maybeSingle<ModelRow>();
  if (error) throw new ApiError(500, "db_error", "Lecture du modèle impossible");
  if (!model) throw new ApiError(404, "model_not_found", "Modèle introuvable");
  if (!model.connection_id) return { model, connection: null };
  const { data: connection } = await admin
    .from("ai_provider_connections")
    .select(CONNECTION_COLUMNS)
    .eq("id", model.connection_id)
    .maybeSingle<ConnectionRow>();
  return { model, connection: connection ?? null };
}

export async function resolveModel(
  admin: SupabaseClient,
  modelId: string,
  opts: { role: UserRole; purpose: Purpose },
): Promise<ResolvedModel> {
  const { model, connection } = await loadModel(admin, modelId);
  const label = `« ${model.name} »`;
  if (opts.purpose !== "test") {
    if (model.status !== "active") throw new ApiError(409, "model_unavailable", `Le modèle ${label} n'est pas disponible (${model.status === "archived" ? "archivé" : "désactivé"}).`);
    if (!hasMinRole(opts.role, model.min_role)) throw new ApiError(403, "forbidden", `Le modèle ${label} n'est pas accessible avec votre rôle.`);
    const key = opts.purpose === "title" ? "chat" : opts.purpose;
    if (model.availability && model.availability[key] === false) {
      throw new ApiError(409, "model_not_available_here", `Le modèle ${label} n'est pas proposé pour cet usage.`);
    }
  }
  if (!connection) throw new ApiError(503, "not_configured", `Modèle ${label} : non configuré (aucune connexion fournisseur).`);
  if (opts.purpose !== "test" && (!connection.is_enabled || connection.archived_at)) {
    throw new ApiError(503, "not_configured", `Modèle ${label} : connexion « ${connection.name} » désactivée.`);
  }
  const status = connectionStatus(connection);
  if (!status.configured) throw new ApiError(503, "not_configured", `Modèle ${label} : non configuré — ${status.reason}.`);
  if (!model.api_model_id) throw new ApiError(503, "not_configured", `Modèle ${label} : identifiant API manquant.`);
  const adapter = getAdapter(connection.adapter)!;
  return { model, connection, adapter, capabilities: effectiveCapabilities(connection.adapter, model.capabilities) };
}

async function checkLimits(admin: SupabaseClient, userId: string, m: ModelRow, cfg: ServerConfig) {
  const windowStart = new Date(Date.now() - cfg.aiRequestTimeoutMs - 60_000).toISOString();
  const maxConc = Math.min(m.max_concurrency_per_user ?? cfg.aiMaxConcurrentPerUser, cfg.aiMaxConcurrentPerUser);
  const { count: running } = await admin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "started")
    .gte("occurred_at", windowStart);
  if ((running ?? 0) >= maxConc) {
    throw new ApiError(429, "concurrency_limit", `Trop de requêtes simultanées (${maxConc} maximum). Patientez la fin des réponses en cours.`);
  }
  if (m.quota_requests_per_user_day) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("model_id", m.id)
      .neq("source", "admin_test")
      .gte("occurred_at", dayStart.toISOString());
    if ((count ?? 0) >= m.quota_requests_per_user_day) {
      throw new ApiError(429, "quota_exceeded", `Quota journalier atteint pour « ${m.name} » (${m.quota_requests_per_user_day} requêtes).`);
    }
  }
  if (m.quota_tokens_per_month) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data } = await admin
      .from("ai_usage_events")
      .select("input_tokens, output_tokens")
      .eq("model_id", m.id)
      .gte("occurred_at", monthStart.toISOString())
      .limit(100000);
    const used = (data ?? []).reduce((s, r: { input_tokens: number | null; output_tokens: number | null }) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
    if (used >= m.quota_tokens_per_month) {
      throw new ApiError(429, "quota_exceeded", `Quota mensuel de tokens atteint pour « ${m.name} ».`);
    }
  }
}

function assertCapabilities(messages: ChatMessage[], caps: CapabilityMap, modelName: string) {
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    if (m.content.some((p) => p.type === "image") && !caps.vision) {
      throw new ApiError(400, "capability_unsupported", `Le modèle « ${modelName} » n'accepte pas les images.`);
    }
    if (m.content.some((p) => p.type === "file") && !caps.files) {
      throw new ApiError(400, "capability_unsupported", `Le modèle « ${modelName} » n'accepte pas les fichiers PDF.`);
    }
  }
}

export interface CompletionMeta {
  source: "chat" | "workflow" | "title" | "admin_test";
  conversationId?: string | null;
  workflowId?: string | null;
  workflowRunId?: string | null;
  stepId?: string | null;
  agentId?: string | null;
  partnerId?: string | null;
  requestId?: string;
}

export interface CompletionResult {
  text: string;
  finishReason: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  estimatedCost: number | null;
  latencyMs: number | null;
  durationMs: number;
  usageEventId: string;
}

export interface RunCompletionOptions {
  admin: SupabaseClient;
  userId: string;
  resolved: ResolvedModel;
  request: Omit<CompletionRequest, "model" | "signal" | "maxOutputTokens" | "temperature"> & { maxOutputTokens?: number };
  meta: CompletionMeta;
  signal?: AbortSignal;
  timeoutMs?: number;
  onText?: (delta: string) => void;
  skipLimits?: boolean;
}

export async function runCompletion(opts: RunCompletionOptions): Promise<CompletionResult> {
  const cfg = serverConfig();
  const { admin, userId, resolved, meta } = opts;
  const { model, connection, adapter, capabilities } = resolved;
  assertCapabilities(opts.request.messages, capabilities, model.name);
  if (opts.request.responseFormat === "json" && !capabilities.structured_output) {
    throw new ApiError(400, "capability_unsupported", `Le modèle « ${model.name} » ne garantit pas une sortie JSON.`);
  }
  if (!opts.skipLimits) await checkLimits(admin, userId, model, cfg);

  // Paramètres : défauts du modèle bornés par ses limites
  const limits = model.param_limits ?? {};
  let maxOut = opts.request.maxOutputTokens ?? model.default_params?.max_output_tokens ?? 4000;
  if (limits.max_output_tokens) maxOut = Math.min(maxOut, limits.max_output_tokens);
  let temperature: number | undefined;
  if (adapter.supportsTemperature && typeof model.default_params?.temperature === "number") {
    temperature = model.default_params.temperature;
    if (limits.temperature_min !== undefined) temperature = Math.max(temperature, limits.temperature_min);
    if (limits.temperature_max !== undefined) temperature = Math.min(temperature, limits.temperature_max);
  }

  // URL : vérification anti-SSRF au moment de l'appel (résolution DNS)
  if (connection.base_url) await assertSafeUrl(connection.base_url, { allowlist: [...adapter.officialHosts, ...cfg.aiAllowedHosts] });

  const conn: ResolvedConnection = {
    adapter: adapter.id,
    baseUrl: connection.base_url,
    apiVersion: connection.api_version,
    region: connection.region,
    deployment: connection.deployment,
    apiKey: readSecret(connection.secret_ref),
  };

  const requestId = meta.requestId ?? randomUUID();
  const { data: ev, error: evErr } = await admin
    .from("ai_usage_events")
    .insert({
      request_id: requestId,
      user_id: userId,
      source: meta.source,
      status: "started",
      conversation_id: meta.conversationId ?? null,
      workflow_id: meta.workflowId ?? null,
      workflow_run_id: meta.workflowRunId ?? null,
      step_id: meta.stepId ?? null,
      model_id: model.id,
      api_model_id: model.api_model_id,
      adapter: adapter.id,
      connection_id: connection.id,
      agent_id: meta.agentId ?? null,
      partner_id: meta.partnerId ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (evErr || !ev) {
    if (evErr?.code === "23505") throw new ApiError(409, "duplicate_request", "Requête déjà traitée (double envoi détecté).");
    throw new ApiError(500, "usage_error", "Impossible d'enregistrer la requête");
  }

  const timeoutMs = Math.min(opts.timeoutMs ?? cfg.aiRequestTimeoutMs, cfg.aiRequestTimeoutMs);
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutCtrl.signal]) : timeoutCtrl.signal;

  const started = Date.now();
  let latencyMs: number | null = null;
  let text = "";
  let finishReason: string | null = null;
  let usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } = {};

  const finalize = async (status: "success" | "error" | "cancelled", errorCode: string | null) => {
    const durationMs = Date.now() - started;
    let estimatedCost: number | null = null;
    let pricingId: string | null = null;
    let currency: string | null = null;
    if (status === "success") {
      const { data: pricing } = await admin
        .from("ai_model_pricing")
        .select("id, currency, input_per_mtok, output_per_mtok, cached_input_per_mtok, effective_from")
        .eq("model_id", model.id)
        .lte("effective_from", new Date().toISOString().slice(0, 10))
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle<PricingRow>();
      estimatedCost = estimateCost(pricing, usage);
      if (estimatedCost !== null && pricing) {
        pricingId = pricing.id;
        currency = pricing.currency;
      }
    }
    await admin
      .from("ai_usage_events")
      .update({
        status,
        error_code: errorCode,
        finished_at: new Date().toISOString(),
        latency_ms: latencyMs,
        duration_ms: durationMs,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        cached_input_tokens: usage.cachedInputTokens ?? null,
        estimated_cost: estimatedCost,
        cost_currency: currency,
        pricing_id: pricingId,
      })
      .eq("id", ev.id)
      .eq("status", "started"); // finalisation unique
    return { durationMs, estimatedCost };
  };

  try {
    for await (const event of adapter.stream(conn, {
      ...opts.request,
      model: model.api_model_id!,
      maxOutputTokens: maxOut,
      temperature,
      signal,
    })) {
      if (event.type === "text") {
        if (latencyMs === null) latencyMs = Date.now() - started;
        text += event.text;
        opts.onText?.(event.text);
      } else if (event.type === "usage") {
        usage = {
          inputTokens: event.inputTokens ?? usage.inputTokens,
          outputTokens: event.outputTokens ?? usage.outputTokens,
          cachedInputTokens: event.cachedInputTokens ?? usage.cachedInputTokens,
        };
      } else if (event.type === "finish") {
        finishReason = event.reason;
      }
    }
    if (signal.aborted) throw new ProviderError(timeoutCtrl.signal.aborted ? "timeout" : "cancelled");
    const { durationMs, estimatedCost } = await finalize("success", null);
    return { text, finishReason, ...usage, estimatedCost, latencyMs, durationMs, usageEventId: ev.id };
  } catch (e) {
    const pe =
      e instanceof ProviderError
        ? e.code === "cancelled" && timeoutCtrl.signal.aborted
          ? new ProviderError("timeout")
          : e
        : new ProviderError("unknown", undefined, e instanceof Error ? e.message.slice(0, 300) : undefined);
    await finalize(pe.code === "cancelled" ? "cancelled" : "error", pe.code);
    throw Object.assign(pe, { usageEventId: ev.id, partialText: text });
  } finally {
    clearTimeout(timer);
  }
}

/** Erreur fournisseur → réponse API (message utilisateur, détail réservé aux logs). */
export function providerErrorToApi(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ProviderError) {
    const status = e.code === "rate_limit" ? 429 : e.code === "timeout" ? 504 : e.code === "cancelled" ? 499 : 502;
    return new ApiError(status, `provider_${e.code}`, e.message);
  }
  return new ApiError(500, "internal", "Erreur interne du serveur");
}
