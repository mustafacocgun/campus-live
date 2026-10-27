/**
 * The campus by places: the map's places joined with their live state, the live feed that keeps them
 * current, and the map layers drawn from them. No camera appears anywhere here (CLAUDE.md §0.2).
 */
import {
  type CameraKind,
  type CampusMap,
  type DensityCell,
  type LivePlace,
  type LiveSnapshot,
  type Place,
  type PlaceKind,
  SOCKET_EVENTS,
} from "@campus-live/contracts";
import { io } from "socket.io-client";
import { isStaleSince, LEVEL_COLOR, STALE_AFTER_MS } from "./common.js";
import { request } from "./request.js";

/** A place with its live state: what the apps list, color and label. */
export type PlaceView = Place & Omit<LivePlace, "id">;

/** What a place's numbers are about: people (areas, buildings), free slots or vehicles. */
export const PLACE_TOPIC: Record<PlaceKind, CameraKind> = {
  area: "crowd",
  building: "crowd",
  parking: "parking",
  road: "traffic",
};

export function fetchPlaces(apiUrl: string): Promise<CampusMap> {
  return request<CampusMap>(`${apiUrl}/api/places`);
}

export function fetchLive(apiUrl: string): Promise<LiveSnapshot> {
  return request<LiveSnapshot>(`${apiUrl}/api/live`);
}

const NO_STATE: Omit<LivePlace, "id"> = {
  count: null,
  level: null,
  parking: null,
  stale: true,
  ageMs: null,
  demo: true,
};

/** Each place with its state from the snapshot; a place the snapshot lacks, or no snapshot, is stale. */
export function joinPlaces(places: Place[], snapshot: LiveSnapshot | null): PlaceView[] {
  const states = new Map(snapshot?.places.map((state) => [state.id, state]));
  return places.map((place) => {
    const state = states.get(place.id);
    return state ? { ...place, ...state, id: place.id } : { ...place, ...NO_STATE };
  });
}

/** A place's color: its level's, or grey without fresh data. */
export function placeColor(place: PlaceView): string {
  return place.stale || !place.level ? LEVEL_COLOR.stale : LEVEL_COLOR[place.level];
}

/** The number to show: free slots for a lot, vehicles for a road, people otherwise. */
export function placeValueText(place: PlaceView): string {
  if (place.stale || place.count === null) return "Görüntü yok";
  if (place.kind === "parking" && place.parking) return `${place.parking.free}/${place.parking.total} boş`;
  return `${place.count} ${place.kind === "road" ? "araç" : "kişi"}`;
}

export interface PlacesState {
  /** The campus outline, once the map has loaded. */
  campus: CampusMap["campus"] | null;
  places: PlaceView[];
  /** The outdoor heat, merged by the API. */
  cells: DensityCell[];
  connected: boolean;
  error: string | null;
}

/** Before the first load: what an app shows while it connects. */
export const EMPTY_PLACES_STATE: PlacesState = {
  campus: null,
  places: [],
  cells: [],
  connected: false,
  error: null,
};

/**
 * The live campus for an app: the map and the first snapshot over REST, then a snapshot every second
 * over Socket.IO. When snapshots stop arriving (by this device's clock), every place turns grey and the
 * heat goes. Calls `onChange` with each new state; returns a stop function.
 */
export function startPlacesFeed(
  apiUrl: string,
  onChange: (state: PlacesState) => void,
  tickMs = 5_000,
  staleAfterMs = STALE_AFTER_MS,
): () => void {
  let state = EMPTY_PLACES_STATE;
  let stopped = false;
  let map: CampusMap | null = null;
  let snapshot: LiveSnapshot | null = null;
  let receivedAt: number | null = null;
  let loading = false;

  const update = (patch: Partial<PlacesState> = {}) => {
    if (stopped) return;
    const shown = isStaleSince(receivedAt, Date.now(), staleAfterMs) ? null : snapshot;
    state = {
      ...state,
      ...patch,
      campus: map?.campus ?? null,
      places: map ? joinPlaces(map.places, shown) : [],
      cells: shown?.cells ?? [],
    };
    onChange(state);
  };
  const apply = (next: LiveSnapshot, patch: Partial<PlacesState> = {}) => {
    // Both come from the API's clock: a late REST answer never replaces a newer pushed snapshot.
    if (!snapshot || Date.parse(next.at) >= Date.parse(snapshot.at)) {
      snapshot = next;
      receivedAt = Date.now();
    }
    update(patch);
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      map ??= await fetchPlaces(apiUrl);
      apply(await fetchLive(apiUrl), { error: null });
    } catch {
      update({ error: "API'ye ulaşılamadı." });
    } finally {
      loading = false;
    }
  };

  void load();
  const socket = io(apiUrl, { transports: ["websocket"] });
  socket.on("connect", () => {
    update({ connected: true });
    // Every (re)connect re-syncs: if the first load failed because the API was not up yet, the map
    // would otherwise stay empty.
    void load();
  });
  socket.on("disconnect", () => update({ connected: false }));
  socket.on(SOCKET_EVENTS.live, (next: LiveSnapshot) => {
    apply(next);
    if (!map) void load();
  });
  const timer = setInterval(() => update(), tickMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    socket.close();
  };
}

