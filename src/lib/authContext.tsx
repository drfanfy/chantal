/**
 * Session et profil applicatif.
 *  - identité : Supabase Auth (mot de passe en dev, SSO SAML/OIDC en cible) ;
 *  - profil : public.profiles (rôle, statut actif) ;
 *  - après chaque connexion, /api/auth/session synchronise la date de
 *    connexion et, si activé, les groupes SSO → rôle.
 * Un profil inactif (en attente de validation ou désactivé) n'ouvre aucun accès.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authConfig } from "@/lib/authConfig";
import type { UserRole } from "@/lib/permissions";

export type { UserRole };

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  provisioning_source: string | null;
};

export type AccountStatus = "anonymous" | "active" | "pending" | "disabled" | "error";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Profil ACTIF uniquement (null sinon). */
  profile: UserProfile | null;
  status: AccountStatus;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [rawProfile, setRawProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AccountStatus>("anonymous");
  const [loading, setLoading] = useState(true);
  const syncedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setRawProfile(null);
      setStatus("anonymous");
      return;
    }
    // Synchronisation serveur une fois par session (dernière connexion, groupes SSO)
    if (syncedFor.current !== s.access_token) {
      syncedFor.current = s.access_token;
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { authorization: `Bearer ${s.access_token}` },
      }).catch(() => undefined);
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, avatar_url, is_active, provisioning_source")
      .eq("id", s.user.id)
      .maybeSingle<UserProfile>();
    if (error) {
      console.error("Erreur chargement profil:", error.message);
      setRawProfile(null);
      setStatus("error");
      return;
    }
    setRawProfile(data ?? null);
    setStatus(
      !data
        ? "pending"
        : data.is_active
          ? "active"
          : data.provisioning_source === "pending_approval"
            ? "pending"
            : "disabled",
    );
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Erreur déconnexion:", error.message);
    setSession(null);
    setRawProfile(null);
    setStatus("anonymous");
    syncedFor.current = null;
    if (authConfig.ssoLogoutUrl && authConfig.ssoMode !== "none") {
      window.location.href = authConfig.ssoLogoutUrl;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      try {
        await loadProfile(data.session);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Pas d'appel Supabase directement dans le callback (recommandation supabase-js)
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => {
          void loadProfile(newSession).finally(() => setLoading(false));
        }, 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const profile = status === "active" ? rawProfile : null;
  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        status,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return context;
}
