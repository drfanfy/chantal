import { createFileRoute } from "@tanstack/react-router";
import { handle } from "@/server/http";
import { handleMaintenance } from "@/server/maintenance";

export const Route = createFileRoute("/api/cron/maintenance")({
  server: { handlers: { GET: handle(({ request }) => handleMaintenance(request)) } },
});
