import { Router } from "express";
import { ok } from "../../lib/http.js";
import type { PlaceRegistry } from "./place-registry.js";

/** GET /api/places: the campus outline and every place, fetched once by the apps. */
export function placesRouter(places: PlaceRegistry): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(ok(places.map));
  });
  return router;
}
