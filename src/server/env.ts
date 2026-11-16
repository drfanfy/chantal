/**
 * Configuration serveur (variables d'environnement SANS préfixe VITE_ :
 * jamais incluses dans le bundle navigateur). Voir .env.example.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function int(name: string, def: number, min: number, max: number): number {
  const raw = read(name);
  const n = raw ? Number.parseInt(raw, 10) : def;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
}

function list(name: string): string[] {
  return (read(name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface ServerConfig {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  appEnv: "development" | "staging" | "production";
  /** Hôtes autorisés pour les connexions IA « compatibles OpenAI » (en plus des fournisseurs officiels). */
  aiAllowedHosts: string[];
  /** Hôtes autorisés pour les connexions HTTP des workflows. */
  workflowHttpAllowedHosts: string[];
  aiRequestTimeoutMs: number;
  aiMaxConcurrentPerUser: number;
  aiEnableMockProvider: boolean;
  workflowMaxActiveRunsPerUser: number;
  chatMaxAttachmentBytes: number;
  titleModelApiId: string | undefined;
  cronSecret: string | undefined;
}

export function serverConfig(): ServerConfig {
  const appEnv = (read("APP_ENV") ?? (process.env.NODE_ENV === "production" ? "production" : "development")) as ServerConfig["appEnv"];
  return {
    supabaseUrl: read("SUPABASE_URL") ?? read("VITE_SUPABASE_URL"),
    supabaseAnonKey: read("SUPABASE_ANON_KEY") ?? read("VITE_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    appEnv: ["development", "staging", "production"].includes(appEnv) ? appEnv : "production",
    aiAllowedHosts: list("AI_ALLOWED_HOSTS"),
    workflowHttpAllowedHosts: list("WORKFLOW_HTTP_ALLOWED_HOSTS"),
    aiRequestTimeoutMs: int("AI_REQUEST_TIMEOUT_MS", 120_000, 5_000, 290_000),
    aiMaxConcurrentPerUser: int("AI_MAX_CONCURRENT_PER_USER", 3, 1, 20),
    // Le fournisseur fictif n'est jamais disponible en production.
    aiEnableMockProvider: read("AI_ENABLE_MOCK_PROVIDER") === "true" && appEnv !== "production",
    workflowMaxActiveRunsPerUser: int("WORKFLOW_MAX_ACTIVE_RUNS_PER_USER", 2, 1, 10),
    chatMaxAttachmentBytes: int("CHAT_MAX_ATTACHMENT_BYTES", 10 * 1024 * 1024, 1024, 30 * 1024 * 1024),
    titleModelApiId: read("CHAT_TITLE_MODEL"),
    cronSecret: read("CRON_SECRET"),
  };
}

/**
 * Lecture d'un secret référencé en base (secret_ref). Seuls les noms de la
 * liste blanche ou préfixés CHANTAL_SECRET_ sont lisibles : un administrateur
 * ne peut pas faire pointer une connexion vers SUPABASE_SERVICE_ROLE_KEY ou
 * toute autre variable sensible du serveur.
 */
export const ALLOWED_SECRET_NAMES = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "AZURE_OPENAI_API_KEY",
]);

export function isAllowedSecretName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(name) && (ALLOWED_SECRET_NAMES.has(name) || name.startsWith("CHANTAL_SECRET_"));
}

export function readSecret(name: string | null | undefined): string | undefined {
  if (!name || !isAllowedSecretName(name)) return undefined;
  return read(name);
}
