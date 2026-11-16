import { createFileRoute } from "@tanstack/react-router";
import { handle } from "@/server/http";
import { handleSessionSync } from "@/server/authSync";

export const Route = createFileRoute("/api/auth/session")({
  server: { handlers: { POST: handle(({ request }) => handleSessionSync(request)) } },
});
