import type { ApiResponse, Camera, CameraReading, CampusMap } from "@campus-live/contracts";
import { LiveSnapshot, SOCKET_EVENTS } from "@campus-live/contracts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CameraRegistry, loadRegistry, SHARED_CAMERAS_FILE } from "../src/modules/cameras/camera-registry.js";
import { attachLiveSocket } from "../src/modules/live/live-socket.js";
import { LiveStore } from "../src/modules/live/live-store.js";
import { loadPlaces, SHARED_PLACES_FILE } from "../src/modules/places/place-registry.js";
import { env, ingest, reading, startServer } from "./helpers.js";

const T0 = Date.parse("2026-10-28T09:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms);
const HEAT = [{ lat: 40.74205, lng: 30.33195, weight: 1.5 }];

/** The first value `found` returns within `ms`. */
async function until<T>(found: () => T | undefined, ms = 3_000): Promise<T> {
  for (const deadline = Date.now() + ms; Date.now() < deadline;) {
    const value = found();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`nothing within ${ms} ms`);
}

const crowd = (cameraId: string, count: number, overrides: Partial<CameraReading> = {}): CameraReading =>
  reading({ cameraId, kind: "crowd", count, level: "low", parking: undefined, ...overrides });
const lot = (cameraId: string, total: number, free: number): CameraReading =>
  reading({ cameraId, count: total - free, parking: { total, free } });

/** The fixture cameras plus a second camera on an area, a building and a parking lot. */
function store() {
  const fixture = loadRegistry(env.CAMERAS_FILE).list();
  const twin = (id: string, of: string) => ({ ...fixture.find((camera) => camera.id === of)!, id });
  const registry = new CameraRegistry([
    ...fixture,
    twin("kutuphane-giris-2", "kutuphane-giris"),
    twin("kutuphane-ic-2", "kutuphane-ic"),
    twin("otopark-a-2", "otopark-a"),
  ]);
  return new LiveStore(registry, loadPlaces(env.PLACES_FILE), 15_000);
}
const placeOf = (s: LiveStore, id: string, now = at(1_000)) => s.live(now).places.find((p) => p.id === id)!;

describe("LiveStore.live", () => {
  it("an area takes its busiest camera; a building adds its rooms up", () => {
    const s = store();
    s.upsert(crowd("kutuphane-giris", 9, { level: "medium" }), T0);
    s.upsert(crowd("kutuphane-giris-2", 14, { level: "high" }), T0);
    s.upsert(crowd("kutuphane-ic", 20), T0);
    s.upsert(crowd("kutuphane-ic-2", 15, { level: "medium" }), T0);
    expect(placeOf(s, "kutuphane-alani")).toMatchObject({ count: 14, level: "high", stale: false });
    expect(placeOf(s, "kutuphane-binasi")).toMatchObject({ count: 35, level: "medium", parking: null });
  });

  it("a parking lot adds up its cameras' slots", () => {
    const s = store();
    s.upsert(lot("otopark-a", 40, 12), T0);
    s.upsert(lot("otopark-a-2", 20, 5), T0);
    expect(placeOf(s, "a-otoparki")).toMatchObject({ count: 43, parking: { total: 60, free: 17 } });
  });

  it("counts fresh cameras only, and a place without one is stale, aged by its newest reading", () => {
    const s = store();
    s.upsert(crowd("kutuphane-giris", 30, { level: "high" }), T0);
    s.upsert(crowd("kutuphane-giris-2", 5), T0 + 10_000);
    s.upsert(crowd("kafe-merkez", 7), T0);
    expect(placeOf(s, "kutuphane-alani", at(16_000))).toMatchObject({ count: 5, level: "low", ageMs: 6_000 });
    expect(placeOf(s, "kafe-alani", at(16_000))).toMatchObject({
      count: null,
      level: null,
      stale: true,
      ageMs: 16_000,
    });
    expect(placeOf(s, "kampus-ana-caddesi")).toMatchObject({ stale: true, ageMs: null, count: null });
  });

  it("merges the outdoor heat by max per cell and leaves indoor and stale cells out", () => {
    const s = store();
    // Two cells both cameras see: the busier view comes first for one and last for the other.
    const a = { lat: 40.74205, lng: 30.33195 };
    const b = { lat: 40.74205, lng: 30.332 };
    s.upsert(
      crowd("kutuphane-giris", 2, {
        cells: [
          { ...a, weight: 1.5 },
          { ...b, weight: 3 },
        ],
      }),
      T0,
    );
    s.upsert(
      crowd("kafe-merkez", 3, {
        cells: [
          { ...a, weight: 2.5 },
          { ...b, weight: 1 },
        ],
      }),
      T0,
    );
    // Ingest refuses indoor cells; the store leaves them out even if one slipped in.
    s.upsert(crowd("kutuphane-ic", 4, { cells: [{ lat: 40.7417, lng: 30.3319, weight: 9 }] }), T0);
    s.upsert(
      crowd("kutuphane-giris-2", 2, { cells: [{ lat: 40.7414, lng: 30.331, weight: 4 }] }),
      T0 - 20_000,
    );
    expect(s.live(at(1_000)).cells).toEqual([
      { ...a, weight: 2.5 },
      { ...b, weight: 3 },
    ]);
  });

  it("is demo unless every fresh reading comes from a real camera", () => {
    const s = store();
    s.upsert(crowd("kutuphane-ic", 4, { source: "camera" }), T0);
    s.upsert(crowd("kutuphane-ic-2", 4, { source: "camera" }), T0);
    expect(placeOf(s, "kutuphane-binasi").demo).toBe(false);
    s.upsert(crowd("kutuphane-ic-2", 4, { source: "demo-footage", measuredAt: at(1).toISOString() }), T0 + 1);
    expect(placeOf(s, "kutuphane-binasi").demo).toBe(true);
  });

  it("refuses a camera that feeds no known place, or a place with a camera's id", () => {
    const fixture = loadRegistry(env.CAMERAS_FILE).list();
    const places = loadPlaces(env.PLACES_FILE);
    const lost = { ...fixture[0]!, id: "kayip", place: "yok" };
    expect(() => new LiveStore(new CameraRegistry([...fixture, lost]), places, 15_000)).toThrow(
      /no known place/,
    );
    const named = { ...fixture[0]!, id: "kafe-alani" };
    expect(() => new LiveStore(new CameraRegistry([...fixture, named]), places, 15_000)).toThrow(
      /camera's id/,
    );
  });
});

// Keys only a camera has; a public payload never carries them (CLAUDE.md §0.2).
const CAMERA_FIELDS = new Set([
  "cameraId",
  "latitude",
  "longitude",
  "heading",
  "fovDeg",
  "rangeM",
  "indoor",
  "reading",
]);
const spot = (lng: number, lat: number) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

/** Every camera id, camera field or camera position anywhere in a payload. */
function leaks(payload: unknown, cameras: Camera[]): string[] {
  const ids = new Set(cameras.map((camera) => camera.id));
  const spots = new Set(cameras.map((camera) => spot(camera.longitude, camera.latitude)));
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string" && ids.has(value)) found.push(`${path}: camera id ${value}`);
    if (Array.isArray(value)) {
      const [a, b] = value;
      if (value.length === 2 && typeof a === "number" && typeof b === "number" && spots.has(spot(a, b))) {
        found.push(`${path}: camera position`);
      }
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      const { lat, lng } = value as { lat?: unknown; lng?: unknown };
      if (typeof lat === "number" && typeof lng === "number" && spots.has(spot(lng, lat))) {
        found.push(`${path}: camera position`);
      }
      for (const [key, item] of Object.entries(value)) {
        if (CAMERA_FIELDS.has(key) || ids.has(key)) found.push(`${path}.${key}: camera key`);
        walk(item, `${path}.${key}`);
      }
    }
  };
  walk(payload, "$");
  return found;
}

