/**
 * POST /api/auth/session — appelé par le client après chaque connexion.
 *  - met à jour la date de dernière connexion ;
 *  - si SSO_GROUP_SYNC=true : applique le mapping groupes → rôle
 *    (sso_group_role_mappings) à partir des groupes présents dans les claims
 *    de l'identité SSO. Le rôle le plus élevé correspondant est retenu.
 *    Sans groupe correspondant, le compte n'est ni créé ni activé.
 *  - renvoie l'état du compte (actif / en attente / désactivé).
 * Le format exact des claims de groupe dépend de l'IdP de la DSI : à valider
 * lors du test d'intégration SSO (docs/05-sso.md).
 */
import type { User } from "@supabase/supabase-js";
import { roleRank, isRole, type UserRole } from "@/lib/permissions";
import { bearerToken, getAdminClient } from "./auth";
import { ApiError, json } from "./http";

export function extractGroups(user: User): string[] {
  const candidates: unknown[] = [
    (user.app_metadata as Record<string, unknown> | undefined)?.groups,
    (user.user_metadata as Record<string, unknown> | undefined)?.groups,
    ...(user.identities ?? []).flatMap((i) => {
      const d = (i.identity_data ?? {}) as Record<string, unknown>;
      const custom = (d.custom_claims ?? {}) as Record<string, unknown>;
      return [
        d.groups,
        custom.groups,
        custom["http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"],
      ];
    }),
  ];
  const out = new Set<string>();
  for (const c of candidates) {
    if (Array.isArray(c)) c.forEach((g) => typeof g === "string" && out.add(g));
    else if (typeof c === "string")
      c.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((g) => out.add(g));
  }
  return [...out];
}

export function pickRole(
  groups: string[],
  mappings: { group_value: string; role: string }[],
): UserRole | null {
  let best: UserRole | null = null;
  for (const m of mappings) {
    if (groups.includes(m.group_value) && isRole(m.role) && roleRank(m.role) > roleRank(best))
      best = m.role;
  }
  return best;
}

export async function handleSessionSync(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, "unauthenticated", "Session absente");
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthenticated", "Session absente ou expirée");
  const user = data.user;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, is_active, provisioning_source, identity_provider")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      role: string;
      is_active: boolean;
      provisioning_source: string;
      identity_provider: string;
    }>();
  if (!profile) return json({ status: "pending" });

  const patch: Record<string, unknown> = { last_sign_in_at: new Date().toISOString() };
  const isSso =
    (user.app_metadata?.provider ?? "").toString().startsWith("sso") ||
    profile.identity_provider.startsWith("sso");
  if (process.env.SSO_GROUP_SYNC === "true" && isSso) {
    const { data: mappings } = await admin
      .from("sso_group_role_mappings")
      .select("group_value, role");
    const role = pickRole(
      extractGroups(user),
      (mappings ?? []) as { group_value: string; role: string }[],
    );
    if (role && (profile.is_active || profile.provisioning_source === "pending_approval")) {
      patch.role = role;
      if (profile.provisioning_source === "pending_approval") {
        patch.is_active = true;
        patch.provisioning_source = "sso_group";
      }
    }
  }
  await admin.from("profiles").update(patch).eq("id", user.id);
  const active = (patch.is_active as boolean | undefined) ?? profile.is_active;
  return json({
    status: active
      ? "active"
      : profile.provisioning_source === "pending_approval"
        ? "pending"
        : "disabled",
    role: (patch.role as string | undefined) ?? profile.role,
  });
}
