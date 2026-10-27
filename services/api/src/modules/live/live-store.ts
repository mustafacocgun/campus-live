import type { CameraReading, LiveCamera } from "@campus-live/contracts";
import type { CameraRegistry } from "../cameras/camera-registry.js";

type Listener = (reading: CameraReading) => void;

/** The latest reading per camera, kept in memory. */
export class LiveStore {
  private readonly latest = new Map<string, CameraReading>();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly registry: CameraRegistry,
    private readonly staleAfterMs: number,
  ) {}

  upsert(reading: CameraReading): void {
    const current = this.latest.get(reading.cameraId);
    // Several vision machines may push; a late, older reading never replaces a newer one.
    if (current && Date.parse(current.measuredAt) > Date.parse(reading.measuredAt)) return;
    this.latest.set(reading.cameraId, reading);
    for (const listener of this.listeners) listener(reading);
  }

  /** Every registered camera, in registry order, with its latest reading and whether it is stale. */
  snapshot(now: Date): LiveCamera[] {
    return this.registry.list().map((camera) => {
      const reading = this.latest.get(camera.id) ?? null;
      const stale = !reading || now.getTime() - Date.parse(reading.measuredAt) > this.staleAfterMs;
      return { ...camera, reading, stale };
    });
  }

  onReading(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
