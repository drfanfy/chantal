import { Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, LogOut } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { TopNav } from "@/components/TopNav";
import { FeedbackButton } from "@/components/FeedbackButton";

export function AppShell({ children }: { children: React.ReactNode }) {
const { profile, signOut } = useAuth();
const navigate = useNavigate();

async function handleSignOut() {
  await signOut();
  window.location.href = "/login";
}
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 border-b border-border flex items-center px-6 gap-6 relative">
        <div className="absolute inset-0 bg-surface/80 backdrop-blur -z-10 pointer-events-none" />
        <Link
          to="/home"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Retour à l'accueil"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center shadow-soft">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Chantal</span>
        </Link>
        <div className="flex-1 flex justify-center">
          <TopNav />
        </div>
        <div className="shrink-0 flex items-center justify-end min-w-[220px]">
  <div className="flex items-center gap-3">
    {profile?.avatar_url ? (
      <img src={profile.avatar_url} alt={profile.full_name ?? "Avatar"} className="w-9 h-9 rounded-full object-cover shrink-0" />
    ) : (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
        {profile?.full_name?.charAt(0) ?? "?"}
      </div>
    )}

    <div className="leading-tight">
      <div className="text-sm font-medium text-foreground">
        {profile?.full_name ?? "Utilisateur"}
      </div>

      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {profile?.role ?? "viewer"}
      </div>
    </div>

    <button
      onClick={handleSignOut}
      className="ml-2 p-2 rounded-lg hover:bg-muted transition-colors"
      title="Déconnexion"
    >
      <LogOut className="w-4 h-4 text-muted-foreground" />
    </button>
  </div>
</div>
      </header>
      <div className="flex flex-1 min-h-0">{children}</div>
      <FeedbackButton />
    </div>
  );
}
