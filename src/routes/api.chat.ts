import { createFileRoute } from "@tanstack/react-router";
import { handle } from "@/server/http";
import { handleChat } from "@/server/chat";

export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: handle(({ request }) => handleChat(request)) } },
});
