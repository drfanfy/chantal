import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/workflows/template";
import { validateInputs, workflowDefinitionSchema } from "@/lib/workflows/schema";

const M = "11111111-1111-4111-8111-111111111111";

describe("gabarits", () => {
  it("remplace les références sans évaluer de code", () => {
    const r = renderTemplate(
      "Ville : {{inputs.ville}} / {{vars.x.y}} / {{constructor}} / {{ inputs.absent }}",
      {
        inputs: { ville: "Lyon" },
        vars: { x: { y: 3 } },
      },
    );
    expect(r.text).toBe("Ville : Lyon / 3 /  / ");
    expect(r.missing).toEqual(["constructor", "inputs.absent"]);
    expect(renderTemplate("{{a}}", { a: "${process.exit()}" }).text).toBe("${process.exit()}");
  });

  it("échappe pour JSON", () => {
    const r = renderTemplate(
      '{"q":"{{inputs.q}}"}',
      { inputs: { q: 'a"b\n' } },
      { escape: "json" },
    );
    expect(JSON.parse(r.text)).toEqual({ q: 'a"b\n' });
  });
});

describe("schéma de workflow", () => {
  const base = {
    inputs: [{ key: "ville", label: "Ville", type: "text", required: true }],
    steps: [
      {
        id: "a",
        type: "llm",
        name: "Analyse",
        modelId: M,
        prompt: "Analyse {{inputs.ville}}",
        outputVar: "analyse",
      },
    ],
    output: { template: "{{vars.analyse}}" },
  };

  it("accepte une définition valide et applique les défauts", () => {
    const d = workflowDefinitionSchema.parse(base);
    expect(d.limits.timeoutSeconds).toBe(240);
    expect(d.output.format).toBe("markdown");
  });

  it("refuse références inconnues, variables utilisées avant calcul, doublons, modèle manquant", () => {
    const bad = {
      ...base,
      steps: [
        {
          id: "a",
          type: "llm",
          name: "A",
          modelId: null,
          prompt: "{{vars.b}} {{inputs.inconnu}}",
          outputVar: "x",
        },
        {
          id: "a",
          type: "transform",
          name: "B",
          operation: "template",
          input: "{{vars.x}}",
          outputVar: "b",
        },
      ],
    };
    const r = workflowDefinitionSchema.safeParse(bad);
    expect(r.success).toBe(false);
    const msgs = r.success ? "" : r.error.issues.map((i) => i.message).join(" | ");
    expect(msgs).toMatch(/vars\.b/);
    expect(msgs).toMatch(/inputs\.inconnu/);
    expect(msgs).toMatch(/en double/);
    expect(msgs).toMatch(/Choisissez un modèle/);
  });

  it("refuse un chemin HTTP sortant de l'URL de base", () => {
    const r = workflowDefinitionSchema.safeParse({
      ...base,
      steps: [
        { id: "h", type: "http", name: "H", connectionId: M, path: "/../admin", outputVar: "r" },
      ],
      output: { template: "{{vars.r}}" },
    });
    expect(r.success).toBe(false);
  });

  it("valide les saisies du formulaire", () => {
    const fields = workflowDefinitionSchema.parse({
      ...base,
      inputs: [
        { key: "ville", label: "Ville", type: "text", required: true, maxLength: 5 },
        { key: "lots", label: "Lots", type: "number", required: false, min: 1, max: 500 },
        { key: "type", label: "Type", type: "select", required: true, options: ["T2", "T3"] },
      ],
    }).inputs;
    expect(validateInputs(fields, { ville: "", lots: "0", type: "T9" }).errors).toEqual({
      ville: "Champ obligatoire",
      lots: "Minimum 1",
      type: "Valeur non autorisée",
    });
    expect(validateInputs(fields, { ville: "Lyon", lots: "12,5", type: "T2" }).values).toEqual({
      ville: "Lyon",
      lots: 12.5,
      type: "T2",
    });
  });
});
