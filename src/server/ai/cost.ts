/**
 * Estimation de coût d'une requête.
 * Renvoie null (« indisponible ») dès qu'une donnée manque : tarif absent pour
 * la date, ou tokens non renvoyés par le fournisseur. Jamais 0 par défaut.
 * Limite : les paliers « long contexte » des fournisseurs ne sont pas
 * modélisés ; l'estimation applique le tarif standard saisi.
 */
export interface PricingRow {
  id: string;
  currency: string;
  input_per_mtok: number | string;
  output_per_mtok: number | string;
  cached_input_per_mtok: number | string | null;
  effective_from: string;
}

export interface UsageTokens {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export function estimateCost(
  pricing: PricingRow | null | undefined,
  usage: UsageTokens,
): number | null {
  if (!pricing) return null;
  if (usage.inputTokens === undefined || usage.outputTokens === undefined) return null;
  const inRate = Number(pricing.input_per_mtok);
  const outRate = Number(pricing.output_per_mtok);
  const cachedRate =
    pricing.cached_input_per_mtok === null ? inRate : Number(pricing.cached_input_per_mtok);
  if (![inRate, outRate, cachedRate].every(Number.isFinite)) return null;
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const cost = (fresh * inRate + cached * cachedRate + usage.outputTokens * outRate) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
