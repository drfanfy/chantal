/** Opérations pures des workflows (aucune E/S) : conditions et transformations. */
import { lookup, renderTemplate, stringify, type TemplateScope } from "@/lib/workflows/template";
import type { Condition, WorkflowStep } from "@/lib/workflows/schema";

function toNumber(s: string): number | null {
  const n = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function evaluateCondition(cond: Condition, scope: TemplateScope): boolean {
  const left = renderTemplate(cond.left, scope).text;
  const right = renderTemplate(cond.right ?? "", scope).text;
  const l = left.trim().toLowerCase();
  const r = right.trim().toLowerCase();
  switch (cond.operator) {
    case "equals":
      return l === r;
    case "not_equals":
      return l !== r;
    case "contains":
      return l.includes(r);
    case "not_contains":
      return !l.includes(r);
    case "is_empty":
      return l === "" || l === "false" || l === "[]" || l === "{}";
    case "not_empty":
      return !(l === "" || l === "false" || l === "[]" || l === "{}");
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(left);
      const b = toNumber(right);
      if (a === null || b === null) return false;
      return cond.operator === "gt"
        ? a > b
        : cond.operator === "gte"
          ? a >= b
          : cond.operator === "lt"
            ? a < b
            : a <= b;
    }
  }
}

export class StepError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function runTransform(
  step: Extract<WorkflowStep, { type: "transform" }>,
  scope: TemplateScope,
): unknown {
  const raw = renderTemplate(step.input ?? "", scope).text;
  switch (step.operation) {
    case "template":
      return raw;
    case "trim":
      return raw
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    case "uppercase":
      return raw.toUpperCase();
    case "lowercase":
      return raw.toLowerCase();
    case "truncate":
      return raw.length > (step.length ?? raw.length) ? raw.slice(0, step.length) + "…" : raw;
    case "split_lines":
      return raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    case "join_lines": {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(stringify).join("\n");
      } catch {
        /* texte brut */
      }
      return raw;
    }
    case "json_get": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(raw));
      } catch {
        throw new StepError(
          "invalid_json",
          `L'entrée de l'étape « ${step.name} » n'est pas un JSON valide`,
        );
      }
      const v = lookup({ root: parsed } as TemplateScope, `root.${step.path}`);
      if (v === undefined)
        throw new StepError("json_path_missing", `Champ « ${step.path} » absent du JSON`);
      return v;
    }
  }
}

/** Extrait le premier objet/tableau JSON d'un texte (réponse de modèle entourée de ```json). */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return candidate;
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  return end > start ? candidate.slice(start, end + 1) : candidate;
}

export function preview(value: unknown, max = 4000): string {
  const s = stringify(value);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
