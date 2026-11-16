/**
 * Adaptateur Google Gemini (Generative Language API, generateContent en SSE).
 *
 * Statut au 16/11/2026 : generateContent est qualifié de « legacy » par Google
 * mais reste supporté. Le suffixe `?alt=sse`, `systemInstruction` et
 * `inline_data` n'ont pas pu être reconfirmés sur les pages actuelles : seules
 * les capacités texte + streaming sont déclarées ; le bouton « Tester » du
 * back-office valide l'intégration réelle (cf. docs/annexes).
 */
import { readSseData } from "../sse";
import {
  ProviderError,
  errorCodeFromStatus,
  sanitizeDetail,
  type CompletionRequest,
  type ProviderAdapter,
  type ResolvedConnection,
  type StreamEvent,
} from "../types";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const googleAdapter: ProviderAdapter = {
  id: "google",
  label: "Google Gemini",
  description: "Gemini API (generateContent, streaming). Texte uniquement en V1.",
  supported: { text: true, streaming: true, vision: false, files: false, structured_output: false, tools: false },
  supportsTemperature: true,
  requiresBaseUrl: false,
  officialHosts: ["generativelanguage.googleapis.com"],
  defaultBaseUrl: DEFAULT_BASE,

  async *stream(conn: ResolvedConnection, req: CompletionRequest): AsyncGenerator<StreamEvent> {
    const base = (conn.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    const contents = req.messages.map((m) => {
      if (typeof m.content !== "string" && m.content.some((p) => p.type !== "text")) {
        throw new ProviderError("bad_request", undefined, "Pièces jointes non prises en charge par l'adaptateur Gemini V1");
      }
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
      return { role: m.role === "assistant" ? "model" : "user", parts: [{ text }] };
    });
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

    let res: Response;
    try {
      res = await fetch(`${base}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": conn.apiKey ?? "" },
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
      throw new ProviderError(errorCodeFromStatus(res.status), res.status, sanitizeDetail(text, [conn.apiKey]));
    }

    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number } | undefined;
    for await (const data of readSseData(res.body, req.signal)) {
      let json: {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        usageMetadata?: typeof usage;
        promptFeedback?: { blockReason?: string };
        error?: { message?: string; code?: number };
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new ProviderError(errorCodeFromStatus(json.error.code ?? 500), json.error.code, sanitizeDetail(json.error.message ?? "", [conn.apiKey]));
      if (json.promptFeedback?.blockReason) throw new ProviderError("refusal");
      const cand = json.candidates?.[0];
      for (const part of cand?.content?.parts ?? []) {
        if (part.text && !part.thought) yield { type: "text", text: part.text };
      }
      if (cand?.finishReason) {
        if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new ProviderError("refusal");
        yield { type: "finish", reason: cand.finishReason };
      }
      if (json.usageMetadata) usage = json.usageMetadata;
    }
    if (req.signal.aborted) throw new ProviderError("cancelled");
    if (usage) {
      yield {
        type: "usage",
        inputTokens: usage.promptTokenCount,
        // Les tokens de réflexion sont facturés comme des tokens de sortie
        outputTokens: usage.candidatesTokenCount !== undefined ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0) : undefined,
        cachedInputTokens: usage.cachedContentTokenCount,
      };
    }
  },
};
