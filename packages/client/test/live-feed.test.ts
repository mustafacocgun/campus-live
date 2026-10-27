import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type LiveCamera, SOCKET_EVENTS } from "@campus-live/contracts";
import { Server } from "socket.io";
import { afterEach, expect, it } from "vitest";
import { type LiveState, startLiveFeed } from "../src/index.js";

const CAMERA: LiveCamera = {
  id: "otopark-a",
  name: "Otopark A",
  section: "Otoparklar",
  kind: "parking",
  latitude: 40.74,
  longitude: 30.33,
  reading: null,
  stale: true,
  ageMs: null,
};

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((stop) => stop()));

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** A stand-in API: GET /api/cameras plus Socket.IO, on a given port. */
async function startApi(port: number) {
  const server = createServer((req, res) => {
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ success: true, data: [CAMERA] }));
  });
  const io = new Server(server);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  cleanup.push(() => {
    io.close();
    server.close();
  });
  return io;
}

function waitFor(states: LiveState[], check: (state: LiveState) => boolean, ms: number): Promise<LiveState> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const poll = setInterval(() => {
      const hit = states.find(check);
      if (hit || Date.now() > deadline) {
        clearInterval(poll);
        if (hit) resolve(hit);
        else reject(new Error(`no matching state in ${ms} ms; last: ${JSON.stringify(states.at(-1))}`));
      }
    }, 50);
  });
}

it("re-syncs the camera list when the API comes up after the first fetch failed", async () => {
  const port = await freePort();
  const states: LiveState[] = [];
  cleanup.push(startLiveFeed(`http://127.0.0.1:${port}`, (state) => states.push(state)));
  await waitFor(states, (state) => state.error !== null, 3_000); // nothing listens yet

  await startApi(port);
  const synced = await waitFor(states, (state) => state.cameras.length === 1, 8_000);
  expect(synced.error).toBeNull();
}, 15_000);

it("applies live readings to the list", async () => {
  const port = await freePort();
  const io = await startApi(port);
  const states: LiveState[] = [];
  cleanup.push(startLiveFeed(`http://127.0.0.1:${port}`, (state) => states.push(state)));
  await waitFor(states, (state) => state.connected && state.cameras.length === 1, 5_000);
  io.emit(SOCKET_EVENTS.reading, {
    cameraId: "otopark-a",
    kind: "parking",
    count: 28,
    level: "medium",
    parking: { total: 40, free: 12 },
    source: "simulated",
    measuredAt: new Date().toISOString(),
  });
  const live = await waitFor(states, (state) => state.cameras[0]?.reading?.count === 28, 3_000);
  expect(live.cameras[0].stale).toBe(false);
}, 15_000);

it("judges staleness by when readings arrive, not by the reading's own clock", async () => {
  const port = await freePort();
  const io = await startApi(port);
  const states: LiveState[] = [];
  cleanup.push(startLiveFeed(`http://127.0.0.1:${port}`, (state) => states.push(state), 100));
  await waitFor(states, (state) => state.connected && state.cameras.length === 1, 5_000);
  // The vision PC's clock is an hour behind this device's.
  io.emit(SOCKET_EVENTS.reading, {
    cameraId: "otopark-a",
    kind: "parking",
    count: 28,
    level: "medium",
    parking: { total: 40, free: 12 },
    source: "simulated",
    measuredAt: new Date(Date.now() - 3_600_000).toISOString(),
  });
  await waitFor(states, (state) => state.cameras[0]?.reading?.count === 28, 3_000);
  const ticked = states.length;
  await waitFor(states, () => states.length >= ticked + 3, 3_000); // a few 100 ms ticks later
  expect(states.at(-1)!.cameras[0].stale).toBe(false);
}, 15_000);
