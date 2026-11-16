import { Link } from "@tanstack/react-router";
import { Sparkles, LogOut } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { authConfig } from "@/lib/authConfig";
import { ROLE_LABELS } from "@/lib/permissions";
import { TopNav } from "@/components/TopNav";
import { FeedbackButton } from "@/components/FeedbackButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    if (!authConfig.ssoLogoutUrl) window.location.href = "/login";
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {authConfig.appEnv !== "production" && (
        <div
          className="shrink-0 bg-amber-500/15 text-amber-800 text-[0.7rem] text-center py-0.5"
          role="note"
        >
          {authConfig.appEnv === "staging"
            ? "Environnement de recette"
            : "Environnement de développement"}{" "}
          — données non productives
        </div>
      )}
      <header className="h-14 shrink-0 border-b border-border flex items-center px-3 sm:px-6 gap-3 sm:gap-6 relative">
        <div className="absolute inset-0 bg-surface/80 backdrop-blur -z-10 pointer-events-none" />
        <Link
          to="/home"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Retour à l'accueil"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center shadow-soft">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="hidden md:inline text-sm font-semibold tracking-tight">Chantal</span>
        </Link>
        <div className="flex-1 min-w-0 flex justify-center">
          <TopNav />
        </div>
        <div className="shrink-0 flex items-center gap-2 sm:gap-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center text-white text-sm font-semibold shrink-0"
              aria-hidden
            >
              {profile?.full_name?.charAt(0) ?? "?"}
            </div>
          )}
          <div className="leading-tight hidden lg:block">
            <div className="text-sm font-medium text-foreground max-w-[10rem] truncate">
              {profile?.full_name ?? "Utilisateur"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {profile ? ROLE_LABELS[profile.role] : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Déconnexion"
            aria-label="Déconnexion"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">{children}</div>
      <FeedbackButton />
    </div>
  );
}
