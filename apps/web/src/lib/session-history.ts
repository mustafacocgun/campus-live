import type { CameraKind, CameraReading, LiveCamera } from "@campus-live/contracts";

/** One plotted reading: when this browser received it, and the number the chart shows. */
export interface SessionPoint {
  at: number;
  value: number;
  /** The vision service's timestamp: compared for equality only, never with this device's clock. */
  measuredAt: string;
}

/** Per camera id, the readings received since the page opened. In memory only; nothing is stored. */
export type SessionHistory = Record<string, SessionPoint[]>;

const WINDOW_MS = 10 * 60_000;

/** The number a camera's chart plots: free slots for parking, people or vehicles otherwise. */
export function chartValue(reading: CameraReading): number {
  return reading.parking ? reading.parking.free : reading.count;
}

export const CHART_UNIT: Record<CameraKind, string> = { crowd: "kişi", parking: "boş yer", traffic: "araç" };

/** Adds each camera's newest fresh reading once and drops points older than the window. */
export function appendReadings(history: SessionHistory, cameras: LiveCamera[], now: number): SessionHistory {
  let next = history;
  for (const camera of cameras) {
    const reading = camera.stale ? null : camera.reading;
    const points = history[camera.id] ?? [];
    if (!reading || points.at(-1)?.measuredAt === reading.measuredAt) continue;
    next = {
      ...next,
      [camera.id]: [
        ...points.filter((point) => now - point.at <= WINDOW_MS),
        { at: now, value: chartValue(reading), measuredAt: reading.measuredAt },
      ],
    };
  }
  return next;
}
