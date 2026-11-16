import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Retour du fournisseur d'identité (SSO SAML ou OIDC) : échange du code PKCE
 * contre une session Supabase, puis redirection vers l'accueil. Les erreurs
 * renvoyées par l'IdP sont affichées sans détail technique.
 */
export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Connexion — Chantal" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const idpError = params.get("error_description") ?? params.get("error");
      if (idpError) {
        setError("La connexion d'entreprise a échoué ou a été annulée.");
        return;
      }
      const code = params.get("code");
      const { data } = await supabase.auth.getSession();
      if (!data.session && code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(code);
        if (e) {
          setError("Lien de connexion invalide ou expiré. Recommencez la connexion.");
          return;
        }
      }
      navigate({ to: "/home", replace: true });
    })();
  }, [navigate]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      {error ? (
        <div className="max-w-md text-center">
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
          <a href="/login" className="mt-4 inline-block text-sm underline">
            Retour à la connexion
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-zinc-300" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Finalisation de la connexion…
        </div>
      )}
    </main>
  );
}
