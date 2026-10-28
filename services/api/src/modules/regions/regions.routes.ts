import { Router } from "express";
import { ok } from "../../lib/http.js";
import { type RegionSource, regionsNow } from "./regions.js";

/**
 * GET /api/regions: every place an alert can watch, with its live percent. Public: places and
 * percents only, never a camera or a capacity (CLAUDE.md §0.2).
 */
export function regionsRouter(source: RegionSource): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(ok(regionsNow(source, new Date())));
  });
  return router;
}
