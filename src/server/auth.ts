/**
 * Authentification et autorisation des routes API.
 *
 * Le client envoie son jeton Supabase (Authorization: Bearer …). Le serveur :
 *  1. vérifie le jeton auprès de Supabase Auth ;
 *  2. charge le profil applicatif et refuse les comptes inactifs ;
 *  3. contrôle la permission demandée (matrice src/lib/permissions.ts).
 * Il fournit ensuite deux clients : `db` (au nom de l'utilisateur, RLS
 * appliquée) et `admin` (service_role, à n'utiliser qu'après contrôle).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "./env";
import { ApiError, forbidden } from "./http";
import { hasPermission, isRole, type Permission, type UserRole } from "@/lib/permissions";

export interface AuthContext {
  userId: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  db: SupabaseClient;
  admin: SupabaseClient;
}

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  const cfg = serverConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) {
    throw new ApiError(503, "server_not_configured", "Serveur non configuré : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  }
  adminClient ??= createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function userClient(token: string): SupabaseClient {
  const cfg = serverConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new ApiError(503, "server_not_configured", "Serveur non configuré : SUPABASE_URL / SUPABASE_ANON_KEY manquants");
  }
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function requireUser(request: Request, permission?: Permission): Promise<AuthContext> {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, "unauthenticated", "Session absente ou expirée");
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthenticated", "Session absente ou expirée");

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (pErr) throw new ApiError(500, "profile_error", "Impossible de charger le profil");
  if (!profile || !profile.is_active || !isRole(profile.role)) {
    throw new ApiError(403, "account_inactive", "Compte inactif ou en attente de validation");
  }
  if (permission && !hasPermission(profile.role, permission)) throw forbidden();

  return {
    userId: data.user.id,
    email: profile.email ?? data.user.email ?? null,
    role: profile.role,
    fullName: profile.full_name ?? null,
    db: userClient(token),
    admin,
  };
}

export function assertPermission(ctx: AuthContext, permission: Permission) {
  if (!hasPermission(ctx.role, permission)) throw forbidden();
}
