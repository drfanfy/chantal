import { createFileRoute } from "@tanstack/react-router";
import { handle, json, readBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { testBodySchema, testModel } from "@/server/admin/ai";

export const Route = createFileRoute("/api/admin/ai-test")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const ctx = await requireUser(request, "model.manage");
        const body = await readBody(request, testBodySchema);
        return json(await testModel(ctx, body.modelId));
      }),
    },
  },
});
