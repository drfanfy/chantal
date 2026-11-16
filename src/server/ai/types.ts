/**
 * Contrat commun des adaptateurs fournisseurs IA.
 * Ajouter un fournisseur = implémenter ProviderAdapter et l'enregistrer dans
 * registry.ts (cf. docs/04-integrations-ia.md).
 */
export const ADAPTER_IDS = ["openai", "anthropic", "google", "openai_compatible", "mock"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

export const CAPABILITIES = [
  "text",
  "streaming",
  "vision",
  "files",
  "structured_output",
  "tools",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type CapabilityMap = Partial<Record<Capability, boolean>>;

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; base64: string }
  | { type: "file"; mimeType: "application/pdf"; base64: string; filename: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ChatPart[];
}

export interface CompletionRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  signal: AbortSignal;
}

export interface ResolvedConnection {
  adapter: AdapterId;
  baseUrl?: string | null;
  apiVersion?: string | null;
  region?: string | null;
  deployment?: string | null;
  apiKey?: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  /** Valeurs cumulées : inputTokens INCLUT les tokens servis depuis le cache. */
  | { type: "usage"; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }
  | { type: "finish"; reason: string };

export interface ProviderAdapter {
  id: AdapterId;
  label: string;
  description: string;
  /** Capacités réellement exécutées par CHANTAL avec cet adaptateur. */
  supported: Record<Capability, boolean>;
  /** Paramètre temperature transmis au fournisseur. */
  supportsTemperature: boolean;
  /** Une URL de base est obligatoire (endpoints d'entreprise / compatibles). */
  requiresBaseUrl: boolean;
  /** Hôtes officiels acceptés sans liste blanche supplémentaire. */
  officialHosts: string[];
  defaultBaseUrl?: string;
  stream(conn: ResolvedConnection, req: CompletionRequest): AsyncGenerator<StreamEvent>;
}

export type ProviderErrorCode =
  | "auth"
  | "not_found"
  | "rate_limit"
  | "bad_request"
  | "timeout"
  | "unavailable"
  | "refusal"
  | "cancelled"
  | "network"
  | "unknown";

export const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  auth: "Clé d'API refusée par le fournisseur (invalide, expirée ou sans droits).",
  not_found: "Modèle introuvable chez le fournisseur (identifiant erroné ou modèle retiré).",
  rate_limit: "Limite de débit ou de quota atteinte chez le fournisseur. Réessayez plus tard.",
  bad_request: "Requête refusée par le fournisseur (paramètre non supporté ou contenu invalide).",
  timeout: "Le fournisseur n'a pas répondu dans le délai imparti.",
  unavailable: "Service du fournisseur momentanément indisponible.",
  refusal: "Le modèle a refusé de traiter cette demande.",
  cancelled: "Génération interrompue.",
  network: "Impossible de joindre le fournisseur.",
  unknown: "Erreur inattendue du fournisseur.",
};

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    public status?: number,
    /** Détail technique nettoyé (jamais de secret), destiné aux administrateurs. */
    public detail?: string,
  ) {
    super(PROVIDER_ERROR_MESSAGES[code]);
  }
}

export function errorCodeFromStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "unavailable";
  if (status >= 400) return "bad_request";
  return "unknown";
}

/** Retire tout ce qui ressemble à un secret avant journalisation / affichage. */
export function sanitizeDetail(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[masqué]");
  out = out.replace(
    /(sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,}|gsk_[A-Za-z0-9]{6,}|Bearer\s+[A-Za-z0-9._-]{8,})/g,
    "[masqué]",
  );
  return out.slice(0, 500);
}