describe("the leak check", () => {
  // A check that would pass either way is not a check (CLAUDE.md §2.1).
  it("finds a camera's id, field or position", () => {
    const cameras = loadRegistry(env.CAMERAS_FILE).list();
    const kafe = cameras.find((camera) => camera.id === "kafe-merkez")!;
    expect(leaks({ places: [{ id: "kafe-merkez" }] }, cameras)).toHaveLength(1);
    expect(leaks({ "kafe-merkez": 3 }, cameras)).toHaveLength(1);
    expect(leaks({ heading: 90 }, cameras)).toHaveLength(1);
    expect(leaks({ cells: [{ lat: kafe.latitude, lng: kafe.longitude, weight: 1 }] }, cameras)).toHaveLength(
      1,
    );
    expect(leaks({ coordinates: [[kafe.longitude, kafe.latitude]] }, cameras)).toHaveLength(1);
    expect(leaks({ places: [{ id: "kafe-alani", count: 7 }], cells: HEAT }, cameras)).toEqual([]);
  });
});

describe("public routes and events", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  const clients: Socket[] = [];
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await server.close();
  });

  async function get<T>(path: string): Promise<T> {
    const body = (await (await fetch(`${server.url}${path}`)).json()) as ApiResponse<T>;
    if (!body.success) throw new Error(body.error.message);
    return body.data;
  }
  /** A socket client's "live" snapshots, as they arrive. */
  function subscribe(): unknown[] {
    const client = connect(server.url, { transports: ["websocket"] });
    clients.push(client);
    const snapshots: unknown[] = [];
    client.on(SOCKET_EVENTS.live, (snapshot: unknown) => snapshots.push(snapshot));
    return snapshots;
  }
  /** One fresh reading per fixture camera, as vision would send them. */
  const everyCamera = () => [
    crowd("kutuphane-giris", 9, { cells: HEAT }),
    crowd("kafe-merkez", 7, { cells: [{ ...HEAT[0]!, lng: 30.332, weight: 1 }] }),
    crowd("kutuphane-ic", 12),
    lot("otopark-a", 40, 12),
    reading({ cameraId: "ana-yol", kind: "traffic", count: 6, level: "high", parking: undefined }),
  ];

  it("GET /api/places serves the campus map as it is", async () => {
    const map = await get<CampusMap>("/api/places");
    expect(map.campus.name).toBe("Test kampüsü");
    expect(map.places.map((place) => place.id)).toEqual([
      "kutuphane-alani",
      "kafe-alani",
      "kutuphane-binasi",
      "a-otoparki",
      "kampus-ana-caddesi",
    ]);
  });

  it("GET /api/live serves every place's state and the heat", async () => {
    expect((await ingest(server.url, { readings: everyCamera() })).status).toBe(202);
    const snapshot = LiveSnapshot.parse(await get("/api/live"));
    expect(snapshot.places.find((place) => place.id === "kutuphane-binasi")).toMatchObject({ count: 12 });
    expect(snapshot.places.find((place) => place.id === "a-otoparki")?.parking).toEqual({
      total: 40,
      free: 12,
    });
    expect(snapshot.cells).toHaveLength(2);
  });

  it("refuses cells from an indoor camera", async () => {
    const response = await ingest(server.url, { readings: [crowd("kutuphane-ic", 3, { cells: HEAT })] });
    expect(response.status).toBe(422);
    expect((await get<LiveSnapshot>("/api/live")).cells).toEqual([]);
  });

  it("pushes a fresh snapshot to a connected client every second", async () => {
    const snapshots = subscribe();
    await until(() => snapshots[0]);
    // The same client, already connected: only the periodic push can bring the new count.
    await ingest(server.url, { readings: [crowd("kafe-merkez", 7)] });
    const pushed = await until(() =>
      snapshots
        .map((snapshot) => LiveSnapshot.parse(snapshot))
        .find((snapshot) => snapshot.places.some((place) => place.id === "kafe-alani" && place.count === 7)),
    );
    expect(pushed.places).toHaveLength(5);
  });

  it("no public route or event names or locates a camera", async () => {
    const cameras = loadRegistry(env.CAMERAS_FILE).list();
    // Every event a client hears, by name, over a periodic push.
    const client = connect(server.url, { transports: ["websocket"] });
    clients.push(client);
    const heard: [string, unknown][] = [];
    client.onAny((event: string, payload: unknown) => heard.push([event, payload]));
    expect((await ingest(server.url, { readings: everyCamera() })).status).toBe(202);
    const pushed = await until(() =>
      heard.find(([, payload]) => LiveSnapshot.parse(payload).cells.length === 2),
    );
    const chat = (await (
      await fetch(`${server.url}/api/assistant/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Kampüste genel durum ne?" }),
      })
    ).json()) as ApiResponse<{ answer: string }>;
    if (!chat.success) throw new Error(chat.error.message);
    const payloads = [await get("/api/health"), await get("/api/places"), await get("/api/live"), chat.data];
    for (const payload of [...payloads, ...heard.map(([, each]) => each)]) {
      expect(leaks(payload, cameras)).toEqual([]);
    }
    expect(new Set(heard.map(([event]) => event))).toEqual(new Set([SOCKET_EVENTS.live]));
    expect(pushed).toBeTruthy();
    // The answer is free text: no camera id inside it either.
    for (const camera of cameras) expect(chat.data.answer).not.toContain(camera.id);
  });
});

describe("the live socket", () => {
  it("pushes a snapshot as soon as a client connects", async () => {
    // A minute between periodic pushes: only the push on connect can arrive in time.
    const http = createServer();
    const io = attachLiveSocket(http, store(), [], 60_000);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const client = connect(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, {
      transports: ["websocket"],
    });
    const snapshots: unknown[] = [];
    client.on(SOCKET_EVENTS.live, (snapshot: unknown) => snapshots.push(snapshot));
    try {
      expect(LiveSnapshot.parse(await until(() => snapshots[0])).places).toHaveLength(5);
    } finally {
      client.close();
      await new Promise((resolve) => io.close(resolve));
    }
  });
});

describe("the shared campus", () => {
  it("names and locates no camera, with every camera reporting", () => {
    const registry = loadRegistry(SHARED_CAMERAS_FILE);
    const places = loadPlaces(SHARED_PLACES_FILE);
    const s = new LiveStore(registry, places, 15_000);
    for (const camera of registry.list()) {
      const cells =
        camera.kind === "crowd" && !camera.indoor
          ? [{ lat: camera.latitude + 0.0001, lng: camera.longitude, weight: 1 }]
          : undefined;
      const parking = camera.kind === "parking" ? { total: 20, free: 5 } : undefined;
      s.upsert(reading({ cameraId: camera.id, kind: camera.kind, count: 3, parking, cells }), T0);
    }
    const snapshot = s.live(at(1_000));
    expect(snapshot.places.every((place) => !place.stale)).toBe(true);
    expect(leaks(places.map, registry.list())).toEqual([]);
    expect(leaks(snapshot, registry.list())).toEqual([]);
  });
});
