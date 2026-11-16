import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getAiStatus } from "@/server/admin/ai";

export const Route = createFileRoute("/api/admin/ai-status")({
  server: {
    handlers: {
      GET: handle(async ({ request }) =>
        json(await getAiStatus(await requireUser(request, "model.manage"))),
      ),
    },
  },
});