// GeoJSON for the map layers, shaped for MapLibre on the web and on phones alike.
type LngLat = [number, number];
type Feature<G, P> = { type: "Feature"; geometry: G; properties: P };
type Collection<G, P> = { type: "FeatureCollection"; features: Feature<G, P>[] };
type Point = { type: "Point"; coordinates: LngLat };
type Polygon = { type: "Polygon"; coordinates: LngLat[][] };
type Lines =
  { type: "LineString"; coordinates: LngLat[] } | { type: "MultiLineString"; coordinates: LngLat[][] };

interface Look {
  id: string;
  name: string;
  color: string;
  stale: boolean;
}

const look = (place: PlaceView): Look => ({
  id: place.id,
  name: place.name,
  color: placeColor(place),
  stale: place.stale,
});

// Metres per degree of latitude; a degree of longitude is this times cos(latitude).
const M_PER_DEG_LAT = 111_320;
// A building with no height from the basemap stands this tall.
const DEFAULT_HEIGHT_M = 10;
// How far a lit building's walls stand outside its footprint, so they never flicker against the
// basemap's own walls in 3D.
const WALL_GAP_M = 0.6;

const ringMiddle = (ring: LngLat[]): LngLat => {
  const corners = ring.slice(0, -1);
  return [
    corners.reduce((sum, [lng]) => sum + lng, 0) / corners.length,
    corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length,
  ];
};

/** The ring with every corner moved `metres` further from its middle. */
function outward(ring: LngLat[], metres: number): LngLat[] {
  const [mx, my] = ringMiddle(ring);
  const kx = M_PER_DEG_LAT * Math.cos((my * Math.PI) / 180);
  return ring.map(([lng, lat]) => {
    const east = (lng - mx) * kx;
    const north = (lat - my) * M_PER_DEG_LAT;
    const scale = 1 + metres / Math.max(Math.hypot(east, north), 1);
    return [mx + (east * scale) / kx, my + (north * scale) / M_PER_DEG_LAT];
  });
}

const polygons = (places: PlaceView[], kind: PlaceKind) =>
  places.flatMap((place) =>
    place.kind === kind && place.geometry.type === "Polygon"
      ? [{ place, rings: place.geometry.coordinates }]
      : [],
  );

/**
 * Buildings lit by their crowd. `heights` (metres, by place id) lets a 3D map wrap the basemap's own
 * building; the footprint is moved a little outwards for the same reason.
 */
export function buildingsGeoJSON(
  places: PlaceView[],
  heights?: ReadonlyMap<string, number>,
): Collection<Polygon, Look & { height: number }> {
  return {
    type: "FeatureCollection",
    features: polygons(places, "building").map(({ place, rings }) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: rings.map((ring) => outward(ring, WALL_GAP_M)) },
      properties: { ...look(place), height: heights?.get(place.id) ?? DEFAULT_HEIGHT_M },
    })),
  };
}

/** Parking lots in their level's color. */
export function lotsGeoJSON(places: PlaceView[]): Collection<Polygon, Look> {
  return {
    type: "FeatureCollection",
    features: polygons(places, "parking").map(({ place, rings }) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: rings },
      properties: look(place),
    })),
  };
}

/** Roads in their traffic level's color. */
export function roadsGeoJSON(places: PlaceView[]): Collection<Lines, Look> {
  return {
    type: "FeatureCollection",
    features: places.flatMap((place) =>
      place.kind === "road" &&
      (place.geometry.type === "LineString" || place.geometry.type === "MultiLineString")
        ? [{ type: "Feature" as const, geometry: place.geometry, properties: look(place) }]
        : [],
    ),
  };
}

const length = (line: LngLat[]) =>
  line.slice(1).reduce((sum, [lng, lat], i) => sum + Math.hypot(lng - line[i][0], lat - line[i][1]), 0);

/** Where a place's name goes: its point, the middle of its footprint, or along its longest road part. */
function labelPoint(place: Place): LngLat {
  const geometry = place.geometry;
  if (geometry.type === "Point") return geometry.coordinates;
  if (geometry.type === "Polygon") return ringMiddle(geometry.coordinates[0]);
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const longest = parts.reduce((best, part) => (length(part) > length(best) ? part : best));
  return longest[Math.floor((longest.length - 1) / 2)];
}

/** One label per place: its name and its value ("12/40 boş"). */
export function labelsGeoJSON(
  places: PlaceView[],
): Collection<Point, Look & { kind: PlaceKind; value: string }> {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: labelPoint(place) },
      properties: { ...look(place), kind: place.kind, value: placeValueText(place) },
    })),
  };
}

/** The world with the campus cut out: a soft veil over everything that is not ours. */
export function campusMaskGeoJSON(campus: CampusMap["campus"]): Feature<Polygon, Record<string, never>> {
  const world: LngLat[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const outline = campus.geometry.type === "Polygon" ? campus.geometry.coordinates[0] : [];
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [world, outline] }, properties: {} };
}
