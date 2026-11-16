import { anthropicAdapter } from "./adapters/anthropic";
import { googleAdapter } from "./adapters/google";
import { mockAdapter } from "./adapters/mock";
import { openaiAdapter, openaiCompatibleAdapter } from "./adapters/openai";
import { CAPABILITIES, type AdapterId, type CapabilityMap, type ProviderAdapter } from "./types";

export const ADAPTERS: Record<AdapterId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openai_compatible: openaiCompatibleAdapter,
  mock: mockAdapter,
};

export function getAdapter(id: string): ProviderAdapter | undefined {
  return (ADAPTERS as Record<string, ProviderAdapter>)[id];
}

/**
 * Capacités effectives = déclarées par l'administrateur ET réellement
 * exécutées par l'adaptateur. Une case cochée ne suffit jamais.
 */
export function effectiveCapabilities(
  adapterId: string,
  declared: CapabilityMap | null | undefined,
): CapabilityMap {
  const adapter = getAdapter(adapterId);
  const out: CapabilityMap = {};
  for (const c of CAPABILITIES)
    out[c] = Boolean(adapter?.supported[c] && (c === "text" || declared?.[c]));
  return out;
}

/** Description publique des adaptateurs (pour le back-office). */
export function describeAdapters() {
  return Object.values(ADAPTERS).map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    supported: a.supported,
    supportsTemperature: a.supportsTemperature,
    requiresBaseUrl: a.requiresBaseUrl,
    officialHosts: a.officialHosts,
    defaultBaseUrl: a.defaultBaseUrl ?? null,
  }));
}
