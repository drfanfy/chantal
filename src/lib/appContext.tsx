/**
 * État applicatif partagé (navigation, sélection IA, liste des conversations).
 *
 * Les conversations sont chargées sous forme de RÉSUMÉS (pas de messages) et
 * séparées en « mes conversations » et « conversations partagées ». La base
 * (RLS) garantit qu'aucune conversation privée d'autrui n'est renvoyée.
 * Les messages sont chargés à l'ouverture d'une conversation (useConversation).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type Visibility = "private" | "shared";

export interface ConversationSummary {
  id: string;
  title: string;
  userId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  isOwn: boolean;
  visibility: Visibility;
  isHidden: boolean;
  sharedAt: Date | null;
  updatedAt: Date;
  modelId: string | null;
  agentId: string | null;
  partnerId: string | null;
}

export type ViewMode = "workflow" | "formation" | "admin" | "partners" | "prompts";

interface AppState {
  myConversations: ConversationSummary[];
  sharedConversations: ConversationSummary[];
  conversationsLoaded: boolean;
  conversationsError: string | null;
  activeConversationId: string | null;
  currentModelId: string | null;
  currentAgentId: string | null;
  currentPartnerId: string | null;
  viewMode: ViewMode;
  activeWorkflow: string | null;
  activeFormation: string | null;
  sidebarOpen: boolean;
  pendingPrefill: string;
}

interface AppContextType extends AppState {
  setCurrentModelId: (id: string | null) => void;
  setCurrentAgentId: (id: string | null) => void;
  /** Choisir un partenaire impose son modèle et son agent. */
  selectPartner: (
    p: { id: string; ai_model_id: string | null; agent_id: string | null } | null,
  ) => void;
  setViewMode: (v: ViewMode) => void;
  setActiveWorkflow: (w: string | null) => void;
  setActiveFormation: (f: string | null) => void;
  setActiveConversation: (id: string | null) => void;
  toggleSidebar: () => void;
  setPendingPrefill: (text: string) => void;
  consumePrefill: () => void;
  loadConversations: (userId: string) => Promise<void>;
  upsertConversation: (c: ConversationSummary) => void;
  findConversation: (id: string | null | undefined) => ConversationSummary | undefined;
  renameConversation: (id: string, title: string) => Promise<void>;
  setConversationVisibility: (id: string, visibility: Visibility) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  moderateConversation: (id: string, hidden: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

interface DbConversation {
  id: string;
  title: string | null;
  user_id: string;
  visibility: Visibility;
  is_hidden: boolean;
  shared_at: string | null;
  updated_at: string;
  created_at: string;
  ai_model_id: string | null;
  agent_id: string | null;
  partner_id: string | null;
}

const CONV_COLUMNS =
  "id, title, user_id, visibility, is_hidden, shared_at, updated_at, created_at, ai_model_id, agent_id, partner_id";

function toSummary(
  c: DbConversation,
  userId: string,
  names: Map<string, { name: string; avatar: string | null }>,
): ConversationSummary {
  const owner = names.get(c.user_id);
  return {
    id: c.id,
    title: c.title ?? "Conversation",
    userId: c.user_id,
    ownerName: owner?.name ?? (c.user_id === userId ? "Moi" : "Utilisateur"),
    ownerAvatarUrl: owner?.avatar ?? null,
    isOwn: c.user_id === userId,
    visibility: c.visibility,
    isHidden: c.is_hidden,
    sharedAt: c.shared_at ? new Date(c.shared_at) : null,
    updatedAt: new Date(c.updated_at ?? c.created_at),
    modelId: c.ai_model_id,
    agentId: c.agent_id,
    partnerId: c.partner_id,
  };
}

function patchList(list: ConversationSummary[], id: string, patch: Partial<ConversationSummary>) {
  return list.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    myConversations: [],
    sharedConversations: [],
    conversationsLoaded: false,
    conversationsError: null,
    activeConversationId: null,
    currentModelId: null,
    currentAgentId: null,
    currentPartnerId: null,
    viewMode: "workflow",
    activeWorkflow: null,
    activeFormation: null,
    sidebarOpen: true,
    pendingPrefill: "",
  });

  const setCurrentModelId = useCallback(
    (id: string | null) => setState((s) => ({ ...s, currentModelId: id, currentPartnerId: null })),
    [],
  );
  const setCurrentAgentId = useCallback(
    (id: string | null) => setState((s) => ({ ...s, currentAgentId: id, currentPartnerId: null })),
    [],
  );
  const selectPartner = useCallback(
    (p: { id: string; ai_model_id: string | null; agent_id: string | null } | null) =>
      setState((s) =>
        p
          ? {
              ...s,
              currentPartnerId: p.id,
              currentModelId: p.ai_model_id ?? s.currentModelId,
              currentAgentId: p.agent_id,
            }
          : { ...s, currentPartnerId: null },
      ),
    [],
  );
  const setViewMode = useCallback((v: ViewMode) => setState((s) => ({ ...s, viewMode: v })), []);
  const setActiveWorkflow = useCallback(
    (w: string | null) =>
      setState((s) => ({ ...s, activeWorkflow: w, viewMode: w ? "workflow" : s.viewMode })),
    [],
  );
  const setActiveFormation = useCallback(
    (f: string | null) =>
      setState((s) => ({ ...s, activeFormation: f, viewMode: f ? "formation" : s.viewMode })),
    [],
  );
  const toggleSidebar = useCallback(
    () => setState((s) => ({ ...s, sidebarOpen: !s.sidebarOpen })),
    [],
  );
  const setPendingPrefill = useCallback(
    (text: string) => setState((s) => ({ ...s, pendingPrefill: text })),
    [],
  );
  const consumePrefill = useCallback(() => setState((s) => ({ ...s, pendingPrefill: "" })), []);

  const setActiveConversation = useCallback((id: string | null) => {
    setState((s) => {
      const conv = [...s.myConversations, ...s.sharedConversations].find((c) => c.id === id);
      if (!conv) return { ...s, activeConversationId: id };
      return {
        ...s,
        activeConversationId: id,
        currentModelId: conv.modelId ?? s.currentModelId,
        currentAgentId: conv.agentId,
        currentPartnerId: conv.partnerId,
      };
    });
  }, []);

  const loadConversations = useCallback(async (userId: string) => {
    const [mine, shared] = await Promise.all([
      supabase
        .from("conversations")
        .select(CONV_COLUMNS)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("conversations")
        .select(CONV_COLUMNS)
        .eq("visibility", "shared")
        .neq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    if (mine.error || shared.error) {
      console.error("[conversations]", mine.error?.message ?? shared.error?.message);
      setState((s) => ({
        ...s,
        conversationsLoaded: true,
        conversationsError: "Impossible de charger les conversations.",
      }));
      return;
    }
    const rows = [...(mine.data ?? []), ...(shared.data ?? [])] as DbConversation[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = new Map<string, { name: string; avatar: string | null }>();
    if (ids.length) {
      const { data } = await supabase
        .from("profile_directory")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      (data ?? []).forEach(
        (p: { id: string; full_name: string | null; avatar_url: string | null }) =>
          names.set(p.id, { name: p.full_name ?? "Utilisateur", avatar: p.avatar_url }),
      );
    }
    setState((s) => ({
      ...s,
      myConversations: ((mine.data ?? []) as DbConversation[]).map((c) =>
        toSummary(c, userId, names),
      ),
      sharedConversations: ((shared.data ?? []) as DbConversation[]).map((c) =>
        toSummary(c, userId, names),
      ),
      conversationsLoaded: true,
      conversationsError: null,
    }));
  }, []);

  const upsertConversation = useCallback((c: ConversationSummary) => {
    setState((s) => {
      const key = c.isOwn ? "myConversations" : "sharedConversations";
      const list = s[key].some((x) => x.id === c.id)
        ? s[key].map((x) => (x.id === c.id ? c : x))
        : [c, ...s[key]];
      return {
        ...s,
        [key]: [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      };
    });
  }, []);

  const findConversation = useCallback(
    (id: string | null | undefined) =>
      id
        ? [...state.myConversations, ...state.sharedConversations].find((c) => c.id === id)
        : undefined,
    [state.myConversations, state.sharedConversations],
  );

  const renameConversation = useCallback(async (id: string, title: string) => {
    const { error } = await supabase.from("conversations").update({ title }).eq("id", id);
    if (error) throw error;
    setState((s) => ({ ...s, myConversations: patchList(s.myConversations, id, { title }) }));
  }, []);

  const setConversationVisibility = useCallback(async (id: string, visibility: Visibility) => {
    const { data, error } = await supabase
      .from("conversations")
      .update({ visibility })
      .eq("id", id)
      .select("shared_at")
      .single();
    if (error) throw error;
    setState((s) => ({
      ...s,
      myConversations: patchList(s.myConversations, id, {
        visibility,
        sharedAt: data?.shared_at ? new Date(data.shared_at) : null,
      }),
    }));
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    // Fichiers joints : supprimés du stockage avant la conversation (les lignes suivent par cascade)
    const { data: files } = await supabase
      .from("message_attachments")
      .select("storage_path")
      .eq("conversation_id", id);
    const paths = (files ?? []).map((f: { storage_path: string }) => f.storage_path);
    if (paths.length) await supabase.storage.from("chat-files").remove(paths);
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) throw error;
    setState((s) => ({
      ...s,
      myConversations: s.myConversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    }));
  }, []);

  const moderateConversation = useCallback(async (id: string, hidden: boolean) => {
    const { error } = await supabase.rpc("moderate_conversation", {
      p_conversation_id: id,
      p_hidden: hidden,
    });
    if (error) throw error;
    setState((s) => ({
      ...s,
      sharedConversations: patchList(s.sharedConversations, id, { isHidden: hidden }),
    }));
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      ...state,
      setCurrentModelId,
      setCurrentAgentId,
      selectPartner,
      setViewMode,
      setActiveWorkflow,
      setActiveFormation,
      setActiveConversation,
      toggleSidebar,
      setPendingPrefill,
      consumePrefill,
      loadConversations,
      upsertConversation,
      findConversation,
      renameConversation,
      setConversationVisibility,
      deleteConversation,
      moderateConversation,
    }),
    [
      state,
      setCurrentModelId,
      setCurrentAgentId,
      selectPartner,
      setViewMode,
      setActiveWorkflow,
      setActiveFormation,
      setActiveConversation,
      toggleSidebar,
      setPendingPrefill,
      consumePrefill,
      loadConversations,
      upsertConversation,
      findConversation,
      renameConversation,
      setConversationVisibility,
      deleteConversation,
      moderateConversation,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
