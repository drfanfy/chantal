/**
 * Appels aux routes serveur /api/* avec le jeton de session Supabase.
 * Toute la logique sensible (clés IA, contrôles de droits) vit côté serveur.
 */
import { supabase } from "@/lib/supabase";

export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function toError(res: Response): Promise<ClientApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = await res.json();
  } catch {
    /* corps non JSON */
  }
  return new ClientApiError(
    res.status,
    body.error?.code ?? "http_error",
    body.error?.message ?? `Erreur ${res.status}`,
    body.error?.details,
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(await authHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  };
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ClientApiError(0, "network", "Serveur injoignable. Vérifiez votre connexion.");
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export const apiPost = <T>(path: string, body: unknown, init: RequestInit = {}) =>
  apiFetch<T>(path, { ...init, method: "POST", body: JSON.stringify(body) });

/** Détails lisibles d'une erreur de validation renvoyée par le serveur. */
export function errorDetails(e: unknown): string[] {
  if (!(e instanceof ClientApiError) || !e.details) return [];
  if (Array.isArray(e.details))
    return e.details.map((d) =>
      typeof d === "string"
        ? d
        : `${(d as { path?: string }).path ?? ""} ${(d as { message?: string }).message ?? ""}`.trim(),
    );
  if (typeof e.details === "object")
    return Object.entries(e.details as Record<string, string>).map(([k, v]) => `${k} : ${v}`);
  return [];
}

export function errorMessage(e: unknown): string {
  if (e instanceof ClientApiError) return e.message;
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    const m = (e as { message: string }).message;
    if (/row-level security|permission denied|42501/i.test(m))
      return "Action non autorisée pour votre rôle.";
    return m;
  }
  return "Une erreur inattendue est survenue.";
}

export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; created: boolean }
  | { type: "delta"; text: string }
  | {
      type: "done";
      messageId: string | null;
      title: string | null;
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
        latencyMs: number | null;
        durationMs: number;
      };
    }
  | { type: "error"; code: string; message: string; messageId: string | null };

/** POST en streaming SSE : appelle onEvent pour chaque événement reçu. */
export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return;
    throw new ClientApiError(0, "network", "Serveur injoignable. Vérifiez votre connexion.");
  }
  if (!res.ok || !res.body) throw await toError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (data) onEvent(JSON.parse(data) as ChatStreamEvent);
      }
    }
  } catch (e) {
    if (!signal?.aborted) throw e;
  }
}

export function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
