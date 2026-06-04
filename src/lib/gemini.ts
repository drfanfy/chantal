export interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export async function* streamGemini(
  messages: GeminiMessage[],
  systemInstruction?: string,
  modelId = "gemini-2.0-flash"
): AsyncGenerator<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY n'est pas défini");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body: Record<string, unknown> = { contents: messages };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          error?: { message?: string };
        };
        if (json.error?.message) throw new Error(json.error.message);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
}
