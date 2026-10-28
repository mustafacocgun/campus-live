import type { PlaceView } from "@campus-live/client";
import type { PlaceKind } from "@campus-live/contracts";

/** One plotted value: when this browser received it, and the number the chart shows. */
export interface SessionPoint {
  at: number;
  value: number;
}

/** Per place id, the values received since the page opened. In memory only; nothing is stored. */
export type SessionHistory = Record<string, SessionPoint[]>;

const WINDOW_MS = 10 * 60_000;
// Snapshots come every second; an unchanged value is plotted again only this often.
const REPEAT_MS = 5_000;

/** The number a place's chart plots: free slots for a lot, people or vehicles otherwise. */
export function chartValue(place: PlaceView): number | null {
  if (place.stale) return null;
  return place.kind === "parking" ? (place.parking?.free ?? null) : place.count;
}

export const CHART_UNIT: Record<PlaceKind, string> = {
  area: "kişi",
  building: "kişi",
  parking: "boş yer",
  road: "araç",
};

/** Adds each fresh place's value when it changes (or every few seconds) and drops old points. */
export function appendPlaces(history: SessionHistory, places: PlaceView[], now: number): SessionHistory {
  let next = history;
  for (const place of places) {
    const value = chartValue(place);
    const points = history[place.id] ?? [];
    const last = points.at(-1);
    if (value === null || (last && last.value === value && now - last.at < REPEAT_MS)) continue;
    next = {
      ...next,
      [place.id]: [...points.filter((point) => now - point.at <= WINDOW_MS), { at: now, value }],
    };
  }
  return next;
}
