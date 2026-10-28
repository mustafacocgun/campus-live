import type { AssistantResponse } from "@campus-live/contracts";
import { fallbackAnswer } from "./fallback-answer.js";
import { buildLiveContext, SYSTEM_PROMPT } from "./live-context.js";
import { LlmError, type LlmClient } from "./llm-client.js";
import { findNearby, nearbyChips, nearbyPrompt, nearbyText, type Spot } from "./nearby.js";
import type { PlaceView } from "./places-view.js";

/**
 * The LLM's grounded answer, or the rule-based one when there is no LLM or it fails (CLAUDE.md §4.6).
 * "Nearest" and "where" questions get the places the server measured, from the user's position or a
 * place the question names; the position itself never reaches the LLM.
 */
export async function answerQuestion(
  question: string,
  deps: { llm: LlmClient | null; places: PlaceView[]; now: Date; location?: Spot | null },
): Promise<AssistantResponse> {
  const nearby = findNearby(question, deps.places, deps.location ?? null);
  const places = nearby ? { places: nearbyChips(nearby) } : {};
  if (deps.llm) {
    try {
      const answer = await deps.llm.complete([
        {
          role: "system",
          content:
            `${SYSTEM_PROMPT}\n\nCANLI VERİ (${deps.now.toISOString()}):\n${buildLiveContext(deps.places)}` +
            (nearby ? `\n\n${nearbyPrompt(nearby)}` : ""),
        },
        { role: "user", content: question },
      ]);
      return { answer, via: "llm", ...places };
    } catch (error) {
      console.warn(
        `assistant: LLM unavailable (${error instanceof LlmError ? error.message : "unexpected error"}), using the fallback`,
      );
    }
  }
  return {
    answer: nearby ? nearbyText(nearby) : fallbackAnswer(question, deps.places),
    via: "fallback",
    ...places,
  };
}
