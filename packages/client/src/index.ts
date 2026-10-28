/**
 * What the web and mobile apps share: talking to the API, the live campus by places, the heat's glide
 * and the map layers. Works in browsers and React Native (fetch + socket.io-client), so both apps use
 * the same logic. Nothing here knows a camera (CLAUDE.md §0.2).
 */
import type { AssistantResponse, DensityCell } from "@campus-live/contracts";
import { request } from "./request.js";

export * from "./common.js";
export * from "./dark-style.js";
export * from "./places.js";

export async function askAssistant(apiUrl: string, message: string): Promise<AssistantResponse> {
  return request<AssistantResponse>(`${apiUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

/** One key per grid cell: the vision service sends identical centres for the same cell. */
const cellKey = (cell: DensityCell) => `${cell.lat.toFixed(6)},${cell.lng.toFixed(6)}`;

// Below this weight a cell draws nothing. Glides restart with every reading, often before they end,
// so faded cells are dropped here rather than only at the end of a glide.
const INVISIBLE_WEIGHT = 0.01;

/**
 * The heat `t` of the way (0 to 1) from one update to the next, so the cloud glides instead of
 * jumping: cells that appear fade in from 0, cells that vanish fade out and are dropped.
 */
export function lerpCells(from: DensityCell[], to: DensityCell[], t: number): DensityCell[] {
  const pairs = new Map<string, { cell: DensityCell; from: number; to: number }>();
  for (const cell of from) pairs.set(cellKey(cell), { cell, from: cell.weight, to: 0 });
  for (const cell of to) {
    const key = cellKey(cell);
    pairs.set(key, { cell, from: pairs.get(key)?.from ?? 0, to: cell.weight });
  }
  const cells: DensityCell[] = [];
  for (const { cell, from: a, to: b } of pairs.values()) {
    const weight = a + (b - a) * t;
    if (weight >= INVISIBLE_WEIGHT) cells.push({ lat: cell.lat, lng: cell.lng, weight });
  }
  return cells;
}

// GeoJSON for the heat layer, shaped for MapLibre on the web and on phones alike.
type Feature<G, P> = { type: "Feature"; geometry: G; properties: P };
type Collection<G, P> = { type: "FeatureCollection"; features: Feature<G, P>[] };
type Point = { type: "Point"; coordinates: [number, number] };

/** The heat layer's points: one per cell, weighted by its people. */
export function heatGeoJSON(cells: DensityCell[]): Collection<Point, { weight: number }> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cell.lng, cell.lat] },
      properties: { weight: cell.weight },
    })),
  };
}

/** A phone cannot reach the development machine as localhost; it needs the machine's LAN address. */
export function apiUrlProblem(url: string, platform: string): string | null {
  if (!url) return "EXPO_PUBLIC_API_URL ayarlı değil: API'nin adresini .env dosyasına yazın.";
  if (platform !== "web" && /\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url)) {
    return "Telefon localhost'a ulaşamaz: EXPO_PUBLIC_API_URL bilgisayarın ağ adresi olmalı (ör. http://192.168.1.20:4000).";
  }
  return null;
}
