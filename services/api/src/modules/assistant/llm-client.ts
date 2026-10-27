/**
 * The one module that talks to the LLM provider (CLAUDE.md §4.5): any OpenAI-compatible
 * `/chat/completions` endpoint. Base URL, key and model come from env; switching provider happens here.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
}

/** Messages never include the provider's response body: some echo the request, key included. */
export class LlmError extends Error {}

export function createLlmClient(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}): LlmClient {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    async complete(messages) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify({ model: options.model, messages, temperature: 0.2, max_tokens: 300 }),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch (error) {
        throw new LlmError(
          error instanceof Error && error.name === "TimeoutError" ? "timed out" : "network error",
        );
      }
      if (!response.ok) throw new LlmError(`HTTP ${response.status}`);
      const body = (await response.json().catch(() => null)) as {
        choices?: { message?: { content?: unknown } }[];
      } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new LlmError("malformed response");
      return content.trim();
    },
  };
}
