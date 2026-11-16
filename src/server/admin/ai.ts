/**
 * Administration du catalogue IA (super administrateurs).
 * Les lectures/écritures du catalogue passent par la RLS ; ce module fournit
 * ce que seul le serveur sait : présence des secrets, capacités réellement
 * exécutables, et tests réels auprès des fournisseurs.
 */
import { z } from "zod";
import type { AuthContext } from "../auth";
import { serverConfig } from "../env";
import { ApiError } from "../http";
import { describeAdapters, effectiveCapabilities } from "../ai/registry";
import { CONNECTION_COLUMNS, MODEL_COLUMNS, connectionStatus, providerErrorToApi, resolveModel, runCompletion, type ConnectionRow, type ModelRow } from "../ai/gateway";
import { ProviderError, sanitizeDetail } from "../ai/types";

export async function getAiStatus(ctx: AuthContext) {
  const cfg = serverConfig();
  const [{ data: conns }, { data: models }] = await Promise.all([
    ctx.admin.from("ai_provider_connections").select(CONNECTION_COLUMNS),
    ctx.admin.from("ai_models").select(`${MODEL_COLUMNS}, provider`),
  ]);
  const connections = ((conns ?? []) as ConnectionRow[]).map((c) => ({ id: c.id, adapter: c.adapter, ...connectionStatus(c, cfg) }));
  const byId = new Map(((conns ?? []) as ConnectionRow[]).map((c) => [c.id, c]));
  return {
    adapters: describeAdapters().filter((a) => a.id !== "mock" || cfg.aiEnableMockProvider),
    connections,
    models: ((models ?? []) as ModelRow[]).map((m) => {
      const conn = m.connection_id ? byId.get(m.connection_id) : undefined;
      const status = conn ? connectionStatus(conn, cfg) : { configured: false, reason: "Aucune connexion" };
      return { id: m.id, configured: status.configured, reason: status.reason, effectiveCapabilities: effectiveCapabilities(conn?.adapter ?? "", m.capabilities) };
    }),
    environment: {
      appEnv: cfg.appEnv,
      aiAllowedHosts: cfg.aiAllowedHosts,
      workflowHttpAllowedHosts: cfg.workflowHttpAllowedHosts,
      mockEnabled: cfg.aiEnableMockProvider,
      requestTimeoutMs: cfg.aiRequestTimeoutMs,
      maxConcurrentPerUser: cfg.aiMaxConcurrentPerUser,
    },
  };
}

export const testBodySchema = z.object({ modelId: z.string().uuid() });

/** Requête de contrôle réelle ; résultat (sans secret) enregistré sur le modèle et la connexion. */
export async function testModel(ctx: AuthContext, modelId: string) {
  const started = Date.now();
  let ok = false;
  let error: string | null = null;
  let reply: string | null = null;
  let connectionId: string | null = null;
  try {
    const resolved = await resolveModel(ctx.admin, modelId, { role: ctx.role, purpose: "test" });
    connectionId = resolved.connection.id;
    const r = await runCompletion({
      admin: ctx.admin,
      userId: ctx.userId,
      resolved,
      request: { messages: [{ role: "user", content: "Test de connexion CHANTAL. Réponds uniquement : OK" }], maxOutputTokens: 512 },
      meta: { source: "admin_test" },
      timeoutMs: 60_000,
      skipLimits: true,
    });
    reply = r.text.trim().slice(0, 200);
    ok = reply.length > 0;
    if (!ok) error = "Réponse vide du fournisseur";
  } catch (e) {
    const api = providerErrorToApi(e);
    const detail = e instanceof ProviderError && e.detail ? ` — ${e.detail}` : "";
    error = sanitizeDetail(`${api.message}${detail}`);
    if (e instanceof ApiError && e.code === "model_not_found") throw e;
  }
  const latency = Date.now() - started;
  const patch = { last_test_at: new Date().toISOString(), last_test_status: ok ? "success" : "error", last_test_error: error, last_test_latency_ms: latency };
  await ctx.admin.from("ai_models").update(patch).eq("id", modelId);
  if (connectionId) await ctx.admin.from("ai_provider_connections").update(patch).eq("id", connectionId);
  await ctx.admin.from("admin_audit_log").insert({
    actor_id: ctx.userId,
    actor_role: ctx.role,
    action: "test",
    entity_type: "ai_models",
    entity_id: modelId,
    summary: ok ? "Test réussi" : "Test en échec",
    changes: { latency_ms: latency, error },
  });
  const { data: model } = await ctx.admin.from("ai_models").select("id, last_test_at, last_test_status, last_test_error, last_test_latency_ms").eq("id", modelId).single();
  return { ok, error, reply, latencyMs: latency, model };
}
