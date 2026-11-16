import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authConfig, callbackUrl } from "@/lib/authConfig";
import { useAuth } from "@/lib/authContext";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Connexion — Chantal" }] }),
  component: LoginPage,
});

const ENV_LABEL: Record<string, string> = {
  development: "Environnement de développement",
  staging: "Environnement de recette",
};

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/home", replace: true });
  }, [authLoading, session, navigate]);

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (e) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    navigate({ to: "/home" });
  }

  async function handleSso() {
    setError("");
    setLoading(true);
    try {
      if (authConfig.ssoMode === "saml") {
        const target = authConfig.ssoProviderId
          ? { providerId: authConfig.ssoProviderId }
          : { domain: authConfig.ssoDomain ?? "" };
        const { data, error: e } = await supabase.auth.signInWithSSO({
          ...target,
          options: { redirectTo: callbackUrl() },
        });
        if (e || !data?.url) throw e ?? new Error("URL SSO absente");
        window.location.href = data.url;
        return;
      }
      if (authConfig.ssoMode === "oidc" && authConfig.oidcProvider) {
        const { error: e } = await supabase.auth.signInWithOAuth({
          provider: authConfig.oidcProvider as "azure",
          options: { redirectTo: callbackUrl(), scopes: "openid email profile" },
        });
        if (e) throw e;
        return;
      }
      throw new Error("SSO non configuré");
    } catch {
      setError("Connexion d'entreprise indisponible. Réessayez ou contactez le support.");
      setLoading(false);
    }
  }

  const ssoEnabled = authConfig.ssoMode !== "none";
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl">
        {ENV_LABEL[authConfig.appEnv] && (
          <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {ENV_LABEL[authConfig.appEnv]} — données non productives
          </div>
        )}
        <div className="mb-8">
          <p className="text-sm text-zinc-400">Portail interne IA</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connexion à CHANTAL</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Accès réservé aux utilisateurs autorisés. Aucune inscription libre.
          </p>
        </div>

        {ssoEnabled && (
          <button
            type="button"
            onClick={() => void handleSso()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            {authConfig.ssoLabel}
          </button>
        )}

        {ssoEnabled && authConfig.passwordEnabled && (
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-500">
            <div className="h-px flex-1 bg-zinc-800" /> ou (comptes de service / transition){" "}
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
        )}

        {authConfig.passwordEnabled && (
          <form onSubmit={handlePassword} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-white"
                placeholder="prenom.nom@entreprise.fr"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-300">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-white"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${ssoEnabled ? "border border-zinc-700 text-white hover:bg-zinc-800" : "bg-white text-zinc-950 hover:bg-zinc-200"}`}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        )}

        {!ssoEnabled && !authConfig.passwordEnabled && (
          <p className="text-sm text-red-300">
            Aucun mode de connexion n'est activé pour cet environnement.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
