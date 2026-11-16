/**
 * POST /api/chat — envoi d'un message et réponse IA en streaming (SSE).
 *
 * Événements émis (text/event-stream, une ligne `data:` JSON par événement) :
 *   {type:"meta", conversationId, userMessageId, created}
 *   {type:"delta", text}
 *   {type:"done", messageId, title?, usage}
 *   {type:"error", code, message, messageId?}
 */
import { z } from "zod";
import { serverConfig } from "./env";
import { ApiError, readBody } from "./http";
import { requireUser, type AuthContext } from "./auth";
import { providerErrorToApi, resolveModel, runCompletion, type ResolvedModel } from "./ai/gateway";
import { ProviderError, type ChatMessage, type ChatPart } from "./ai/types";

export const CHANTAL_BASE_PROMPT = `Tu es Chantal, l'assistante IA interne du groupe QUARTUS, promoteur immobilier.
Tu aides les équipes dans leurs tâches quotidiennes. Réponds toujours en français, de manière professionnelle et concise.
N'invente pas de chiffres ni de faits : signale clairement les informations manquantes.`;

const HISTORY_LIMIT = 40;

export const chatBodySchema = z.object({
  conversationId: z.string().uuid().nullish(),
  clientRequestId: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  content: z.string().max(50_000),
  modelId: z.string().uuid().nullish(),
  agentId: z.string().uuid().nullish(),
  partnerId: z.string().uuid().nullish(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
});
export type ChatBody = z.infer<typeof chatBodySchema>;

interface AgentRow {
  id: string;
  name: string;
  system_prompt: string | null;
  icon: string | null;
  default_model_id: string | null;
}
interface PartnerRow {
  id: string;
  name: string;
  system_prompt: string | null;
  avatar_url: string | null;
  ai_model_id: string | null;
  agent_id: string | null;
}
interface AttachmentRow {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  message_id: string | null;
}

export function buildSystemPrompt(agent: AgentRow | null, partner: PartnerRow | null): string {
  return [CHANTAL_BASE_PROMPT, agent?.system_prompt?.trim(), partner?.system_prompt?.trim()]
    .filter(Boolean)
    .join("\n\n");
}

async function loadAttachmentsParts(
  ctx: AuthContext,
  rows: AttachmentRow[],
  resolved: ResolvedModel,
): Promise<ChatPart[]> {
  const cfg = serverConfig();
  const parts: ChatPart[] = [];
  for (const a of rows) {
    if (a.size_bytes > cfg.chatMaxAttachmentBytes)
      throw new ApiError(413, "attachment_too_large", `Fichier « ${a.file_name} » trop volumineux`);
    const isImage = a.mime_type.startsWith("image/");
    const isPdf = a.mime_type === "application/pdf";
    const isText = a.mime_type === "text/plain";
    if (isImage && !resolved.capabilities.vision)
      throw new ApiError(
        400,
        "capability_unsupported",
        `Le modèle « ${resolved.model.name} » n'accepte pas les images.`,
      );
    if (isPdf && !resolved.capabilities.files)
      throw new ApiError(
        400,
        "capability_unsupported",
        `Le modèle « ${resolved.model.name} » n'accepte pas les PDF.`,
      );
    if (!isImage && !isPdf && !isText)
      throw new ApiError(
        400,
        "unsupported_file",
        `Type de fichier non pris en charge : ${a.mime_type}`,
      );
    const { data, error } = await ctx.admin.storage.from("chat-files").download(a.storage_path);
    if (error || !data)
      throw new ApiError(
        404,
        "attachment_missing",
        `Fichier « ${a.file_name} » introuvable dans le stockage`,
      );
    const buf = Buffer.from(await data.arrayBuffer());
    if (isText)
      parts.push({
        type: "text",
        text: `Contenu du fichier « ${a.file_name} » :\n\n${buf.toString("utf8").slice(0, 200_000)}`,
      });
    else if (isImage)
      parts.push({ type: "image", mimeType: a.mime_type, base64: buf.toString("base64") });
    else
      parts.push({
        type: "file",
        mimeType: "application/pdf",
        base64: buf.toString("base64"),
        filename: a.file_name,
      });
  }
  return parts;
}

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function handleChat(request: Request): Promise<Response> {
  const ctx = await requireUser(request, "chat.use");
  const body = await readBody(request, chatBodySchema, 200_000);
  if (!body.content.trim() && body.attachmentIds.length === 0)
    throw new ApiError(400, "empty_message", "Message vide");

  // ── Partenaire / agent (lus AU NOM de l'utilisateur : RLS + min_role) ─────
  let partner: PartnerRow | null = null;
  if (body.partnerId) {
    const { data } = await ctx.db
      .from("partners")
      .select("id, name, system_prompt, avatar_url, ai_model_id, agent_id")
      .eq("id", body.partnerId)
      .maybeSingle<PartnerRow>();
    if (!data) throw new ApiError(404, "partner_unavailable", "Partenaire indisponible");
    partner = data;
  }
  const agentId = partner?.agent_id ?? body.agentId ?? null;
  let agent: AgentRow | null = null;
  if (agentId) {
    const { data } = await ctx.db
      .from("agents")
      .select("id, name, system_prompt, icon, default_model_id")
      .eq("id", agentId)
      .maybeSingle<AgentRow>();
    if (!data) throw new ApiError(404, "agent_unavailable", "Agent indisponible");
    agent = data;
  }
  const modelId = partner?.ai_model_id ?? body.modelId ?? agent?.default_model_id ?? null;
  if (!modelId) throw new ApiError(400, "model_required", "Choisissez un modèle IA");
  // Aucune substitution : si le modèle demandé est indisponible, l'appel échoue explicitement.
  const resolved = await resolveModel(ctx.admin, modelId, {
    role: ctx.role,
    purpose: agent || partner ? "agents" : "chat",
  });

  // ── Conversation : propriété vérifiée ─────────────────────────────────────
  let conversationId = body.conversationId ?? null;
  let created = false;
  if (conversationId) {
    const { data: conv } = await ctx.db
      .from("conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .maybeSingle<{ id: string; user_id: string }>();
    if (!conv) throw new ApiError(404, "conversation_not_found", "Conversation introuvable");
    if (conv.user_id !== ctx.userId)
      throw new ApiError(
        403,
        "read_only",
        "Conversation en lecture seule : seule la personne qui l'a créée peut y écrire",
      );
  } else {
    const title = (body.content.trim() || "Nouvelle conversation")
      .replace(/\s+/g, " ")
      .slice(0, 60);
    const { data: conv, error } = await ctx.db
      .from("conversations")
      .insert({
        user_id: ctx.userId,
        title,
        ai_model_id: resolved.model.id,
        agent_id: agent?.id ?? null,
        partner_id: partner?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !conv)
      throw new ApiError(500, "conversation_error", "Création de la conversation impossible");
    conversationId = conv.id;
    created = true;
  }

  // ── Pièces jointes (doivent appartenir à l'utilisateur et à cette conversation) ─
  let attachments: AttachmentRow[] = [];
  if (body.attachmentIds.length) {
    const { data } = await ctx.db
      .from("message_attachments")
      .select("id, storage_path, file_name, mime_type, size_bytes, message_id")
      .in("id", body.attachmentIds)
      .eq("user_id", ctx.userId)
      .eq("conversation_id", conversationId);
    attachments = (data ?? []) as AttachmentRow[];
    if (attachments.length !== body.attachmentIds.length || attachments.some((a) => a.message_id)) {
      throw new ApiError(400, "attachment_invalid", "Pièce jointe invalide ou déjà envoyée");
    }
  }
  const attachmentParts = await loadAttachmentsParts(ctx, attachments, resolved);

  // ── Historique (avant insertion du nouveau message) ───────────────────────
  const { data: past } = await ctx.admin
    .from("messages")
    .select("role, content, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: ChatMessage[] = (
    (past ?? []) as { role: string; content: string; status: string }[]
  )
    .reverse()
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") && m.status !== "error" && m.content.trim(),
    )
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ── Message utilisateur (écrit au nom de l'utilisateur : RLS) ─────────────
  const { data: userMsg, error: umErr } = await ctx.db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: body.content,
      ai_model_id: resolved.model.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (umErr || !userMsg)
    throw new ApiError(500, "message_error", "Enregistrement du message impossible");
  if (attachments.length) {
    await ctx.db
      .from("message_attachments")
      .update({ message_id: userMsg.id })
      .in(
        "id",
        attachments.map((a) => a.id),
      );
  }

  const current: ChatMessage = attachmentParts.length
    ? {
        role: "user",
        content: [
          ...attachmentParts,
          { type: "text", text: body.content || "Analyse les fichiers joints." },
        ],
      }
    : { role: "user", content: body.content };

  const speaker = {
    speaker_name: partner?.name ?? agent?.name ?? resolved.model.name,
    speaker_avatar_url: partner?.avatar_url ?? null,
    speaker_icon: agent?.icon ?? null,
  };
  const convId = conversationId;
  const abort = new AbortController();
  request.signal?.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (d: unknown) => {
        try {
          controller.enqueue(sse(d));
        } catch {
          /* client parti */
        }
      };
      send({ type: "meta", conversationId: convId, userMessageId: userMsg.id, created });
      try {
        const result = await runCompletion({
          admin: ctx.admin,
          userId: ctx.userId,
          resolved,
          request: { system: buildSystemPrompt(agent, partner), messages: [...history, current] },
          meta: {
            source: "chat",
            conversationId: convId,
            agentId: agent?.id,
            partnerId: partner?.id,
            requestId: `chat:${ctx.userId}:${body.clientRequestId}`,
          },
          signal: abort.signal,
          onText: (t) => send({ type: "delta", text: t }),
        });
        const { data: aMsg } = await ctx.admin
          .from("messages")
          .insert({
            conversation_id: convId,
            role: "assistant",
            content: result.text,
            ai_model_id: resolved.model.id,
            usage_event_id: result.usageEventId,
            status: "complete",
            ...speaker,
          })
          .select("id")
          .single<{ id: string }>();
        await ctx.admin
          .from("conversations")
          .update({
            ai_model_id: resolved.model.id,
            agent_id: agent?.id ?? null,
            partner_id: partner?.id ?? null,
          })
          .eq("id", convId);
        const title = created ? await generateTitle(ctx, body.content, result.text, convId) : null;
        send({
          type: "done",
          messageId: aMsg?.id ?? null,
          title,
          usage: {
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            latencyMs: result.latencyMs,
            durationMs: result.durationMs,
          },
        });
      } catch (e) {
        const err = providerErrorToApi(e);
        const partial = (e as { partialText?: string }).partialText ?? "";
        const cancelled = e instanceof ProviderError && e.code === "cancelled";
        const content = cancelled && partial ? partial : `⚠️ ${err.message}`;
        const { data: aMsg } = await ctx.admin
          .from("messages")
          .insert({
            conversation_id: convId,
            role: "assistant",
            content,
            ai_model_id: resolved.model.id,
            status: cancelled ? "cancelled" : "error",
            usage_event_id: (e as { usageEventId?: string }).usageEventId ?? null,
            ...speaker,
          })
          .select("id")
          .single<{ id: string }>();
        send({ type: "error", code: err.code, message: err.message, messageId: aMsg?.id ?? null });
      } finally {
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Titre automatique : uniquement si CHAT_TITLE_MODEL désigne un modèle ACTIF du
 * catalogue (identifiant API). Sinon le titre tronqué est conservé. Toute
 * erreur est silencieuse pour l'utilisateur mais tracée dans l'usage.
 */
async function generateTitle(
  ctx: AuthContext,
  question: string,
  answer: string,
  conversationId: string,
): Promise<string | null> {
  const apiId = serverConfig().titleModelApiId;
  if (!apiId) return null;
  try {
    const { data: m } = await ctx.admin
      .from("ai_models")
      .select("id")
      .eq("api_model_id", apiId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!m) return null;
    const resolved = await resolveModel(ctx.admin, m.id, { role: ctx.role, purpose: "title" });
    const r = await runCompletion({
      admin: ctx.admin,
      userId: ctx.userId,
      resolved,
      request: {
        system: "Tu produis des titres courts.",
        messages: [
          {
            role: "user",
            content: `Donne un titre de 3 à 6 mots, sans guillemets ni ponctuation finale, pour cet échange.\n\nQuestion : ${question.slice(0, 1500)}\n\nRéponse : ${answer.slice(0, 1500)}`,
          },
        ],
        maxOutputTokens: 30,
      },
      meta: { source: "title", conversationId },
      timeoutMs: 20_000,
      skipLimits: true,
    });
    const title = r.text
      .replace(/["«»\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!title) return null;
    await ctx.admin.from("conversations").update({ title }).eq("id", conversationId);
    return title;
  } catch {
    return null;
  }
}
