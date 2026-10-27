import type {
  CameraReading,
  DensityCell,
  Level,
  LiveCamera,
  LivePlace,
  LiveSnapshot,
  Place,
} from "@campus-live/contracts";
import type { CameraRegistry } from "../cameras/camera-registry.js";
import type { PlaceRegistry } from "../places/place-registry.js";

const LEVEL_ORDER: Level[] = ["low", "medium", "high"];
const busier = (a: Level, b: Level) => (LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b);
/** One key per grid cell: vision sends identical centres for the same cell. */
const cellKey = (cell: DensityCell) => `${cell.lat.toFixed(6)},${cell.lng.toFixed(6)}`;

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
    private readonly places: PlaceRegistry,
    private readonly staleAfterMs: number,
  ) {
    for (const camera of registry.list()) {
      if (!camera.place || !places.get(camera.place)) {
        throw new Error(`camera ${camera.id} feeds no known place (${camera.place ?? "none"})`);
      }
      // Place ids are public and camera ids private: one string is never both (CLAUDE.md §0.2).
      if (places.get(camera.id)) throw new Error(`place ${camera.id} has a camera's id`);
    }
  }

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

  /**
   * Every place's state and the merged heat: what the apps see. Areas take their busiest camera (views
   * may overlap), buildings and parking lots add theirs up (rooms and slots differ), roads take the
   * busiest. Nothing in it names or locates a camera (CLAUDE.md §0.2).
   */
  live(now: Date): LiveSnapshot {
    const fresh = new Map<string, Entry[]>();
    const newest = new Map<string, number>();
    const heat = new Map<string, DensityCell>();
    for (const camera of this.registry.list()) {
      const entry = this.latest.get(camera.id);
      const place = camera.place as string;
      if (!entry) continue;
      newest.set(place, Math.max(newest.get(place) ?? 0, entry.receivedAt));
      if (now.getTime() - entry.receivedAt > this.staleAfterMs) continue;
      fresh.set(place, [...(fresh.get(place) ?? []), entry]);
      if (camera.indoor) continue;
      for (const cell of entry.reading.cells ?? []) {
        const seen = heat.get(cellKey(cell));
        if (!seen || cell.weight > seen.weight) heat.set(cellKey(cell), cell);
      }
    }
    return {
      places: this.places
        .list()
        .map((place) => placeState(place, fresh.get(place.id) ?? [], newest.get(place.id), now)),
      cells: [...heat.values()],
      at: now.toISOString(),
    };
  }

  onReading(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function placeState(place: Place, entries: Entry[], newest: number | undefined, now: Date): LivePlace {
  const ageMs = newest === undefined ? null : Math.max(0, now.getTime() - newest);
  if (!entries.length) {
    return { id: place.id, count: null, level: null, parking: null, stale: true, ageMs, demo: true };
  }
  const readings = entries.map((entry) => entry.reading);
  const counts = readings.map((reading) => reading.count);
  const adds = place.kind === "building" || place.kind === "parking";
  const lots = readings.flatMap((reading) => (reading.parking ? [reading.parking] : []));
  return {
    id: place.id,
    count: adds ? counts.reduce((a, b) => a + b, 0) : Math.max(...counts),
    level: readings.map((reading) => reading.level).reduce(busier),
    parking: lots.length
      ? { total: lots.reduce((a, b) => a + b.total, 0), free: lots.reduce((a, b) => a + b.free, 0) }
      : null,
    stale: false,
    ageMs,
    demo: readings.some((reading) => reading.source !== "camera"),
  };
}
