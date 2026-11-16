/**
 * Adaptateur Anthropic (Claude) via le SDK officiel @anthropic-ai/sdk.
 *
 * Version d'API 2026-10-21 (portée par le SDK 1.x) : `temperature`, `top_p`,
 * `top_k` sont refusés → jamais envoyés. La réflexion (thinking) est gérée
 * par le modèle ; seuls les blocs de texte sont restitués.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderError,
  errorCodeFromStatus,
  sanitizeDetail,
  type ChatMessage,
  type CompletionRequest,
  type ProviderAdapter,
  type ResolvedConnection,
  type StreamEvent,
} from "../types";

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const blocks: Anthropic.ContentBlockParam[] = [];
    // Documents et images avant le texte (recommandation fournisseur)
    for (const p of m.content) {
      if (p.type === "file") {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 }, title: p.filename });
      } else if (p.type === "image") {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: p.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: p.base64 },
        });
      }
    }
    for (const p of m.content) if (p.type === "text") blocks.push({ type: "text", text: p.text });
    return { role: m.role, content: blocks };
  });
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  description: "API Claude officielle via le SDK @anthropic-ai/sdk (streaming, images, PDF).",
  supported: { text: true, streaming: true, vision: true, files: true, structured_output: false, tools: false },
  supportsTemperature: false,
  requiresBaseUrl: false,
  officialHosts: ["api.anthropic.com"],
  defaultBaseUrl: "https://api.anthropic.com",

  async *stream(conn: ResolvedConnection, req: CompletionRequest): AsyncGenerator<StreamEvent> {
    const client = new Anthropic({
      apiKey: conn.apiKey,
      baseURL: conn.baseUrl ?? undefined,
      maxRetries: 0, // pas de reprise automatique : une requête = un événement d'usage
      timeout: 290_000,
    });
    let inputTokens: number | undefined;
    let cachedInputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      const stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          ...(req.system ? { system: req.system } : {}),
          messages: toAnthropicMessages(req.messages),
        },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === "message_start") {
          const u = event.message.usage;
          cachedInputTokens = u.cache_read_input_tokens ?? 0;
          inputTokens = (u.input_tokens ?? 0) + cachedInputTokens + (u.cache_creation_input_tokens ?? 0);
          outputTokens = u.output_tokens ?? undefined;
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.type === "message_delta") {
          if (event.usage?.output_tokens != null) outputTokens = event.usage.output_tokens;
          const stop = event.delta.stop_reason;
          if (stop === "refusal") throw new ProviderError("refusal");
          if (stop) yield { type: "finish", reason: stop };
        }
      }
      if (inputTokens !== undefined || outputTokens !== undefined) {
        yield { type: "usage", inputTokens, outputTokens, cachedInputTokens };
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (req.signal.aborted) throw new ProviderError("cancelled");
      if (e instanceof Anthropic.APIError && typeof e.status === "number") {
        throw new ProviderError(errorCodeFromStatus(e.status), e.status, sanitizeDetail(e.message, [conn.apiKey]));
      }
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("timeout");
      if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("network");
      throw new ProviderError("unknown", undefined, sanitizeDetail(e instanceof Error ? e.message : String(e), [conn.apiKey]));
    }
  },
};
