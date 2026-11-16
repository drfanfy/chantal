/** Prompts publiés visibles par l'utilisateur (RLS : statut publié + rôle). */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { renderTemplate } from "./workflows/template";

export interface PromptVariable {
  name: string;
  label: string;
  required?: boolean;
  description?: string;
  default?: string;
}

export interface PromptExample {
  title?: string;
  input?: string;
  output?: string;
}

export interface PublishedPrompt {
  id: string;
  slug: string;
  tags: string[];
  isDemo: boolean;
  category: string | null;
  versionId: string;
  version: number;
  title: string;
  description: string;
  instructions: string;
  content: string;
  variables: PromptVariable[];
  examples: PromptExample[];
}

interface Row {
  id: string;
  slug: string;
  tags: string[];
  is_demo: boolean;
  category: { name: string } | null;
  version: {
    id: string;
    version: number;
    title: string;
    description: string;
    instructions: string;
    content: string;
    variables: PromptVariable[];
    examples: PromptExample[];
  } | null;
}

let cache: Promise<PublishedPrompt[]> | null = null;

export function invalidatePrompts() {
  cache = null;
}

async function load(): Promise<PublishedPrompt[]> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select(
      "id, slug, tags, is_demo, category:prompt_categories(name), version:prompt_versions!published_version_id(id, version, title, description, instructions, content, variables, examples)",
    )
    .eq("status", "published");
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.version)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      tags: r.tags ?? [],
      isDemo: r.is_demo,
      category: r.category?.name ?? null,
      versionId: r.version!.id,
      version: r.version!.version,
      title: r.version!.title,
      description: r.version!.description,
      instructions: r.version!.instructions,
      content: r.version!.content,
      variables: Array.isArray(r.version!.variables) ? r.version!.variables : [],
      examples: Array.isArray(r.version!.examples) ? r.version!.examples : [],
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

export function usePublishedPrompts() {
  const [state, setState] = useState<{
    prompts: PublishedPrompt[];
    loading: boolean;
    error: string | null;
  }>({ prompts: [], loading: true, error: null });
  useEffect(() => {
    cache ??= load();
    let alive = true;
    cache
      .then((prompts) => alive && setState({ prompts, loading: false, error: null }))
      .catch(() => {
        cache = null;
        if (alive) setState({ prompts: [], loading: false, error: "Bibliothèque indisponible" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function renderPrompt(p: Pick<PublishedPrompt, "content">, values: Record<string, string>) {
  return renderTemplate(p.content, values).text;
}

/** Trace l'utilisation (version exacte) — ne bloque pas l'usage en cas d'échec. */
export async function recordPromptUsage(versionId: string) {
  const { error } = await supabase.rpc("record_prompt_usage", {
    p_version_id: versionId,
    p_context: "chat",
  });
  if (error) console.error("[prompts] traçabilité impossible", error.message);
}
