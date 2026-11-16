import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { parseDefinition, publishDraft, testDraft } from "@/server/workflows/service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate"), definition: z.unknown() }),
  z.object({
    action: z.literal("test"),
    workflowId: z.string().uuid(),
    inputs: z.record(z.unknown()).default({}),
    idempotencyKey: z
      .string()
      .min(8)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/),
  }),
  z.object({
    action: z.literal("publish"),
    workflowId: z.string().uuid(),
    changeSummary: z.string().max(500).default(""),
  }),
]);

/** Validation, test et publication des workflows (administrateurs). */
export const Route = createFileRoute("/api/admin/workflows")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const ctx = await requireUser(request, "workflow.manage");
        const body = await readBody(request, bodySchema, 1_000_000);
        if (body.action === "validate") {
          parseDefinition(body.definition);
          return json({ valid: true });
        }
        if (body.action === "test")
          return json(await testDraft(ctx, body.workflowId, body.inputs, body.idempotencyKey));
        return json({ version: await publishDraft(ctx, body.workflowId, body.changeSummary) });
      }),
    },
  },
});
