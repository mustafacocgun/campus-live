import type { PlaceView } from "@campus-live/client";
import type { PlaceGeometry, PlaceKind } from "@campus-live/contracts";

export const KIND_TR: Record<PlaceKind, string> = {
  area: "Açık alan",
  building: "Bina",
  parking: "Otopark",
  road: "Yol",
};

/** How long ago the newest reading behind a place arrived, by the API's clock: "3 sn önce". */
export function ageText(ageMs: number | null): string | null {
  if (ageMs === null) return null;
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)} sn önce`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} dk önce` : `${Math.round(minutes / 60)} sa önce`;
}

/** A geometry's middle, as [lng, lat]: the mean of its points (good enough to compare distances). */
function middle(geometry: PlaceGeometry): [number, number] {
  const points: [number, number][] =
    geometry.type === "Point"
      ? [geometry.coordinates]
      : geometry.type === "LineString"
        ? geometry.coordinates
        : geometry.type === "Polygon"
          ? geometry.coordinates[0]
          : geometry.coordinates.flat();
  const sum = points.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

/** Metres between two [lng, lat] points, flat-earth: fine across a campus. */
function metres(a: [number, number], b: [number, number]): number {
  const north = (a[1] - b[1]) * 111_320;
  const east = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(east, north);
}

/**
 * The nearest parking lot with fresh data and a free slot, as the crow flies, with its distance
 * rounded to 10 m. Null when no lot near the campus has live data.
 */
export function nearestParking(
  place: PlaceView,
  places: PlaceView[],
): { lot: PlaceView; metres: number } | null {
  const from = middle(place.geometry);
  let best: { lot: PlaceView; metres: number } | null = null;
  for (const lot of places) {
    if (lot.kind !== "parking" || lot.id === place.id || lot.stale || !lot.parking?.free) continue;
    const distance = metres(from, middle(lot.geometry));
    if (!best || distance < best.metres) best = { lot, metres: distance };
  }
  return best && { lot: best.lot, metres: Math.round(best.metres / 10) * 10 };
}
