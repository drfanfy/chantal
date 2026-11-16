/**
 * Moteur de gabarits des workflows et des prompts.
 *
 * Volontairement minimal et SANS évaluation de code : seules les références
 * `{{inputs.cle}}`, `{{vars.cle}}`, `{{vars.cle.sous.champ}}` et `{{cle}}`
 * (prompts) sont remplacées. Aucune expression, aucun appel de fonction.
 */
export type TemplateScope = Record<string, unknown>;

const REF = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g;

export interface RenderOptions {
  /** "json" : la valeur est échappée pour être insérée DANS une chaîne JSON. */
  escape?: "none" | "json";
}

export function lookup(scope: TemplateScope, path: string): unknown {
  let cur: unknown = scope;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function renderTemplate(
  template: string,
  scope: TemplateScope,
  options: RenderOptions = {},
) {
  const missing = new Set<string>();
  const text = template.replace(REF, (_m, path: string) => {
    const value = lookup(scope, path);
    if (value === undefined) missing.add(path);
    const s = stringify(value);
    return options.escape === "json" ? JSON.stringify(s).slice(1, -1) : s;
  });
  return { text, missing: [...missing] };
}

/** Références utilisées par un gabarit (validation à la publication). */
export function templateRefs(template: string): string[] {
  return [...template.matchAll(REF)].map((m) => m[1]);
}
