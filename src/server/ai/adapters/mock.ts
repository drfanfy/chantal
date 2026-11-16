/**
 * Fournisseur fictif — TESTS ET DÉMONSTRATION UNIQUEMENT.
 * Disponible seulement si AI_ENABLE_MOCK_PROVIDER=true et APP_ENV ≠ production.
 * Les réponses sont explicitement marquées comme simulées.
 */
import { ProviderError, type CompletionRequest, type ProviderAdapter, type StreamEvent } from "../types";

export const mockAdapter: ProviderAdapter = {
  id: "mock",
  label: "Fictif (tests / démo)",
  description: "Réponses simulées, sans appel réseau. Jamais disponible en production.",
  supported: { text: true, streaming: true, vision: true, files: true, structured_output: true, tools: false },
  supportsTemperature: true,
  requiresBaseUrl: false,
  officialHosts: [],

  async *stream(_conn, req: CompletionRequest): AsyncGenerator<StreamEvent> {
    const last = req.messages.at(-1);
    const lastText = typeof last?.content === "string" ? last.content : (last?.content.find((p) => p.type === "text") as { text?: string } | undefined)?.text ?? "";
    if (lastText.includes("[mock:error]")) throw new ProviderError("unavailable", 503, "Erreur simulée");
    const answer =
      req.responseFormat === "json"
        ? JSON.stringify({ simulation: true, resume: lastText.slice(0, 80) })
        : `[Réponse simulée — fournisseur fictif] ${lastText.slice(0, 200)}`;
    for (const word of answer.split(/(?<= )/)) {
      if (req.signal.aborted) throw new ProviderError("cancelled");
      yield { type: "text", text: word };
    }
    yield { type: "finish", reason: "stop" };
    yield { type: "usage", inputTokens: Math.ceil(lastText.length / 4), outputTokens: Math.ceil(answer.length / 4), cachedInputTokens: 0 };
  },
};
