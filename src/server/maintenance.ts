/**
 * Tâche de maintenance (cron Vercel, cf. vercel.json) :
 *  - exécutions de workflows orphelines → timed_out ;
 *  - événements d'usage restés « started » (instance interrompue) → error ;
 *  - purge selon les durées de rétention (app_settings).
 * Protégée par CRON_SECRET (en-tête Authorization: Bearer <secret>).
 */
import { timingSafeEqual } from "node:crypto";
import { getAdminClient } from "./auth";
import { serverConfig } from "./env";
import { ApiError, json } from "./http";

export async function handleMaintenance(request: Request): Promise<Response> {
  const cfg = serverConfig();
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expected = cfg.cronSecret ?? "";
  const ok =
    expected.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new ApiError(401, "unauthorized", "Non autorisé");
  const admin = getAdminClient();
  const { data: expired } = await admin.rpc("expire_stale_workflow_runs");
  const staleBefore = new Date(Date.now() - cfg.aiRequestTimeoutMs - 5 * 60_000).toISOString();
  const { count: abandoned } = await admin
    .from("ai_usage_events")
    .update(
      { status: "error", error_code: "abandoned", finished_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("status", "started")
    .lt("occurred_at", staleBefore);
  const { data: purged } = await admin.rpc("purge_expired_data");
  return json({ expiredRuns: expired ?? 0, abandonedUsageEvents: abandoned ?? 0, purged });
}
