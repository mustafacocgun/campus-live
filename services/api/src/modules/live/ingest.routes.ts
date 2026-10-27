import { ReadingBatch } from "@campus-live/contracts";
import { Router } from "express";
import { HttpError, ok } from "../../lib/http.js";
import { requireServiceToken } from "../../middleware/require-service-token.js";
import type { CameraRegistry } from "../cameras/camera-registry.js";
import type { LiveStore } from "./live-store.js";

/** POST /internal/readings: the vision service pushes readings here. */
export function ingestRouter(deps: { registry: CameraRegistry; store: LiveStore; token: string }): Router {
  const router = Router();
  router.post("/", requireServiceToken(deps.token), (req, res) => {
    const { readings } = ReadingBatch.parse(req.body);
    const rejected: string[] = [];
    for (const reading of readings) {
      const camera = deps.registry.get(reading.cameraId);
      if (!camera || camera.kind !== reading.kind) {
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
