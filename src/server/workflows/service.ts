import { createHash } from "node:crypto";
import { z } from "zod";
import {
  formatZodIssues,
  validateInputs,
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/lib/workflows/schema";
import { serverConfig } from "../env";
import { ApiError, badRequest, notFound } from "../http";
import type { AuthContext } from "../auth";
import { loadModel } from "../ai/gateway";
import { executeRun } from "./executor";

export const MAX_ATTEMPTS = 3;

export const runBodySchema = z.object({
  workflowId: z.string().uuid(),
  inputs: z.record(z.unknown()).default({}),
  idempotencyKey: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  retryOfRunId: z.string().uuid().optional(),
});

export function definitionHash(def: WorkflowDefinition): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(def)))
    .digest("hex");
}

export function parseDefinition(raw: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.safeParse(raw);
  if (!parsed.success)
    throw badRequest("Définition de workflow invalide", formatZodIssues(parsed.error));
  return parsed.data;
}

const RUN_COLUMNS =
  "id, workflow_id, version_id, is_test, status, output, output_format, error_code, error_message, attempt, parent_run_id, created_at, started_at, finished_at, duration_ms";

async function assertCapacity(ctx: AuthContext) {
  await ctx.admin.rpc("expire_stale_workflow_runs");
  const { count } = await ctx.admin
    .from("workflow_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .in("status", ["queued", "running"]);
  const max = serverConfig().workflowMaxActiveRunsPerUser;
  if ((count ?? 0) >= max)
    throw new ApiError(
      429,
      "too_many_runs",
      `Vous avez déjà ${max} exécution(s) en cours. Patientez leur fin.`,
    );
}

export async function startRun(
  ctx: AuthContext,
  body: z.infer<typeof runBodySchema>,
  signal?: AbortSignal,
) {
  // Lecture AU NOM de l'utilisateur : workflow publié + rôle suffisant (RLS)
  const { data: wf } = await ctx.db
    .from("workflow_definitions")
    .select("id, name, status, published_version_id")
    .eq("id", body.workflowId)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      published_version_id: string | null;
    }>();
  if (!wf || wf.status !== "published" || !wf.published_version_id)
    throw notFound("Workflow indisponible");

  let versionId = wf.published_version_id;
  let attempt = 1;
  let inputsRaw = body.inputs;
  if (body.retryOfRunId) {
    const { data: parent } = await ctx.db
      .from("workflow_runs")
      .select("id, workflow_id, version_id, status, attempt, inputs")
      .eq("id", body.retryOfRunId)
      .maybeSingle<{
        id: string;
        workflow_id: string;
        version_id: string;
        status: string;
        attempt: number;
        inputs: Record<string, unknown>;
      }>();
    if (!parent || parent.workflow_id !== wf.id) throw notFound("Exécution d'origine introuvable");
    if (!["failed", "timed_out", "cancelled"].includes(parent.status))
      throw badRequest("Seule une exécution en échec peut être relancée");
    if (parent.attempt >= MAX_ATTEMPTS)
      throw badRequest(`Nombre maximum de tentatives atteint (${MAX_ATTEMPTS})`);
    versionId = parent.version_id; // reprise sur la MÊME version
    attempt = parent.attempt + 1;
    inputsRaw = Object.keys(body.inputs).length ? body.inputs : parent.inputs;
  }

  const { data: version } = await ctx.db
    .from("workflow_versions")
    .select("id, version, definition")
    .eq("id", versionId)
    .maybeSingle<{ id: string; version: number; definition: unknown }>();
  if (!version) throw notFound("Version de workflow introuvable");
  const definition = parseDefinition(version.definition);
  const checked = validateInputs(definition.inputs, inputsRaw);
  if (!checked.ok) throw badRequest("Formulaire incomplet ou invalide", checked.errors);

  // Idempotence : même clé → même exécution (pas de double déclenchement)
  const { data: existing } = await ctx.admin
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("idempotency_key", body.idempotencyKey)
    .maybeSingle();
  if (existing) return { run: existing, duplicate: true };

  await assertCapacity(ctx);
  const { data: run, error } = await ctx.admin
    .from("workflow_runs")
    .insert({
      workflow_id: wf.id,
      version_id: version.id,
      user_id: ctx.userId,
      inputs: checked.values,
      idempotency_key: body.idempotencyKey,
      attempt,
      parent_run_id: body.retryOfRunId ?? null,
      status: "queued",
      deadline_at: new Date(
        Date.now() + definition.limits.timeoutSeconds * 1000 + 60_000,
      ).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (error?.code === "23505") {
    const { data: dup } = await ctx.admin
      .from("workflow_runs")
      .select(RUN_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("idempotency_key", body.idempotencyKey)
      .single();
    return { run: dup, duplicate: true };
  }
  if (error || !run) throw new ApiError(500, "run_error", "Création de l'exécution impossible");

  await executeRun({
    admin: ctx.admin,
    userId: ctx.userId,
    role: ctx.role,
    runId: run.id,
    workflowId: wf.id,
    definition,
    inputs: checked.values,
    isTest: false,
    signal,
  });
  const { data: final } = await ctx.admin
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("id", run.id)
    .single();
  return { run: final, duplicate: false };
}

async function loadDraft(ctx: AuthContext, workflowId: string) {
  const { data: wf } = await ctx.db
    .from("workflow_definitions")
    .select("id, name, draft")
    .eq("id", workflowId)
    .maybeSingle<{ id: string; name: string; draft: unknown }>();
  if (!wf) throw notFound("Workflow introuvable");
  return { wf, definition: parseDefinition(wf.draft) };
}

/** Vérifie que les ressources référencées existent et sont utilisables. */
async function checkReferences(ctx: AuthContext, def: WorkflowDefinition, forPublication: boolean) {
  const problems: string[] = [];
  for (const step of def.steps) {
    if (step.type === "llm" && step.modelId) {
      try {
        const { model, connection } = await loadModel(ctx.admin, step.modelId);
        if (forPublication && model.status !== "active")
          problems.push(`Étape « ${step.name} » : le modèle « ${model.name} » n'est pas actif`);
        if (forPublication && model.availability?.workflows === false)
          problems.push(
            `Étape « ${step.name} » : « ${model.name} » n'est pas disponible pour les workflows`,
          );
        if (!connection) problems.push(`Étape « ${step.name} » : modèle sans connexion`);
      } catch {
        problems.push(`Étape « ${step.name} » : modèle introuvable`);
      }
    }
    if (step.type === "http") {
      const { data } = await ctx.admin
        .from("workflow_http_connections")
        .select("is_enabled, name")
        .eq("id", step.connectionId)
        .maybeSingle<{ is_enabled: boolean; name: string }>();
      if (!data) problems.push(`Étape « ${step.name} » : connexion HTTP introuvable`);
      else if (!data.is_enabled)
        problems.push(`Étape « ${step.name} » : connexion « ${data.name} » désactivée`);
    }
  }
  if (problems.length)
    throw badRequest("Le workflow référence des ressources indisponibles", problems);
}

export async function testDraft(
  ctx: AuthContext,
  workflowId: string,
  inputs: Record<string, unknown>,
  idempotencyKey: string,
) {
  const { wf, definition } = await loadDraft(ctx, workflowId);
  await checkReferences(ctx, definition, false);
  const checked = validateInputs(definition.inputs, inputs);
  if (!checked.ok) throw badRequest("Valeurs de test invalides", checked.errors);
  await assertCapacity(ctx);
  const hash = definitionHash(definition);
  const { data: run, error } = await ctx.admin
    .from("workflow_runs")
    .insert({
      workflow_id: wf.id,
      version_id: null,
      is_test: true,
      test_definition_hash: hash,
      user_id: ctx.userId,
      inputs: checked.values,
      idempotency_key: idempotencyKey,
      status: "queued",
    })
    .select("id")
    .single<{ id: string }>();
  if (error?.code === "23505") throw new ApiError(409, "duplicate_request", "Test déjà lancé");
  if (error || !run) throw new ApiError(500, "run_error", "Création du test impossible");
  await executeRun({
    admin: ctx.admin,
    userId: ctx.userId,
    role: ctx.role,
    runId: run.id,
    workflowId: wf.id,
    definition,
    inputs: checked.values,
    isTest: true,
  });
  const { data: final } = await ctx.admin
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("id", run.id)
    .single();
  return { run: final, definitionHash: hash };
}

export async function publishDraft(ctx: AuthContext, workflowId: string, changeSummary: string) {
  const { definition } = await loadDraft(ctx, workflowId);
  await checkReferences(ctx, definition, true);
  const hash = definitionHash(definition);
  const { data: test } = await ctx.admin
    .from("workflow_runs")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("is_test", true)
    .eq("test_definition_hash", hash)
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();
  if (!test)
    throw badRequest("Lancez un test réussi de cette version exacte du brouillon avant de publier");
  const { data, error } = await ctx.admin.rpc("publish_workflow_version", {
    p_workflow_id: workflowId,
    p_definition: definition,
    p_definition_hash: hash,
    p_change_summary: changeSummary,
    p_actor: ctx.userId,
  });
  if (error) throw new ApiError(500, "publish_error", "Publication impossible");
  return data as { id: string; version: number };
}
