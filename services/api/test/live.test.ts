import type { ApiResponse, CameraReading, LiveSnapshot } from "@campus-live/contracts";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry, SHARED_CAMERAS_FILE } from "../src/modules/cameras/camera-registry.js";
import { LiveStore } from "../src/modules/live/live-store.js";
import { loadPlaces } from "../src/modules/places/place-registry.js";
import { env, ingest, reading, startServer } from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

async function live(): Promise<LiveSnapshot> {
  const body = (await (await fetch(`${server.url}/api/live`)).json()) as ApiResponse<LiveSnapshot>;
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

describe("POST /internal/readings", () => {
  it("rejects ingest without a token", async () => {
    expect((await ingest(server.url, { readings: [reading()] }, null)).status).toBe(401);
  });

  it("rejects ingest with a wrong token", async () => {
    expect((await ingest(server.url, { readings: [reading()] }, "wrong-token-1234567890")).status).toBe(401);
  });

  it("rejects an invalid batch with 400", async () => {
    const response = await ingest(server.url, { readings: [reading({ count: -1 })] });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiResponse<unknown>).success).toBe(false);
  });

  it("rejects an unknown camera with 422", async () => {
    const response = await ingest(server.url, { readings: [reading({ cameraId: "nope" })] });
    expect(response.status).toBe(422);
  });

  it("rejects a kind mismatch with 422", async () => {
    // kafe-merkez is a crowd camera in the registry.
    const response = await ingest(server.url, { readings: [reading({ cameraId: "kafe-merkez" })] });
    expect(response.status).toBe(422);
  });

  it("accepts known cameras and reports unknown ones in a mixed batch", async () => {
    const response = await ingest(server.url, { readings: [reading(), reading({ cameraId: "nope" })] });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ success: true, data: { accepted: 1, rejected: ["nope"] } });
  });
});

describe("GET /api/live", () => {
  it("shows an ingested reading in its place", async () => {
    await ingest(server.url, { readings: [reading()] });
    const lot = (await live()).places.find((place) => place.id === "a-otoparki");
    expect(lot).toMatchObject({ count: 28, level: "medium", parking: { total: 40, free: 12 }, stale: false });
  });

  it("lists every place as stale before any reading", async () => {
    const { places } = await live();
    expect(places.map((place) => place.id)).toEqual([
      "kutuphane-alani",
      "kafe-alani",
      "kutuphane-binasi",
      "a-otoparki",
      "kampus-ana-caddesi",
    ]);
    expect(places.every((place) => place.stale && place.count === null)).toBe(true);
  });

  it("has no per-camera route", async () => {
    expect((await fetch(`${server.url}/api/cameras`)).status).toBe(404);
  });
});

describe("LiveStore", () => {
  const store = () => new LiveStore(loadRegistry(env.CAMERAS_FILE), loadPlaces(env.PLACES_FILE), 15_000);
  const at = (iso: string, count = 28) => reading({ measuredAt: iso, count });
  const ms = (iso: string) => Date.parse(iso);
  const parkingOf = (s: LiveStore, now: string) =>
    s.live(new Date(now)).places.find((place) => place.id === "a-otoparki")!;

  it("marks a place stale after STALE_AFTER_MS", () => {
    const s = store();
    s.upsert(at("2026-10-27T07:00:00.000Z"), ms("2026-10-27T07:00:00.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:14.999Z")).toMatchObject({ stale: false, ageMs: 14_999 });
    expect(parkingOf(s, "2026-10-27T07:00:15.001Z").stale).toBe(true);
  });

  it("staleness uses the API's receive time, not the vision machine's clock", () => {
    const s = store();
    // The vision PC's clock is an hour behind the API's.
    s.upsert(at("2026-10-27T06:00:00.000Z"), ms("2026-10-27T07:00:00.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:01.000Z")).toMatchObject({ stale: false, ageMs: 1_000 });
  });

  it("keeps the newer reading when an older one arrives late", () => {
    const s = store();
    s.upsert(at("2026-10-27T07:00:05.000Z", 28), ms("2026-10-27T07:00:05.000Z"));
    s.upsert(at("2026-10-27T07:00:01.000Z", 30), ms("2026-10-27T07:00:06.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:06.000Z").count).toBe(28);
  });

  it("a future-dated reading does not block later readings once it is stale", () => {
    const s = store();
    // A vision clock 10 minutes ahead, then corrected: its next readings look "older".
    s.upsert(at("2026-10-27T07:10:00.000Z", 30), ms("2026-10-27T07:00:00.000Z"));
    s.upsert(at("2026-10-27T07:00:20.000Z", 28), ms("2026-10-27T07:00:20.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:20.000Z")).toMatchObject({ stale: false, count: 28 });
  });
});

describe("Socket.IO", () => {
  it("sends live snapshots only, never a reading", async () => {
    const client = connect(server.url, { transports: ["websocket"] });
    const events = new Set<string>();
    client.onAny((event: string) => events.add(event));
    await new Promise<void>((resolve) => client.on("connect", resolve));
    await ingest(server.url, { readings: [reading()] });
    // Over a second and a half, at least one periodic snapshot after the reading arrived.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    client.close();
    expect([...events]).toEqual([SOCKET_EVENTS.live]);
  });
});

describe("shared camera registry", () => {
  it("loads the shared registry with poses", () => {
    const registry = loadRegistry(SHARED_CAMERAS_FILE);
    expect(registry.list().length).toBeGreaterThanOrEqual(10);
    for (const camera of registry.list()) {
      expect(camera.heading).toBeGreaterThanOrEqual(0);
      expect(camera.fovDeg).toBeGreaterThanOrEqual(10);
      expect(camera.rangeM).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("density cells", () => {
  const cells = [{ lat: 40.7419, lng: 30.3318, weight: 1.5 }];
  const crowd = (overrides: Partial<CameraReading> = {}) =>
    reading({ cameraId: "kafe-merkez", kind: "crowd", count: 7, parking: undefined, cells, ...overrides });

  it("accepts crowd readings with cells and serves them as the heat", async () => {
    expect((await ingest(server.url, { readings: [crowd()] })).status).toBe(202);
    expect((await live()).cells).toEqual(cells);
  });

  it("rejects cells on a non-crowd camera", async () => {
    // otopark-a is a parking camera: its readings never carry cells.
    expect((await ingest(server.url, { readings: [reading({ cells })] })).status).toBe(400);
  });

  it("accepts the largest batch the contract allows", async () => {
    // 100 readings of 2000 cells each, about 10 MB: a crowded batch must never bounce off a size limit.
    const many = Array.from({ length: 2000 }, (_, i) => ({
      lat: 40.7416123 + i * 1e-7,
      lng: 30.3325456,
      weight: 1.234,
    }));
    const readings = Array.from({ length: 100 }, (_, i) =>
      crowd({ cameraId: i % 2 ? "kafe-merkez" : "kutuphane-giris", cells: many }),
    );
    expect((await ingest(server.url, { readings })).status).toBe(202);
  });

  it("checks the token before it reads a body", async () => {
    const response = await fetch(`${server.url}/internal/readings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(300_000),
    });
    expect(response.status).toBe(401);
  });
});
