import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { Router } from "express";
import { HttpError } from "../../lib/http.js";
import type { LiveStore } from "../live/live-store.js";

/**
 * GET /api/preview/:placeId: the stage preview (D33). The place's live camera, with YOLO's boxes,
 * passed through from the vision service as an MJPEG stream an <img> plays. Off unless
 * VISION_PREVIEW_URL is set; the camera's id stays on the server (CLAUDE.md §0.2), and no frame is
 * stored here either.
 */
export function previewRouter({ store, visionUrl }: { store: LiveStore; visionUrl: string | undefined }) {
  const router = Router();
  // Several vision processes may share the cameras: each is asked in turn.
  const visions = (visionUrl ?? "")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  router.get("/:placeId", async (req, res, next) => {
    // helmet's default (same-origin) would hide every answer, a 404 too, from the web app's <img> on
    // the same host's other port.
    res.set("cross-origin-resource-policy", "same-site");
    if (!visions.length) return next(new HttpError(404, "PREVIEW_OFF", "Canlı görüntü kapalı."));
    const camera = store.liveCameraOf(req.params.placeId, new Date());
    if (!camera) return next(new HttpError(404, "NO_PREVIEW", "Bu yer için canlı görüntü yok."));
    // The viewer leaving (another place, a closed tab) ends the stream from vision too.
    const upstream = new AbortController();
    res.on("close", () => upstream.abort());
    let response: Response | undefined;
    let reached = false;
    for (const vision of visions) {
      try {
        const answer = await fetch(`${vision}/preview/${encodeURIComponent(camera)}`, { signal: upstream.signal });
        reached = true;
        if (answer.ok && answer.body) {
          response = answer;
          break;
        }
        await answer.body?.cancel();
      } catch {
        // This vision process is down; another may run the camera.
      }
    }
    if (!response) {
      return reached
        ? next(new HttpError(404, "NO_PREVIEW", "Bu yer için canlı görüntü yok."))
        : next(new HttpError(503, "VISION_DOWN", "Görüntü servisine ulaşılamadı."));
    }
    res.status(200).set({
      "content-type": response.headers.get("content-type") ?? "multipart/x-mixed-replace; boundary=frame",
      "cache-control": "no-store",
    });
    const frames = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
    frames.on("error", () => res.end());
    frames.pipe(res);
  });
  return router;
}
