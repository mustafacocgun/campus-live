import { Router } from "express";
import { ok } from "../../lib/http.js";
import type { LiveStore } from "./live-store.js";

/** GET /api/live: every place's state and the merged heat; no camera in it (CLAUDE.md §0.2). */
export function liveRouter(store: LiveStore): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(ok(store.live(new Date())));
  });
  return router;
}
