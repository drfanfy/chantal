/**
 * Création de comptes par un administrateur.
 *  - mode « invitation » (cible SSO) : enregistre une invitation ; le compte
 *    est créé et activé à la première connexion SSO de cette adresse ;
 *  - mode « mot de passe » (développement / transition) : crée immédiatement
 *    le compte Supabase avec un mot de passe temporaire. Désactivable par
 *    AUTH_ADMIN_PASSWORD_CREATION=false (recommandé en production SSO).
 */
import { z } from "zod";
import { hasPermission, ROLES } from "@/lib/permissions";
import type { AuthContext } from "../auth";
import { ApiError, forbidden } from "../http";

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide"),
  fullName: z.string().trim().min(1, "Nom obligatoire").max(120),
  role: z.enum(ROLES),
  mode: z.enum(["invite", "password"]),
  password: z.string().min(12, "12 caractères minimum").max(128).optional(),
});

export function passwordCreationEnabled(): boolean {
  return (process.env.AUTH_ADMIN_PASSWORD_CREATION ?? "true").trim() !== "false";
}

export async function createUser(ctx: AuthContext, body: z.infer<typeof createUserSchema>) {
  if (body.role === "super_admin" && !hasPermission(ctx.role, "user.manage_super")) {
    throw forbidden("Seul un super administrateur peut créer un super administrateur");
  }
  const { data: existing } = await ctx.admin
    .from("profiles")
    .select("id, is_active")
    .eq("email", body.email)
    .limit(1);
  if (existing && existing.length)
    throw new ApiError(
      409,
      "already_exists",
      "Un compte existe déjà pour cette adresse (activez-le ou rattachez-le)",
    );

  await ctx.admin
    .from("user_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("email", body.email)
    .is("consumed_at", null)
    .is("revoked_at", null);
  const { error: invErr } = await ctx.admin.from("user_invitations").insert({
    email: body.email,
    role: body.role,
    full_name: body.fullName,
    invited_by: ctx.userId,
  });
  if (invErr) throw new ApiError(500, "invitation_error", "Création de l'invitation impossible");

  if (body.mode === "invite") return { mode: "invite" as const, email: body.email };

  if (!passwordCreationEnabled())
    throw forbidden("Création par mot de passe désactivée sur cet environnement (SSO uniquement)");
  if (!body.password)
    throw new ApiError(400, "password_required", "Mot de passe temporaire obligatoire");
  const { data, error } = await ctx.admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName },
  });
  if (error || !data.user)
    throw new ApiError(400, "auth_error", error?.message ?? "Création du compte impossible");
  // Le trigger handle_new_user a consommé l'invitation et activé le profil.
  return { mode: "password" as const, email: body.email, userId: data.user.id };
}
