import { ReadingBatch } from "@campus-live/contracts";
import express, { Router } from "express";
import { HttpError, ok } from "../../lib/http.js";
import { requireServiceToken } from "../../middleware/require-service-token.js";
import type { CameraRegistry } from "../cameras/camera-registry.js";
import type { LiveStore } from "./live-store.js";

// Any batch the contract allows: 100 readings of up to 2000 density cells, about 50 bytes each.
const BODY_LIMIT = "12mb";

/** POST /internal/readings: the vision service pushes readings here. */
export function ingestRouter(deps: { registry: CameraRegistry; store: LiveStore; token: string }): Router {
  const router = Router();
  // The token is checked before the body is read, so only the vision service can send large ones.
  router.post("/", requireServiceToken(deps.token), express.json({ limit: BODY_LIMIT }), (req, res) => {
    const { readings } = ReadingBatch.parse(req.body);
    const rejected: string[] = [];
    for (const reading of readings) {
      const camera = deps.registry.get(reading.cameraId);
      // Indoor cameras send counts only: a position inside a building never enters the API (D21).
      if (!camera || camera.kind !== reading.kind || (camera.indoor && reading.cells)) {
        rejected.push(reading.cameraId);
        continue;
      }
      deps.store.upsert(reading);
    }
    const accepted = readings.length - rejected.length;
    if (accepted === 0) {
      throw new HttpError(422, "UNKNOWN_CAMERA", `Unknown camera or kind mismatch: ${rejected.join(", ")}`);
    }
    // One misconfigured camera must not block the others from the same vision machine.
    res.status(202).json(ok({ accepted, rejected }));
  });
  return router;
}
