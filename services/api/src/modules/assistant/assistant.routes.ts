import { AssistantRequest } from "@campus-live/contracts";
import { Router } from "express";
import { ok } from "../../lib/http.js";
import type { LiveStore } from "../live/live-store.js";
import type { PlaceRegistry } from "../places/place-registry.js";
import { answerQuestion } from "./assistant.service.js";
import type { LlmClient } from "./llm-client.js";
import { placeViews } from "./places-view.js";
import { rateLimit } from "./rate-limit.js";

export function assistantRouter(deps: { store: LiveStore; places: PlaceRegistry; llm: LlmClient | null }): Router {
  const router = Router();
  router.post("/chat", rateLimit(10, 60_000), async (req, res) => {
    const { message } = AssistantRequest.parse(req.body);
    const now = new Date();
    const places = placeViews(deps.places.list(), deps.store.live(now));
    res.json(ok(await answerQuestion(message, { llm: deps.llm, places, now })));
  });
  return router;
}
