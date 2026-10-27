import type { AssistantResponse, LiveCamera } from "@campus-live/contracts";
import { fallbackAnswer } from "./fallback-answer.js";
import { buildLiveContext, SYSTEM_PROMPT } from "./live-context.js";
import { LlmError, type LlmClient } from "./llm-client.js";

/** The LLM's grounded answer, or the rule-based one when there is no LLM or it fails (CLAUDE.md §4.6). */
export async function answerQuestion(
  question: string,
  deps: { llm: LlmClient | null; cameras: LiveCamera[]; now: Date },
): Promise<AssistantResponse> {
  if (deps.llm) {
    try {
      const answer = await deps.llm.complete([
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nCANLI VERİ (${deps.now.toISOString()}):\n${buildLiveContext(deps.cameras, deps.now)}`,
        },
        { role: "user", content: question },
      ]);
      return { answer, via: "llm" };
    } catch (error) {
      console.warn(
        `assistant: LLM unavailable (${error instanceof LlmError ? error.message : "unexpected error"}), using the fallback`,
      );
    }
  }
  return { answer: fallbackAnswer(question, deps.cameras, deps.now), via: "fallback" };
}
