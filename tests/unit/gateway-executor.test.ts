/**
 * Intégration serveur : passerelle IA + moteur de workflows + fournisseur
 * fictif, sur un faux client Supabase en mémoire.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { FakeDb } from "./fakeSupabase";
import { resolveModel, runCompletion } from "@/server/ai/gateway";
import { executeRun } from "@/server/workflows/executor";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";

const USER = "00000000-0000-4000-8000-000000000001";
const MODEL = "00000000-0000-4000-8000-0000000000aa";
const HTTP = "00000000-0000-4000-8000-0000000000bb";
let db: FakeDb;

beforeAll(() => {
  process.env.APP_ENV = "development";
  process.env.AI_ENABLE_MOCK_PROVIDER = "true";
  process.env.WORKFLOW_HTTP_ALLOWED_HOSTS = "api.partenaire.example";
});

beforeEach(() => {
  db = new FakeDb();
  db.tables.ai_provider_connections = [
    { id: "c1", name: "Fictif", adapter: "mock", base_url: null, api_version: null, region: null, deployment: null, secret_ref: null, is_enabled: true, archived_at: null },
  ];
  db.tables.ai_models = [
    {
      id: MODEL, name: "Modèle fictif", api_model_id: "mock-1", connection_id: "c1", status: "active", min_role: "beta_tester",
      capabilities: { text: true, streaming: true, structured_output: true }, default_params: {}, param_limits: { max_output_tokens: 500 },
      availability: { chat: true, workflows: true }, quota_requests_per_user_day: 3, quota_tokens_per_month: null, max_concurrency_per_user: null,
    },
  ];
  db.tables.ai_model_pricing = [
    { id: "p1", model_id: MODEL, currency: "USD", input_per_mtok: "1", output_per_mtok: "2", cached_input_per_mtok: null, effective_from: "2020-01-01" },
  ];
  db.tables.workflow_http_connections = [
    { id: HTTP, name: "Interne", base_url: "https://intranet.quartus.local", auth_type: "none", auth_header_name: null, secret_ref: null, allowed_methods: ["POST"], timeout_ms: 5000, max_response_bytes: 10000, is_enabled: true },
  ];
});

const admin = () => db.client();

describe("passerelle IA", () => {
  it("un seul événement d'usage par requête, finalisé avec tokens, latence et coût", async () => {
    const resolved = await resolveModel(admin(), MODEL, { role: "beta_tester", purpose: "chat" });
    const deltas: string[] = [];
    const r = await runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "Bonjour" }] }, meta: { source: "chat", requestId: "req-1" }, onText: (t) => deltas.push(t) });
    expect(deltas.join("")).toBe(r.text);
    expect(r.text).toMatch(/Réponse simulée/);
    const events = db.table("ai_usage_events");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "success", input_tokens: 2, request_id: "req-1", pricing_id: "p1", cost_currency: "USD" });
    expect(Number(events[0].estimated_cost)).toBeGreaterThan(0);
    expect(events[0].latency_ms).not.toBeNull();
  });

  it("refuse un double envoi (même identifiant de requête)", async () => {
    const resolved = await resolveModel(admin(), MODEL, { role: "beta_tester", purpose: "chat" });
    const run = () => runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "x" }] }, meta: { source: "chat", requestId: "dup" } });
    await run();
    await expect(run()).rejects.toMatchObject({ code: "duplicate_request" });
    expect(db.table("ai_usage_events")).toHaveLength(1);
  });

  it("applique le quota journalier et la limite de concurrence", async () => {
    const resolved = await resolveModel(admin(), MODEL, { role: "beta_tester", purpose: "chat" });
    for (let i = 0; i < 3; i++) await runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "x" }] }, meta: { source: "chat" } });
    await expect(runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "x" }] }, meta: { source: "chat" } })).rejects.toMatchObject({ code: "quota_exceeded" });
    db.tables.ai_usage_events = [1, 2, 3].map((i) => ({ id: `s${i}`, user_id: USER, status: "started", occurred_at: new Date().toISOString(), model_id: "autre", source: "chat" }));
    await expect(runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "x" }] }, meta: { source: "chat" } })).rejects.toMatchObject({ code: "concurrency_limit" });
  });

  it("ne remplace jamais un modèle indisponible et refuse les rôles insuffisants", async () => {
    db.tables.ai_models[0].status = "disabled";
    await expect(resolveModel(admin(), MODEL, { role: "super_admin", purpose: "chat" })).rejects.toMatchObject({ code: "model_unavailable" });
    db.tables.ai_models[0].status = "active";
    await expect(resolveModel(admin(), MODEL, { role: "viewer", purpose: "chat" })).rejects.toMatchObject({ code: "forbidden" });
    db.tables.ai_models[0].availability = { chat: true, workflows: false };
    await expect(resolveModel(admin(), MODEL, { role: "admin", purpose: "workflows" })).rejects.toMatchObject({ code: "model_not_available_here" });
  });

  it("« Non configuré » si le fournisseur fictif est coupé (jamais en production)", async () => {
    process.env.AI_ENABLE_MOCK_PROVIDER = "false";
    await expect(resolveModel(admin(), MODEL, { role: "admin", purpose: "chat" })).rejects.toMatchObject({ code: "not_configured" });
    process.env.AI_ENABLE_MOCK_PROVIDER = "true";
    process.env.APP_ENV = "production";
    await expect(resolveModel(admin(), MODEL, { role: "admin", purpose: "chat" })).rejects.toMatchObject({ code: "not_configured" });
    process.env.APP_ENV = "development";
  });

  it("une erreur fournisseur est tracée une fois, en erreur, et propagée", async () => {
    const resolved = await resolveModel(admin(), MODEL, { role: "beta_tester", purpose: "chat" });
    await expect(runCompletion({ admin: admin(), userId: USER, resolved, request: { messages: [{ role: "user", content: "[mock:error]" }] }, meta: { source: "chat" } })).rejects.toMatchObject({ code: "unavailable" });
    expect(db.table("ai_usage_events")).toMatchObject([{ status: "error", error_code: "unavailable", estimated_cost: null }]);
  });
});

describe("moteur de workflows", () => {
  const definition = workflowDefinitionSchema.parse({
    inputs: [{ key: "projet", label: "Projet", type: "text", required: true }, { key: "lots", label: "Lots", type: "number" }],
    steps: [
      { id: "analyse", type: "llm", name: "Analyse", modelId: MODEL, prompt: "Analyse {{inputs.projet}}", outputVar: "analyse", responseFormat: "json" },
      { id: "extrait", type: "transform", name: "Extraction", operation: "json_get", input: "{{vars.analyse}}", path: "simulation", outputVar: "simu" },
      { id: "gros", type: "condition", name: "Gros programme ?", condition: { left: "{{inputs.lots}}", operator: "gt", right: "50" }, outputVar: "gros" },
      { id: "detail", type: "transform", name: "Détail", operation: "uppercase", input: "{{inputs.projet}}", outputVar: "detail", when: { left: "{{vars.gros}}", operator: "equals", right: "true" } },
    ],
    output: { template: "Simulation : {{vars.simu}} / Détail : {{vars.detail}}" },
  });

  async function newRun(id: string) {
    db.table("workflow_runs").push({ id, user_id: USER, status: "queued", idempotency_key: id });
  }

  it("exécute les étapes, applique conditions et transformations, rattache l'usage au run", async () => {
    await newRun("run1");
    const out = await executeRun({ admin: admin(), userId: USER, role: "beta_tester", runId: "run1", workflowId: "wf1", definition, inputs: { projet: "Les Jardins", lots: 80 }, isTest: false });
    expect(out).toMatchObject({ status: "succeeded", output: "Simulation : true / Détail : LES JARDINS" });
    expect(db.table("workflow_run_steps").map((s) => s.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded"]);
    expect(db.table("ai_usage_events")).toMatchObject([{ source: "workflow", workflow_run_id: "run1", step_id: "analyse", status: "success" }]);
    expect(db.table("workflow_runs")[0]).toMatchObject({ status: "succeeded" });
  });

  it("ignore une étape dont la condition est fausse", async () => {
    await newRun("run2");
    const out = await executeRun({ admin: admin(), userId: USER, role: "beta_tester", runId: "run2", workflowId: "wf1", definition, inputs: { projet: "Petit", lots: 10 }, isTest: false });
    expect(out.output).toBe("Simulation : true / Détail : ");
    expect(db.table("workflow_run_steps").find((s) => s.step_id === "detail")?.status).toBe("skipped");
  });

  it("échoue proprement sur un appel HTTP vers un hôte non autorisé (SSRF)", async () => {
    await newRun("run3");
    const def = workflowDefinitionSchema.parse({
      inputs: [],
      steps: [{ id: "appel", type: "http", name: "Appel", connectionId: HTTP, path: "/hook", outputVar: "r" }],
      output: { template: "{{vars.r}}" },
    });
    const out = await executeRun({ admin: admin(), userId: USER, role: "beta_tester", runId: "run3", workflowId: "wf1", definition: def, inputs: {}, isTest: false });
    expect(out.status).toBe("failed");
    expect(out.errorMessage).toMatch(/liste blanche/);
    expect(db.table("workflow_run_steps")[0]).toMatchObject({ status: "failed" });
  });

  it("une exécution annulée est marquée comme telle et les étapes restantes ignorées", async () => {
    await newRun("run4");
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await executeRun({ admin: admin(), userId: USER, role: "beta_tester", runId: "run4", workflowId: "wf1", definition, inputs: { projet: "X" }, isTest: false, signal: ctrl.signal });
    expect(out.status).toBe("cancelled");
    expect(db.table("workflow_run_steps").every((s) => s.status === "skipped")).toBe(true);
  });
});
