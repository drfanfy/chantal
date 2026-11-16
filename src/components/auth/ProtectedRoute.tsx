import { type ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock, ShieldOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";

function CenteredCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          {icon}
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { session, status, loading, signOut, user } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="w-4 h-4 animate-spin" /> Vérification de la session…
      </div>
    );
  }
  if (!session) return null;

  if (status === "pending" || status === "disabled" || status === "error") {
    const pending = status === "pending";
    return (
      <CenteredCard
        icon={
          pending ? (
            <Clock className="w-6 h-6 text-amber-600" />
          ) : (
            <ShieldOff className="w-6 h-6 text-destructive" />
          )
        }
        title={
          pending
            ? "Compte en attente de validation"
            : status === "disabled"
              ? "Compte désactivé"
              : "Profil indisponible"
        }
      >
        <p>
          {pending
            ? `Votre identité (${user?.email ?? "compte"}) est reconnue, mais l'accès à CHANTAL doit être validé par un administrateur.`
            : status === "disabled"
              ? "Votre accès à CHANTAL a été désactivé. Contactez un administrateur si nécessaire."
              : "Votre profil n'a pas pu être chargé. Réessayez ou contactez le support."}
        </p>
        <button
          onClick={() => void signOut()}
          className="mt-6 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Se déconnecter
        </button>
      </CenteredCard>
    );
  }
  return <>{children}</>;
}
