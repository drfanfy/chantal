/**
 * Configuration du parcours de connexion, par environnement (variables
 * VITE_AUTH_* — non secrètes). Voir docs/05-sso.md.
 *
 *  VITE_AUTH_PASSWORD_ENABLED  true|false  Connexion e-mail + mot de passe (dev / transition)
 *  VITE_AUTH_SSO_MODE          none|saml|oidc
 *  VITE_AUTH_SSO_DOMAIN        domaine e-mail associé au fournisseur SAML (ex. quartus.fr)
 *  VITE_AUTH_SSO_PROVIDER_ID   identifiant du fournisseur SAML Supabase (alternative au domaine)
 *  VITE_AUTH_OIDC_PROVIDER     fournisseur OAuth/OIDC Supabase (ex. azure, keycloak)
 *  VITE_AUTH_SSO_LABEL         libellé du bouton (ex. « Se connecter avec le compte QUARTUS »)
 *  VITE_AUTH_SSO_LOGOUT_URL    URL de déconnexion de l'IdP (optionnelle, déconnexion globale)
 *  VITE_APP_ENV                development|staging|production (bandeau d'environnement)
 */
const env = import.meta.env as Record<string, string | undefined>;

export type SsoMode = "none" | "saml" | "oidc";

export const authConfig = {
  passwordEnabled: (env.VITE_AUTH_PASSWORD_ENABLED ?? "true") !== "false",
  ssoMode: (["saml", "oidc"].includes(env.VITE_AUTH_SSO_MODE ?? "")
    ? env.VITE_AUTH_SSO_MODE
    : "none") as SsoMode,
  ssoDomain: env.VITE_AUTH_SSO_DOMAIN || undefined,
  ssoProviderId: env.VITE_AUTH_SSO_PROVIDER_ID || undefined,
  oidcProvider: env.VITE_AUTH_OIDC_PROVIDER || undefined,
  ssoLabel: env.VITE_AUTH_SSO_LABEL || "Se connecter avec mon compte d'entreprise",
  ssoLogoutUrl: env.VITE_AUTH_SSO_LOGOUT_URL || undefined,
  appEnv: (env.VITE_APP_ENV ?? "development") as "development" | "staging" | "production",
};

export function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}
