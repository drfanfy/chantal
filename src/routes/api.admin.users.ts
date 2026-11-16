import { createFileRoute } from "@tanstack/react-router";
import { handle, json, readBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { createUser, createUserSchema, passwordCreationEnabled } from "@/server/admin/users";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        await requireUser(request, "user.manage");
        return json({ passwordCreationEnabled: passwordCreationEnabled() });
      }),
      POST: handle(async ({ request }) => {
        const ctx = await requireUser(request, "user.manage");
        return json(await createUser(ctx, await readBody(request, createUserSchema)), 201);
      }),
    },
  },
});
