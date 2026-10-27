import { Router } from "express";
import { ok } from "../../lib/http.js";
import type { LiveStore } from "../live/live-store.js";

export function camerasRouter(store: LiveStore): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(ok(store.snapshot(new Date())));
  });
  return router;
}
