import { createFileRoute } from "@tanstack/react-router";
import { handle, json, readBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { runBodySchema, startRun } from "@/server/workflows/service";

export const Route = createFileRoute("/api/workflows/run")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const ctx = await requireUser(request, "workflow.run");
        const body = await readBody(request, runBodySchema, 500_000);
        return json(await startRun(ctx, body, request.signal));
      }),
    },
  },
});
