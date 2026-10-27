import type { CameraReading, LiveCamera } from "@campus-live/contracts";
import type { CameraRegistry } from "../cameras/camera-registry.js";

type Listener = (reading: CameraReading) => void;

interface Entry {
  reading: CameraReading;
  /** When this API received it, by its own clock: staleness never trusts another machine's clock. */
  receivedAt: number;
}

/** The latest reading per camera, kept in memory. */
export class LiveStore {
  private readonly latest = new Map<string, Entry>();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly registry: CameraRegistry,
    private readonly staleAfterMs: number,
  ) {}

  upsert(reading: CameraReading, receivedAt = Date.now()): void {
    const current = this.latest.get(reading.cameraId);
    // Several vision machines may push; a late, older reading never replaces a newer one. Unless the
    // newer one is itself stale: a vision clock that jumped back must not freeze its camera for good.
    const currentIsFresh = current && receivedAt - current.receivedAt <= this.staleAfterMs;
    if (currentIsFresh && Date.parse(current.reading.measuredAt) > Date.parse(reading.measuredAt)) return;
    this.latest.set(reading.cameraId, { reading, receivedAt });
    for (const listener of this.listeners) listener(reading);
  }

  /** Every registered camera, in registry order, with its latest reading, age and staleness. */
  snapshot(now: Date): LiveCamera[] {
    return this.registry.list().map((camera) => {
      const entry = this.latest.get(camera.id);
      const ageMs = entry ? Math.max(0, now.getTime() - entry.receivedAt) : null;
      return {
        ...camera,
        reading: entry?.reading ?? null,
        stale: ageMs === null || ageMs > this.staleAfterMs,
        ageMs,
      };
    });
  }

  onReading(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
