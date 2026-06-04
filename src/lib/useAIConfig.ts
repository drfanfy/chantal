import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  beta_tester: 1,
  admin: 2,
  super_admin: 3,
};

function canAccess(userRole: string | null | undefined, minRole: string): boolean {
  return (ROLE_RANK[userRole ?? "viewer"] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  model_id: string | null;
  env_key: string | null;
  min_role: string;
  is_active: boolean;
  created_at: string;
}

export interface AIAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  system_prompt: string | null;
  use_cases: string | null;
  icon: string | null;
  min_role: string;
  is_active: boolean;
  created_at: string;
}

export interface AIPartner {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  personality: string | null;
  system_prompt: string | null;
  avatar_url: string | null;
  ai_model_id: string | null;
  agent_id: string | null;
  is_active: boolean;
  created_at: string;
  model?: AIModel;
  agent?: AIAgent;
}

export function useAIConfig() {
  const { profile } = useAuth();
  const [models, setModels] = useState<AIModel[]>([]);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [partners, setPartners] = useState<AIPartner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    async function load() {
      setLoading(true);

      const [modelsRes, agentsRes, partnersRes] = await Promise.all([
        supabase.from("ai_models").select("*").eq("is_active", true).order("created_at"),
        supabase.from("agents").select("*").eq("is_active", true).order("created_at"),
        supabase.from("partners").select("*").eq("is_active", true).order("created_at"),
      ]);

      const userRole = profile?.role;
      const allModels = (modelsRes.data ?? []) as AIModel[];
      const allAgents = (agentsRes.data ?? []) as AIAgent[];
      const allPartners = (partnersRes.data ?? []) as AIPartner[];

      const modelMap = new Map(allModels.map(m => [m.id, m]));
      const agentMap = new Map(allAgents.map(a => [a.id, a]));

      setModels(allModels.filter(m => canAccess(userRole, m.min_role)));
      setAgents(allAgents.filter(a => canAccess(userRole, a.min_role)));
      setPartners(
        allPartners.map(p => ({
          ...p,
          model: p.ai_model_id ? modelMap.get(p.ai_model_id) : undefined,
          agent: p.agent_id ? agentMap.get(p.agent_id) : undefined,
        }))
      );

      setLoading(false);
    }

    load().catch(console.error);
  }, [profile?.id, profile?.role]);

  return { models, agents, partners, loading };
}
