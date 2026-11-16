/**
 * Schéma des définitions de workflow (partagé client / serveur).
 *
 * Une définition est un document JSON déclaratif : champs d'entrée, étapes
 * typées, sortie. Aucun code arbitraire : les seules opérations possibles sont
 * celles énumérées ici, exécutées par src/server/workflows/executor.ts.
 */
import { z } from "zod";
import { templateRefs } from "./template";

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const keySchema = z.string().regex(KEY, "Identifiant : minuscules, chiffres et _ (40 car. max), commence par une lettre");

export const INPUT_TYPES = ["text", "textarea", "number", "select", "date", "boolean"] as const;

export const inputFieldSchema = z
  .object({
    key: keySchema,
    label: z.string().trim().min(1, "Libellé obligatoire").max(120),
    type: z.enum(INPUT_TYPES),
    required: z.boolean().default(false),
    help: z.string().max(500).default(""),
    placeholder: z.string().max(200).optional(),
    maxLength: z.number().int().min(1).max(20000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" && (!f.options || f.options.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Une liste déroulante doit avoir des options", path: ["options"] });
    }
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min > max", path: ["min"] });
    }
  });
export type InputField = z.infer<typeof inputFieldSchema>;

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "not_empty",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export const CONDITION_LABELS: Record<(typeof CONDITION_OPERATORS)[number], string> = {
  equals: "est égal à",
  not_equals: "est différent de",
  contains: "contient",
  not_contains: "ne contient pas",
  is_empty: "est vide",
  not_empty: "n'est pas vide",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

export const conditionSchema = z.object({
  left: z.string().max(500),
  operator: z.enum(CONDITION_OPERATORS),
  right: z.string().max(500).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

const stepBase = {
  id: keySchema,
  name: z.string().trim().min(1).max(120),
  /** Étape exécutée seulement si la condition est vraie (sinon « ignorée »). */
  when: conditionSchema.nullish(),
};

export const llmStepSchema = z.object({
  ...stepBase,
  type: z.literal("llm"),
  modelId: z.string().uuid("Choisissez un modèle").nullable(),
  agentId: z.string().uuid().nullish(),
  system: z.string().max(20000).default(""),
  prompt: z.string().trim().min(1, "Consigne obligatoire").max(50000),
  outputVar: keySchema,
  maxOutputTokens: z.number().int().min(16).max(64000).default(4000),
  responseFormat: z.enum(["text", "json"]).default("text"),
});

export const TRANSFORM_OPERATIONS = [
  "template",
  "trim",
  "uppercase",
  "lowercase",
  "truncate",
  "json_get",
  "split_lines",
  "join_lines",
] as const;
export const TRANSFORM_LABELS: Record<(typeof TRANSFORM_OPERATIONS)[number], string> = {
  template: "Composer un texte (gabarit)",
  trim: "Supprimer les espaces superflus",
  uppercase: "Mettre en majuscules",
  lowercase: "Mettre en minuscules",
  truncate: "Tronquer",
  json_get: "Extraire un champ JSON",
  split_lines: "Découper en lignes (liste)",
  join_lines: "Assembler une liste en lignes",
};

export const transformStepSchema = z.object({
  ...stepBase,
  type: z.literal("transform"),
  operation: z.enum(TRANSFORM_OPERATIONS),
  input: z.string().max(50000).default(""),
  path: z.string().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/).max(200).optional(),
  length: z.number().int().min(1).max(200000).optional(),
  outputVar: keySchema,
});

export const conditionStepSchema = z.object({
  ...stepBase,
  type: z.literal("condition"),
  condition: conditionSchema,
  outputVar: keySchema,
  /** Si la condition est fausse : continuer (variable = false) ou arrêter le workflow avec un message. */
  onFalse: z.enum(["continue", "stop"]).default("continue"),
  stopMessage: z.string().max(1000).optional(),
});

export const httpStepSchema = z.object({
  ...stepBase,
  type: z.literal("http"),
  connectionId: z.string().uuid("Choisissez une connexion HTTP"),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST"),
  path: z
    .string()
    .max(500)
    .regex(/^(\/[^\s]*)?$/, "Chemin relatif commençant par /")
    .refine((p) => !p.includes("..") && !p.includes("//") && !p.includes("@"), "Chemin interdit")
    .default(""),
  body: z.string().max(50000).default(""),
  responsePath: z.string().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/).max(200).optional(),
  outputVar: keySchema,
});

export const stepSchema = z.discriminatedUnion("type", [llmStepSchema, transformStepSchema, conditionStepSchema, httpStepSchema]);
export type WorkflowStep = z.infer<typeof stepSchema>;
export type LlmStep = z.infer<typeof llmStepSchema>;
export type HttpStep = z.infer<typeof httpStepSchema>;

export const workflowDefinitionSchema = z
  .object({
    version: z.literal(1).default(1),
    inputs: z.array(inputFieldSchema).max(40),
    steps: z.array(stepSchema).min(1, "Au moins une étape").max(20, "20 étapes maximum"),
    output: z.object({
      template: z.string().trim().min(1, "Gabarit de sortie obligatoire").max(50000),
      format: z.enum(["markdown", "text", "json"]).default("markdown"),
      filename: z.string().regex(/^[\w\- ]{1,80}$/).optional(),
    }),
    limits: z.object({ timeoutSeconds: z.number().int().min(10).max(290).default(240) }).default({ timeoutSeconds: 240 }),
  })
  .superRefine((def, ctx) => {
    const inputKeys = new Set<string>();
    def.inputs.forEach((f, i) => {
      if (inputKeys.has(f.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Champ « ${f.key} » en double`, path: ["inputs", i, "key"] });
      inputKeys.add(f.key);
    });
    const stepIds = new Set<string>();
    const vars = new Set<string>();
    const checkRefs = (text: string | undefined, path: (string | number)[]) => {
      for (const ref of templateRefs(text ?? "")) {
        const [ns, key] = ref.split(".");
        const ok = (ns === "inputs" && inputKeys.has(key)) || (ns === "vars" && vars.has(key));
        if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Référence inconnue ou pas encore calculée : {{${ref}}}`, path });
      }
    };
    def.steps.forEach((s, i) => {
      if (stepIds.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Étape « ${s.id} » en double`, path: ["steps", i, "id"] });
      stepIds.add(s.id);
      if (s.when) {
        checkRefs(s.when.left, ["steps", i, "when", "left"]);
        checkRefs(s.when.right, ["steps", i, "when", "right"]);
      }
      switch (s.type) {
        case "llm":
          if (!s.modelId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choisissez un modèle", path: ["steps", i, "modelId"] });
          checkRefs(s.system, ["steps", i, "system"]);
          checkRefs(s.prompt, ["steps", i, "prompt"]);
          break;
        case "transform":
          checkRefs(s.input, ["steps", i, "input"]);
          if (s.operation === "json_get" && !s.path) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chemin JSON obligatoire", path: ["steps", i, "path"] });
          if (s.operation === "truncate" && !s.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Longueur obligatoire", path: ["steps", i, "length"] });
          break;
        case "condition":
          checkRefs(s.condition.left, ["steps", i, "condition", "left"]);
          checkRefs(s.condition.right, ["steps", i, "condition", "right"]);
          break;
        case "http":
          checkRefs(s.path, ["steps", i, "path"]);
          checkRefs(s.body, ["steps", i, "body"]);
          break;
      }
      vars.add(s.outputVar);
    });
    checkRefs(def.output.template, ["output", "template"]);
  });

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/** Message lisible à partir d'une erreur Zod. */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(" › ") || "définition"} : ${i.message}`);
}

/** Validation des valeurs saisies par l'utilisateur pour un formulaire de workflow. */
export function validateInputs(fields: InputField[], raw: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const values: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const v = raw[f.key];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (empty) {
      if (f.required) errors[f.key] = "Champ obligatoire";
      else if (f.type === "boolean") values[f.key] = false;
      else values[f.key] = "";
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
        if (!Number.isFinite(n)) errors[f.key] = "Nombre attendu";
        else if (f.min !== undefined && n < f.min) errors[f.key] = `Minimum ${f.min}`;
        else if (f.max !== undefined && n > f.max) errors[f.key] = `Maximum ${f.max}`;
        else values[f.key] = n;
        break;
      }
      case "boolean":
        values[f.key] = v === true || v === "true";
        break;
      case "select":
        if (!f.options?.includes(String(v))) errors[f.key] = "Valeur non autorisée";
        else values[f.key] = String(v);
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(String(v)))) errors[f.key] = "Date invalide (AAAA-MM-JJ)";
        else values[f.key] = String(v);
        break;
      default: {
        const s = String(v);
        const max = f.maxLength ?? (f.type === "textarea" ? 10000 : 500);
        if (s.length > max) errors[f.key] = `${max} caractères maximum`;
        else values[f.key] = s;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

export const EMPTY_DEFINITION: WorkflowDefinition = {
  version: 1,
  inputs: [],
  steps: [],
  output: { template: "", format: "markdown" },
  limits: { timeoutSeconds: 240 },
};
