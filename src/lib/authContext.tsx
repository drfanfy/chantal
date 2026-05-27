import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
  } from "react";
  import type { Session, User } from "@supabase/supabase-js";
  import { supabase } from "@/lib/supabase";
  
  export type UserRole = "super_admin" | "admin" | "beta_tester" | "viewer";
  
  export type UserProfile = {
    id: string;
    email: string | null;
    full_name: string | null;
    role: UserRole;
    avatar_url: string | null;
  };
  
  type AuthContextValue = {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
  };
  
  const AuthContext = createContext<AuthContextValue | undefined>(undefined);
  
  export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
  
    async function loadProfile(currentUser: User | null) {
      if (!currentUser) {
        setProfile(null);
        return;
      }
  
      const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, avatar_url, is_active")
      .eq("id", currentUser.id)
      .eq("is_active", true)
      .single();
  
      if (error) {
        console.error("Erreur chargement profil:", error);
        setProfile(null);
        return;
      }
  
      setProfile(data as UserProfile);
    }
  
    async function refreshProfile() {
      await loadProfile(user);
    }
  
    async function signOut() {
        const { error } = await supabase.auth.signOut();
      
        if (error) {
          console.error("Erreur logout:", error);
          return;
        }
      
        setSession(null);
        setUser(null);
        setProfile(null);
      }
  
    useEffect(() => {
      async function initAuth() {
        setLoading(true);
  
        const {
          data: { session },
        } = await supabase.auth.getSession();
  
        setSession(session);
        setUser(session?.user ?? null);

        try {
          await loadProfile(session?.user ?? null);
        } finally {
          setLoading(false);
        }
      }
  
      initAuth();
  
      const {
        data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
    
        try {
          await loadProfile(newSession?.user ?? null);
        } finally {
          setLoading(false);
        }
      });
  
      return () => {
        subscription.unsubscribe();
      };
    }, []);
  
    return (
      <AuthContext.Provider
        value={{
          session,
          user,
          profile,
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
  
    if (!context) {
      throw new Error("useAuth doit être utilisé dans AuthProvider");
    }
  
    return context;
  }