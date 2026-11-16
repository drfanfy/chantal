import { describe, it, expect, vi, afterEach } from "vitest";
import { openaiAdapter, openaiCompatibleAdapter } from "@/server/ai/adapters/openai";
import { googleAdapter } from "@/server/ai/adapters/google";
import { effectiveCapabilities } from "@/server/ai/registry";
import { ProviderError, sanitizeDetail, type StreamEvent } from "@/server/ai/types";
import { connectionStatus } from "@/server/ai/gateway";

function sseResponse(events: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      // découpage irrégulier : vérifie la reconstitution des lignes SSE
      const raw = events.map((e) => `data: ${e}\n\n`).join("");
      for (let i = 0; i < raw.length; i += 7) c.enqueue(new TextEncoder().encode(raw.slice(i, i + 7)));
      c.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const req = () => ({ model: "m", messages: [{ role: "user" as const, content: "Bonjour" }], maxOutputTokens: 100, signal: new AbortController().signal });
const texts = (ev: StreamEvent[]) => ev.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");

afterEach(() => vi.unstubAllGlobals());

describe("adaptateur OpenAI", () => {
  it("assemble texte et usage (cache inclus), envoie max_completion_tokens sans temperature", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      sseResponse([
        '{"choices":[{"delta":{"content":"Bon"}}]}',
        '{"choices":[{"delta":{"content":"jour"},"finish_reason":"stop"}]}',
        '{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":4}}}',
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ev = await collect(openaiAdapter.stream({ adapter: "openai", apiKey: "sk-test-123456" }, { ...req(), temperature: 0.5 }));
    expect(texts(ev)).toBe("Bonjour");
    expect(ev.find((e) => e.type === "usage")).toEqual({ type: "usage", inputTokens: 12, outputTokens: 3, cachedInputTokens: 4 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.max_completion_tokens).toBe(100);
    expect(body.temperature).toBeUndefined();
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("compatible OpenAI : URL de base configurée, max_tokens et temperature", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => sseResponse(['{"choices":[{"delta":{"content":"x"}}]}', "[DONE]"]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(openaiCompatibleAdapter.stream({ adapter: "openai_compatible", baseUrl: "https://api.groq.com/openai/v1/", apiKey: "k" }, { ...req(), temperature: 0.2 }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.2);
  });

  it("traduit les erreurs HTTP en erreurs typées, sans fuite de clé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"bad key sk-test-123456"}', { status: 401 })));
    const err = await collect(openaiAdapter.stream({ adapter: "openai", apiKey: "sk-test-123456" }, req())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("auth");
    expect((err as ProviderError).detail).not.toContain("sk-test-123456");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    const err2 = await collect(openaiAdapter.stream({ adapter: "openai" }, req())).catch((e: unknown) => e);
    expect((err2 as ProviderError).code).toBe("rate_limit");
  });
});

describe("adaptateur Gemini", () => {
  it("ignore les parties de réflexion, compte les tokens de réflexion en sortie, clé en en-tête", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      sseResponse([
        '{"candidates":[{"content":{"parts":[{"text":"...","thought":true},{"text":"Salut"}]}}]}',
        '{"candidates":[{"content":{"parts":[{"text":" !"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"thoughtsTokenCount":7}}',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ev = await collect(googleAdapter.stream({ adapter: "google", apiKey: "AIzaSECRETSECRET" }, { ...req(), system: "sys" }));
    expect(texts(ev)).toBe("Salut !");
    expect(ev.find((e) => e.type === "usage")).toMatchObject({ inputTokens: 5, outputTokens: 9 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("AIza");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaSECRETSECRET");
    expect(JSON.parse(String(init.body)).systemInstruction).toEqual({ parts: [{ text: "sys" }] });
  });

  it("signale un refus de sécurité", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['{"promptFeedback":{"blockReason":"SAFETY"}}'])));
    const err = await collect(googleAdapter.stream({ adapter: "google", apiKey: "k" }, req())).catch((e: unknown) => e);
    expect((err as ProviderError).code).toBe("refusal");
  });
});

describe("capacités et configuration", () => {
  it("une case cochée ne suffit pas : capacité effective = déclarée ∧ supportée", () => {
    expect(effectiveCapabilities("google", { vision: true, files: true, tools: true })).toMatchObject({ text: true, vision: false, files: false, tools: false });
    expect(effectiveCapabilities("anthropic", { vision: true, files: true })).toMatchObject({ vision: true, files: true });
    expect(effectiveCapabilities("anthropic", {})).toMatchObject({ vision: false });
    expect(effectiveCapabilities("inconnu", { text: true })).toMatchObject({ text: false });
  });

  it("affiche « non configuré » avec la raison, refuse les secrets hors liste et les hôtes non autorisés", () => {
    const conn = { id: "c", name: "OpenAI", adapter: "openai", base_url: null, api_version: null, region: null, deployment: null, secret_ref: "OPENAI_API_KEY", is_enabled: true, archived_at: null };
    delete process.env.OPENAI_API_KEY;
    expect(connectionStatus(conn)).toEqual({ configured: false, reason: "Variable d'environnement serveur « OPENAI_API_KEY » absente" });
    process.env.OPENAI_API_KEY = "sk-x";
    expect(connectionStatus(conn).configured).toBe(true);
    expect(connectionStatus({ ...conn, secret_ref: "SUPABASE_SERVICE_ROLE_KEY" }).configured).toBe(false);
    expect(connectionStatus({ ...conn, adapter: "openai_compatible", base_url: "https://evil.example.com" }).reason).toMatch(/AI_ALLOWED_HOSTS/);
    expect(connectionStatus({ ...conn, adapter: "mock" }).configured).toBe(false);
    delete process.env.OPENAI_API_KEY;
  });

  it("masque les secrets dans les détails d'erreur", () => {
    expect(sanitizeDetail("key=sk-proj-abcdef123 token Bearer abc.def.ghi123")).not.toMatch(/sk-proj|abc\.def/);
  });
});
