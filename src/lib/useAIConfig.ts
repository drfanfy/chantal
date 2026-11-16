/**
 * Catalogue IA visible par l'utilisateur courant.
 *  - modèles : route serveur /api/ai/models (seul le serveur sait si une
 *    connexion est réellement configurée) ;
 *  - agents et partenaires : lecture directe, filtrée par la RLS (actifs,
 *    non archivés, rôle suffisant).
 * Mis en cache au niveau module pour éviter des requêtes à chaque rendu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { apiFetch } from "@/lib/api";

export interface AIModel {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  avatarUrl: string | null;
  provider: string | null;
  availability: { chat?: boolean; agents?: boolean; workflows?: boolean } | null;
  capabilities: {
    text?: boolean;
    streaming?: boolean;
    vision?: boolean;
    files?: boolean;
    structured_output?: boolean;
    tools?: boolean;
  };
  configured: boolean;
  reason: string | null;
}

export interface AIAgent {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  system_prompt?: string | null;
  icon: string | null;
  avatar_url: string | null;
  default_model_id: string | null;
}

export interface AIPartner {
  id: string;
  name: string;
  description: string | null;
  personality: string | null;
  avatar_url: string | null;
  ai_model_id: string | null;
  agent_id: string | null;
  model?: AIModel;
  agent?: AIAgent;
}

interface Catalog {
  models: AIModel[];
  agents: AIAgent[];
  partners: AIPartner[];
  error: string | null;
}

let cache: { key: string; at: number; promise: Promise<Catalog> } | null = null;
const TTL = 60_000;

async function loadCatalog(): Promise<Catalog> {
  const [modelsRes, agentsRes, partnersRes] = await Promise.allSettled([
    apiFetch<{ models: AIModel[] }>("/api/ai/models"),
    supabase
      .from("agents")
      .select("id, name, slug, description, icon, avatar_url, default_model_id")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("partners")
      .select("id, name, description, personality, avatar_url, ai_model_id, agent_id")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name"),
  ]);
  const models = modelsRes.status === "fulfilled" ? modelsRes.value.models : [];
  const agents =
    agentsRes.status === "fulfilled" ? ((agentsRes.value.data ?? []) as AIAgent[]) : [];
  const rawPartners =
    partnersRes.status === "fulfilled" ? ((partnersRes.value.data ?? []) as AIPartner[]) : [];
  const modelMap = new Map(models.map((m) => [m.id, m]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const partners = rawPartners.map((p) => ({
    ...p,
    model: p.ai_model_id ? modelMap.get(p.ai_model_id) : undefined,
    agent: p.agent_id ? agentMap.get(p.agent_id) : undefined,
  }));
  const error =
    modelsRes.status === "rejected" ? "Catalogue des modèles indisponible (serveur)." : null;
  return { models, agents, partners, error };
}

export function invalidateAIConfig() {
  cache = null;
}

export function useAIConfig() {
  const { profile } = useAuth();
  const [state, setState] = useState<Catalog & { loading: boolean }>({
    models: [],
    agents: [],
    partners: [],
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!profile) return;
    const key = `${profile.id}:${profile.role}`;
    if (!cache || cache.key !== key || Date.now() - cache.at > TTL)
      cache = { key, at: Date.now(), promise: loadCatalog() };
    let alive = true;
    cache.promise
      .then((c) => alive && setState({ ...c, loading: false }))
      .catch(
        () =>
          alive &&
          setState({
            models: [],
            agents: [],
            partners: [],
            error: "Catalogue indisponible",
            loading: false,
          }),
      );
    return () => {
      alive = false;
    };
  }, [profile?.id, profile?.role]);

  return state;
}
