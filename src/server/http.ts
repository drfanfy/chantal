/**
 * Utilitaires HTTP des routes API : erreurs typées, réponses JSON, lecture
 * validée du corps. Les messages d'erreur renvoyés au client sont en français
 * et ne contiennent jamais de secret ni de trace interne.
 */
import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const forbidden = (msg = "Action non autorisée pour votre rôle") => new ApiError(403, "forbidden", msg);
export const notFound = (msg = "Ressource introuvable") => new ApiError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details);

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
  }
  console.error("[api] erreur inattendue", e instanceof Error ? e.message : e);
  return json({ error: { code: "internal", message: "Erreur interne du serveur" } }, 500);
}

/** Enveloppe un handler : toute exception devient une réponse JSON propre. */
export function handle(fn: (ctx: { request: Request }) => Promise<Response>) {
  return async (ctx: { request: Request }) => {
    try {
      return await fn(ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 1_000_000): Promise<T> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError(413, "payload_too_large", "Requête trop volumineuse");
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "Requête trop volumineuse");
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest("Corps JSON invalide");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest(
      "Données invalides",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}
