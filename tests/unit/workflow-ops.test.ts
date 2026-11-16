import { describe, it, expect } from "vitest";
import { evaluateCondition, extractJson, runTransform } from "@/server/workflows/ops";

const scope = {
  inputs: { budget: "1 200,5", ville: "Lyon" },
  vars: { liste: ["a", "b"], vide: "" },
};

describe("conditions", () => {
  it("compare textes et nombres (format français)", () => {
    expect(
      evaluateCondition({ left: "{{inputs.ville}}", operator: "equals", right: "lyon" }, scope),
    ).toBe(true);
    expect(
      evaluateCondition({ left: "{{inputs.budget}}", operator: "gt", right: "1000" }, scope),
    ).toBe(true);
    expect(evaluateCondition({ left: "{{inputs.ville}}", operator: "gt", right: "1" }, scope)).toBe(
      false,
    );
    expect(
      evaluateCondition({ left: "{{vars.vide}}", operator: "is_empty", right: "" }, scope),
    ).toBe(true);
    expect(
      evaluateCondition({ left: "{{vars.liste}}", operator: "contains", right: "b" }, scope),
    ).toBe(true);
  });
});

describe("transformations", () => {
  const t = (operation: string, input: string, extra: Record<string, unknown> = {}) =>
    runTransform(
      {
        id: "t",
        name: "T",
        type: "transform",
        operation,
        input,
        outputVar: "o",
        ...extra,
      } as never,
      scope,
    );

  it("applique les opérations déclaratives", () => {
    expect(t("uppercase", "{{inputs.ville}}")).toBe("LYON");
    expect(t("truncate", "abcdef", { length: 3 })).toBe("abc…");
    expect(t("split_lines", " a \n\n b ")).toEqual(["a", "b"]);
    expect(t("join_lines", "{{vars.liste}}")).toBe("a\nb");
    expect(
      t("json_get", '```json\n{"risque":{"niveau":"élevé"}}\n```', { path: "risque.niveau" }),
    ).toBe("élevé");
    expect(() => t("json_get", "pas du json", { path: "a" })).toThrow(/JSON valide/);
  });

  it("extrait le JSON d'une réponse de modèle", () => {
    expect(extractJson('Voici : {"a":1} merci')).toBe('{"a":1}');
  });
});
