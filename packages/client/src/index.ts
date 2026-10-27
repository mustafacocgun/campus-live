/**
 * What the web and mobile apps share: talking to the API, merging live readings, and showing them.
 * Works in browsers and React Native (fetch + socket.io-client), so both apps use the same logic.
 */
import {
  type AssistantResponse,
  type Camera,
  type CameraReading,
  type DensityCell,
  type LiveCamera,
  SOCKET_EVENTS,
} from "@campus-live/contracts";
import { io } from "socket.io-client";
import { isStaleSince, LEVEL_COLOR } from "./common.js";
import { request } from "./request.js";

export * from "./common.js";
export * from "./dark-style.js";
export * from "./places.js";

export async function fetchCameras(apiUrl: string): Promise<LiveCamera[]> {
  return request<LiveCamera[]>(`${apiUrl}/api/cameras`);
}

export async function askAssistant(apiUrl: string, message: string): Promise<AssistantResponse> {
  return request<AssistantResponse>(`${apiUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export interface LiveState {
  cameras: LiveCamera[];
  /** The campus heat: every fresh crowd camera's density cells, merged (see mergeCells). */
  cells: DensityCell[];
  connected: boolean;
  error: string | null;
}

/** Before the first load: what an app shows while it connects. */
export const EMPTY_LIVE_STATE: LiveState = { cameras: [], cells: [], connected: false, error: null };

/**
 * The live camera list for an app: the first load over REST, then readings over Socket.IO, and a
 * tick that turns silent cameras grey. Calls `onChange` with each new state; returns a stop function.
 */
export function startLiveFeed(
  apiUrl: string,
  onChange: (state: LiveState) => void,
  tickMs = 5_000,
): () => void {
  let state = EMPTY_LIVE_STATE;
  let stopped = false;
  // When each camera's latest reading reached this device, by this device's clock: never compared
  // with the vision machine's clock, which may be minutes off.
  const receivedAt = new Map<string, number>();
  const update = (patch: Partial<LiveState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    if (patch.cameras) state.cells = mergeCells(state.cameras);
    onChange(state);
  };
  const load = () =>
    fetchCameras(apiUrl)
      .then((cameras) => {
        const now = Date.now();
        for (const camera of cameras)
          if (camera.ageMs !== null) receivedAt.set(camera.id, now - camera.ageMs);
        update({ cameras, error: null });
      })
      .catch(() => update({ error: "API'ye ulaşılamadı." }));

  void load();
  const socket = io(apiUrl, { transports: ["websocket"] });
  socket.on("connect", () => {
    update({ connected: true });
    // Every (re)connect re-syncs the list: if the first load failed because the API was not up yet,
    // readings for unknown cameras would otherwise be dropped and the map would stay empty.
    void load();
  });
  socket.on("disconnect", () => update({ connected: false }));
  socket.on(SOCKET_EVENTS.reading, (reading: CameraReading) => {
    receivedAt.set(reading.cameraId, Date.now());
    update({ cameras: mergeReading(state.cameras, reading) });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    update({
      cameras: state.cameras.map((camera) => ({
        ...camera,
        stale: isStaleSince(receivedAt.get(camera.id) ?? null, now),
      })),
    });
  }, tickMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    socket.close();
  };
}

/** The cameras with `reading` applied to its camera, which becomes fresh; the others are untouched. */
export function mergeReading(cameras: LiveCamera[], reading: CameraReading): LiveCamera[] {
  return cameras.map((camera) =>
    camera.id === reading.cameraId ? { ...camera, reading, stale: false, ageMs: 0 } : camera,
  );
}

// Metres per degree of latitude; a degree of longitude is this times cos(latitude). The vision service
// uses the same flat-earth numbers, so cones and cells line up.
const M_PER_DEG_LAT = 111_320;

/** One key per grid cell: the vision service sends identical centres for the same cell. */
const cellKey = (cell: DensityCell) => `${cell.lat.toFixed(6)},${cell.lng.toFixed(6)}`;

/**
 * The heat of the whole campus: the cells of every fresh camera, with the highest weight where views
 * overlap. Overlapping cameras see the same people, so their weights never add up.
 */
export function mergeCells(cameras: LiveCamera[]): DensityCell[] {
  const merged = new Map<string, DensityCell>();
  for (const camera of cameras) {
    if (camera.stale || !camera.reading?.cells) continue;
    for (const cell of camera.reading.cells) {
      const key = cellKey(cell);
      const seen = merged.get(key);
      if (!seen || cell.weight > seen.weight) merged.set(key, cell);
    }
  }
  return [...merged.values()];
}

/**
 * The part of the map a camera sees, from its pose: a closed ring of [lng, lat] from the camera out
 * to `rangeM`, between heading - fovDeg/2 and heading + fovDeg/2.
 */
export function cameraCone(camera: Camera, steps = 12): [number, number][] {
  const origin: [number, number] = [camera.longitude, camera.latitude];
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((camera.latitude * Math.PI) / 180);
  const arc = Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const bearing = ((camera.heading - camera.fovDeg / 2 + (camera.fovDeg * i) / steps) * Math.PI) / 180;
    return [
      camera.longitude + (camera.rangeM * Math.sin(bearing)) / mPerDegLng,
      camera.latitude + (camera.rangeM * Math.cos(bearing)) / M_PER_DEG_LAT,
    ];
  });
  return [origin, ...arc, origin];
}

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

// GeoJSON for the map layers, shaped for MapLibre on the web and on phones alike.
type Feature<G, P> = { type: "Feature"; geometry: G; properties: P };
type Collection<G, P> = { type: "FeatureCollection"; features: Feature<G, P>[] };
type Point = { type: "Point"; coordinates: [number, number] };
type Polygon = { type: "Polygon"; coordinates: [number, number][][] };

/** A camera's color: its level's, or grey without a fresh reading. */
function stateColor(camera: LiveCamera): string {
  return !camera.stale && camera.reading ? LEVEL_COLOR[camera.reading.level] : LEVEL_COLOR.stale;
}

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

/** One dot per camera, in its level's color; `stale` ones are grey. */
export function camerasGeoJSON(
  cameras: LiveCamera[],
): Collection<Point, { id: string; name: string; color: string; stale: boolean }> {
  return {
    type: "FeatureCollection",
    features: cameras.map((camera) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [camera.longitude, camera.latitude] },
      properties: {
        id: camera.id,
        name: camera.name,
        color: stateColor(camera),
        stale: camera.stale || !camera.reading,
      },
    })),
  };
}

/** Each camera's view cone, colored like its dot: where its numbers come from. */
export function conesGeoJSON(cameras: LiveCamera[]): Collection<Polygon, { id: string; color: string }> {
  return {
    type: "FeatureCollection",
    features: cameras.map((camera) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cameraCone(camera)] },
      properties: { id: camera.id, color: stateColor(camera) },
    })),
  };
}

/** Anything not from a real, permitted camera is labelled "Demo verisi" (CLAUDE.md §0.5). */
export function isDemo(reading: CameraReading): boolean {
  return reading.source !== "camera";
}

/** The number to show: free slots for parking, people or vehicles otherwise. */
export function valueText(reading: CameraReading): string {
  if (reading.kind === "parking" && reading.parking)
    return `${reading.parking.free}/${reading.parking.total} boş`;
  return `${reading.count} ${reading.kind === "crowd" ? "kişi" : "araç"}`;
}

/** A phone cannot reach the development machine as localhost; it needs the machine's LAN address. */
export function apiUrlProblem(url: string, platform: string): string | null {
  if (!url) return "EXPO_PUBLIC_API_URL ayarlı değil: API'nin adresini .env dosyasına yazın.";
  if (platform !== "web" && /\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url)) {
    return "Telefon localhost'a ulaşamaz: EXPO_PUBLIC_API_URL bilgisayarın ağ adresi olmalı (ör. http://192.168.1.20:4000).";
  }
  return null;
}
