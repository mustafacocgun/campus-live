import type { ApiResponse, CameraReading, LiveCamera } from "@campus-live/contracts";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry } from "../src/modules/cameras/camera-registry.js";
import { LiveStore } from "../src/modules/live/live-store.js";
import { env, ingest, reading, startServer } from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

async function cameras(): Promise<LiveCamera[]> {
  const body = (await (await fetch(`${server.url}/api/cameras`)).json()) as ApiResponse<LiveCamera[]>;
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

describe("GET /api/cameras", () => {
  it("serves an ingested reading on GET /api/cameras", async () => {
    const sent = reading();
    await ingest(server.url, { readings: [sent] });
    const parking = (await cameras()).find((camera) => camera.id === "otopark-a");
    expect(parking).toMatchObject({ name: "Otopark A", kind: "parking", stale: false, reading: sent });
  });

  it("lists cameras without readings as stale", async () => {
    const all = await cameras();
    expect(all.map((camera) => camera.id)).toEqual([
      "kutuphane-giris",
      "kafe-merkez",
      "otopark-a",
      "ana-yol",
    ]);
    expect(all.every((camera) => camera.stale && camera.reading === null)).toBe(true);
  });
});

describe("LiveStore", () => {
  const store = () => new LiveStore(loadRegistry(env.CAMERAS_FILE), 15_000);
  const at = (iso: string) => reading({ measuredAt: iso });
  const parkingOf = (s: LiveStore, now: string) =>
    s.snapshot(new Date(now)).find((c) => c.id === "otopark-a")!;

  it("marks a camera stale after STALE_AFTER_MS", () => {
    const s = store();
    s.upsert(at("2026-10-27T07:00:00.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:14.999Z").stale).toBe(false);
    expect(parkingOf(s, "2026-10-27T07:00:15.001Z").stale).toBe(true);
  });

  it("keeps the newer reading when an older one arrives late", () => {
    const s = store();
    s.upsert(at("2026-10-27T07:00:05.000Z"));
    s.upsert(at("2026-10-27T07:00:01.000Z"));
    expect(parkingOf(s, "2026-10-27T07:00:06.000Z").reading?.measuredAt).toBe("2026-10-27T07:00:05.000Z");
  });
});

describe("Socket.IO", () => {
  it("broadcasts readings over Socket.IO", async () => {
    const client = connect(server.url, { transports: ["websocket"] });
    await new Promise<void>((resolve) => client.on("connect", resolve));
    const received = new Promise<CameraReading>((resolve) => client.on(SOCKET_EVENTS.reading, resolve));
    const sent = reading();
    await ingest(server.url, { readings: [sent] });
    expect(await received).toEqual(sent);
    client.close();
  });
});
