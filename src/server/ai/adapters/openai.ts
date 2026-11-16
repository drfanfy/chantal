/**
 * Adaptateurs OpenAI (API officielle) et « compatible OpenAI » (Groq, Mistral,
 * Azure OpenAI v1, vLLM, passerelles d'entreprise…), via l'API documentée
 * Chat Completions en streaming SSE.
 *
 * Différences gérées :
 *  - officiel : `max_completion_tokens`, pas de `temperature` (refusée par les
 *    modèles à raisonnement actuels) ;
 *  - compatible : `max_tokens` (forme la plus répandue), `temperature` transmise
 *    si définie. Aucune fonctionnalité spécifique OpenAI n'est supposée.
 */
import { readSseData } from "../sse";
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

type OpenAIContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export function toOpenAIMessages(system: string | undefined, messages: ChatMessage[]) {
  const out: Array<{ role: "system" | "user" | "assistant"; content: OpenAIContent }> = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const parts: Exclude<OpenAIContent, string> = [];
    for (const p of m.content) {
      if (p.type === "text") parts.push({ type: "text", text: p.text });
      else if (p.type === "image")
        parts.push({
          type: "image_url",
          image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
        });
      else
        throw new ProviderError(
          "bad_request",
          undefined,
          "Fichiers PDF non pris en charge par cet adaptateur",
        );
    }
    out.push({ role: m.role, content: parts });
  }
  return out;
}

function makeAdapter(kind: "openai" | "openai_compatible"): ProviderAdapter {
  const official = kind === "openai";
  return {
    id: kind,
    label: official ? "OpenAI" : "Compatible OpenAI",
    description: official
      ? "API officielle OpenAI (Chat Completions)."
      : "Tout endpoint exposant /chat/completions au format OpenAI (Groq, Mistral, Azure OpenAI v1, vLLM…). Les capacités dépendent du fournisseur : testez avant activation.",
    supported: {
      text: true,
      streaming: true,
      vision: true,
      files: false,
      structured_output: true,
      tools: false,
    },
    supportsTemperature: !official,
    requiresBaseUrl: !official,
    officialHosts: official ? ["api.openai.com"] : [],
    defaultBaseUrl: official ? "https://api.openai.com/v1" : undefined,

    async *stream(conn: ResolvedConnection, req: CompletionRequest): AsyncGenerator<StreamEvent> {
      const base = (conn.baseUrl ?? (official ? "https://api.openai.com/v1" : "")).replace(
        /\/+$/,
        "",
      );
      if (!base) throw new ProviderError("bad_request", undefined, "URL de base manquante");
      const body: Record<string, unknown> = {
        model: req.model,
        messages: toOpenAIMessages(req.system, req.messages),
        stream: true,
        stream_options: { include_usage: true },
      };
      if (official) body.max_completion_tokens = req.maxOutputTokens;
      else body.max_tokens = req.maxOutputTokens;
      if (!official && req.temperature !== undefined) body.temperature = req.temperature;
      if (req.responseFormat === "json") body.response_format = { type: "json_object" };

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (conn.apiKey) headers.authorization = `Bearer ${conn.apiKey}`;
      if (conn.apiVersion) headers["api-version"] = conn.apiVersion;

      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: req.signal,
          redirect: "manual",
        });
      } catch {
        if (req.signal.aborted) throw new ProviderError("cancelled");
        throw new ProviderError("network");
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new ProviderError(
          errorCodeFromStatus(res.status),
          res.status,
          sanitizeDetail(text, [conn.apiKey]),
        );
      }

      for await (const data of readSseData(res.body, req.signal)) {
        if (data === "[DONE]") break;
        let json: {
          choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          } | null;
          error?: { message?: string };
        };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error)
          throw new ProviderError(
            "unknown",
            undefined,
            sanitizeDetail(json.error.message ?? "", [conn.apiKey]),
          );
        const choice = json.choices?.[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        if (choice?.finish_reason) {
          if (choice.finish_reason === "content_filter") throw new ProviderError("refusal");
          yield { type: "finish", reason: choice.finish_reason };
        }
        if (json.usage) {
          yield {
            type: "usage",
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
            cachedInputTokens: json.usage.prompt_tokens_details?.cached_tokens,
          };
        }
      }
      if (req.signal.aborted) throw new ProviderError("cancelled");
    },
  };
}

export const openaiAdapter = makeAdapter("openai");
export const openaiCompatibleAdapter = makeAdapter("openai_compatible");
