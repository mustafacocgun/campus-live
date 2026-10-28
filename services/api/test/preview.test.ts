import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EnvSchema } from "../src/config/env.js";
import { loadRegistry } from "../src/modules/cameras/camera-registry.js";
import { LiveStore } from "../src/modules/live/live-store.js";
import { loadPlaces } from "../src/modules/places/place-registry.js";
import { capacity, env as baseEnv, reading } from "./helpers.js";

const JPEG = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );

/** A stand-in vision service running one camera: one multipart part per request, and the paths asked. */
async function fakeVision(camera = "kutuphane-giris") {
  const asked: string[] = [];
  const server = createServer((req, res) => {
    asked.push(req.url ?? "");
    if (req.url !== `/preview/${camera}`) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "multipart/x-mixed-replace; boundary=frame" });
    res.end(Buffer.concat([Buffer.from("--frame\r\nContent-Type: image/jpeg\r\n\r\n"), JPEG, Buffer.from("\r\n")]));
  });
  return { url: await listen(server), asked, server };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

async function api(previewUrl: string | undefined) {
  const env = EnvSchema.parse({ ...baseEnv, VISION_PREVIEW_URL: previewUrl });
  const registry = loadRegistry(env.CAMERAS_FILE);
  const places = loadPlaces(env.PLACES_FILE);
  const store = new LiveStore(registry, places, env.STALE_AFTER_MS);
  const server = createServer(createApp({ registry, places, store, env, llm: null, capacity }));
  servers.push(server);
  return { url: await listen(server), store };
}

describe("GET /api/preview/:placeId (D33)", () => {
  it("is off without VISION_PREVIEW_URL", async () => {
    const { url, store } = await api(undefined);
    store.upsert(reading({ cameraId: "kutuphane-giris", kind: "crowd", parking: undefined }));
    const response = await fetch(`${url}/api/preview/kutuphane-alani`);
    expect(response.status).toBe(404);
    // Readable by the web app's <img>, so the browser sees a 404 and the panel hides cleanly.
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
  });

  it("passes the place's live camera stream through, never naming the camera", async () => {
    const vision = await fakeVision();
    servers.push(vision.server);
    const { url, store } = await api(vision.url);
    store.upsert(reading({ cameraId: "kutuphane-giris", kind: "crowd", parking: undefined }));
    const response = await fetch(`${url}/api/preview/kutuphane-alani`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^multipart\/x-mixed-replace/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The web app's <img> on another port of the same host may show it.
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.includes(JPEG)).toBe(true);
    expect(vision.asked).toEqual(["/preview/kutuphane-giris"]);
    // The camera id stays on the server (CLAUDE.md §0.2).
    expect(JSON.stringify([...response.headers]) + body.toString("latin1")).not.toContain("kutuphane-giris");
  });

  it("is 404 for a place without a fresh reading, and for an unknown place", async () => {
    const vision = await fakeVision();
    servers.push(vision.server);
    const { url } = await api(vision.url);
    expect((await fetch(`${url}/api/preview/kutuphane-alani`)).status).toBe(404);
    expect((await fetch(`${url}/api/preview/no-such-place`)).status).toBe(404);
    expect(vision.asked).toEqual([]);
  });

  it("is 404 when vision has no preview for that camera", async () => {
    const vision = await fakeVision();
    servers.push(vision.server);
    const { url, store } = await api(vision.url);
    store.upsert(reading({ cameraId: "kafe-merkez", kind: "crowd", parking: undefined }));
    expect((await fetch(`${url}/api/preview/kafe-alani`)).status).toBe(404);
  });

  it("asks each vision process in turn: a down one or one without the camera is skipped", async () => {
    const elsewhere = await fakeVision("kafe-merkez");
    const vision = await fakeVision();
    servers.push(elsewhere.server, vision.server);
    // The first runs another camera, the second is down, the third has it.
    const { url, store } = await api(`${elsewhere.url}, http://127.0.0.1:9, ${vision.url}/`);
    store.upsert(reading({ cameraId: "kutuphane-giris", kind: "crowd", parking: undefined }));
    const response = await fetch(`${url}/api/preview/kutuphane-alani`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).includes(JPEG)).toBe(true);
    expect(elsewhere.asked).toEqual(["/preview/kutuphane-giris"]);
    expect(vision.asked).toEqual(["/preview/kutuphane-giris"]);
  });

  it("is 503 when vision cannot be reached", async () => {
    const { url, store } = await api("http://127.0.0.1:9");
    store.upsert(reading({ cameraId: "kutuphane-giris", kind: "crowd", parking: undefined }));
    expect((await fetch(`${url}/api/preview/kutuphane-alani`)).status).toBe(503);
  });
});
