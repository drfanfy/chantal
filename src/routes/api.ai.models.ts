import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { CONNECTION_COLUMNS, connectionStatus, type ConnectionRow } from "@/server/ai/gateway";
import { effectiveCapabilities } from "@/server/ai/registry";
import type { CapabilityMap } from "@/server/ai/types";

/** Modèles proposés à l'utilisateur courant, avec leur état de configuration réel. */
export const Route = createFileRoute("/api/ai/models")({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        const ctx = await requireUser(request);
        const { data: models } = await ctx.db
          .from("ai_models")
          .select("id, name, description, icon, avatar_url, display_order, capabilities, availability, connection_id")
          .eq("status", "active")
          .order("display_order")
          .order("name");
        const ids = [...new Set((models ?? []).map((m) => m.connection_id).filter(Boolean))] as string[];
        const { data: conns } = ids.length
          ? await ctx.admin.from("ai_provider_connections").select(CONNECTION_COLUMNS).in("id", ids)
          : { data: [] as ConnectionRow[] };
        const byId = new Map(((conns ?? []) as ConnectionRow[]).map((c) => [c.id, c]));
        return json({
          models: (models ?? []).map((m) => {
            const c = m.connection_id ? byId.get(m.connection_id) : undefined;
            const st = c ? (c.is_enabled ? connectionStatus(c) : { configured: false, reason: "Connexion désactivée" }) : { configured: false, reason: "Aucune connexion" };
            return {
              id: m.id,
              name: m.name,
              description: m.description,
              icon: m.icon,
              avatarUrl: m.avatar_url,
              provider: c?.adapter ?? null,
              availability: m.availability,
              capabilities: effectiveCapabilities(c?.adapter ?? "", m.capabilities as CapabilityMap),
              configured: st.configured,
              // Raison détaillée réservée aux administrateurs du catalogue
              reason: st.configured ? null : ctx.role === "super_admin" ? st.reason : "Non configuré",
            };
          }),
        });
      }),
    },
  },
});
