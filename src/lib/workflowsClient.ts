/** Accès client aux workflows publiés et aux exécutions personnelles (RLS). */
import { supabase } from "./supabase";
import type { WorkflowDefinition } from "./workflows/schema";

export interface CatalogWorkflow {
  id: string;
  slug: string;
  name: string;
  description: string;
  expectedOutput: string;
  category: string;
  tags: string[];
  icon: string | null;
  isDemo: boolean;
  versionId: string;
  version: number;
  definition: WorkflowDefinition;
}

export interface RunRow {
  id: string;
  workflow_id: string;
  version_id: string | null;
  is_test: boolean;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
  inputs?: Record<string, unknown>;
  output: string | null;
  output_format: "markdown" | "text" | "json";
  error_code: string | null;
  error_message: string | null;
  attempt: number;
  parent_run_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface StepRow {
  step_id: string;
  step_type: string;
  step_name: string;
  position: number;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  duration_ms: number | null;
  output_preview: string | null;
  error_message: string | null;
}

export const RUN_SELECT =
  "id, workflow_id, version_id, is_test, status, inputs, output, output_format, error_code, error_message, attempt, parent_run_id, created_at, started_at, finished_at, duration_ms";

export async function fetchCatalog(): Promise<CatalogWorkflow[]> {
  const { data, error } = await supabase
    .from("workflow_definitions")
    .select(
      "id, slug, name, description, expected_output, category, tags, icon, is_demo, version:workflow_versions!published_version_id(id, version, definition)",
    )
    .eq("status", "published")
    .order("name");
  if (error) throw error;
  type Row = {
    id: string;
    slug: string;
    name: string;
    description: string;
    expected_output: string;
    category: string;
    tags: string[];
    icon: string | null;
    is_demo: boolean;
    version: { id: string; version: number; definition: WorkflowDefinition } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.version)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      expectedOutput: r.expected_output,
      category: r.category,
      tags: r.tags ?? [],
      icon: r.icon,
      isDemo: r.is_demo,
      versionId: r.version!.id,
      version: r.version!.version,
      definition: r.version!.definition,
    }));
}

export async function fetchSteps(runId: string): Promise<StepRow[]> {
  const { data } = await supabase
    .from("workflow_run_steps")
    .select(
      "step_id, step_type, step_name, position, status, duration_ms, output_preview, error_message",
    )
    .eq("run_id", runId)
    .order("position");
  return (data ?? []) as StepRow[];
}

export const RUN_STATUS_LABEL: Record<RunRow["status"], string> = {
  queued: "En file",
  running: "En cours",
  succeeded: "Terminé",
  failed: "Échec",
  timed_out: "Délai dépassé",
  cancelled: "Annulé",
};

export function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
