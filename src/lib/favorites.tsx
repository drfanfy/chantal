/**
 * Favoris persistants par utilisateur (table user_favorites, RLS).
 * La base est la source de vérité ; l'état local n'est qu'un reflet optimiste.
 *
 * Reprise des favoris historiques (localStorage du POC) : proposée à
 * l'utilisateur connecté, importée seulement après son accord explicite, car
 * le navigateur a pu être partagé entre plusieurs comptes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useAuth } from "./authContext";

export type FavoriteType = "partner" | "agent" | "workflow" | "prompt" | "conversation";

export interface Favorite {
  id: string;
  resource_type: FavoriteType;
  resource_id: string;
  created_at: string;
  available: boolean;
  title: string | null;
  subtitle: string | null;
  extra: string | null;
  avatar_url: string | null;
  icon: string | null;
}

const LEGACY_KEY = "chantal_favorites";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readLegacy(): { kind: string; id: string }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? (raw as { kind: string; id: string }[]).filter(
          (f) => f && typeof f.id === "string" && UUID.test(f.id),
        )
      : [];
  } catch {
    return [];
  }
}

interface FavoritesCtx {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  isFavorite: (type: FavoriteType, id: string) => boolean;
  toggle: (type: FavoriteType, id: string) => Promise<void>;
  refresh: () => Promise<void>;
  legacyCount: number;
  importLegacy: () => Promise<number>;
  dismissLegacy: () => void;
}

const Ctx = createContext<FavoritesCtx | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacyCount, setLegacyCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error: e } = await supabase.rpc("get_my_favorites");
    if (e) setError("Favoris indisponibles");
    else {
      setFavorites((data ?? []) as Favorite[]);
      setError(null);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) {
      setFavorites([]);
      return;
    }
    void refresh();
    setLegacyCount(readLegacy().length);
  }, [profile?.id, refresh]);

  const isFavorite = useCallback(
    (type: FavoriteType, id: string) =>
      favorites.some((f) => f.resource_type === type && f.resource_id === id),
    [favorites],
  );

  const toggle = useCallback(
    async (type: FavoriteType, id: string) => {
      if (!profile?.id) return;
      const existing = favorites.find((f) => f.resource_type === type && f.resource_id === id);
      if (existing) {
        setFavorites((fs) => fs.filter((f) => f.id !== existing.id));
        const { error: e } = await supabase.from("user_favorites").delete().eq("id", existing.id);
        if (e) {
          setError("Retrait du favori impossible");
          await refresh();
        }
      } else {
        const optimistic: Favorite = {
          id: `tmp-${id}`,
          resource_type: type,
          resource_id: id,
          created_at: new Date().toISOString(),
          available: true,
          title: null,
          subtitle: null,
          extra: null,
          avatar_url: null,
          icon: null,
        };
        setFavorites((fs) => [optimistic, ...fs]);
        const { error: e } = await supabase
          .from("user_favorites")
          .insert({ user_id: profile.id, resource_type: type, resource_id: id });
        if (e && e.code !== "23505") setError("Ajout du favori impossible");
        await refresh();
      }
    },
    [favorites, profile?.id, refresh],
  );

  const importLegacy = useCallback(async () => {
    const items = readLegacy();
    const { data, error: e } = await supabase.rpc("import_legacy_favorites", { p_items: items });
    if (e) throw e;
    localStorage.removeItem(LEGACY_KEY);
    setLegacyCount(0);
    await refresh();
    return (data as number) ?? 0;
  }, [refresh]);

  const dismissLegacy = useCallback(() => {
    localStorage.removeItem(LEGACY_KEY);
    setLegacyCount(0);
  }, []);

  const value = useMemo(
    () => ({
      favorites,
      loading,
      error,
      isFavorite,
      toggle,
      refresh,
      legacyCount,
      importLegacy,
      dismissLegacy,
    }),
    [
      favorites,
      loading,
      error,
      isFavorite,
      toggle,
      refresh,
      legacyCount,
      importLegacy,
      dismissLegacy,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites must be used within FavoritesProvider");
  return c;
}
