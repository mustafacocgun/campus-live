import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { CameraReading } from "@campus-live/contracts";
import { createApp } from "../src/app.js";
import type { LlmClient } from "../src/modules/assistant/llm-client.js";
import { EnvSchema } from "../src/config/env.js";
import { loadRegistry } from "../src/modules/cameras/camera-registry.js";
import { attachLiveSocket } from "../src/modules/live/live-socket.js";
import { LiveStore } from "../src/modules/live/live-store.js";

export const TOKEN = "test-token-1234567890";

// The tests' own cameras, so the demo registry (config/cameras.json) can change freely.
export const env = EnvSchema.parse({
  VISION_INGEST_TOKEN: TOKEN,
  CAMERAS_FILE: fileURLToPath(new URL("./fixtures/cameras.json", import.meta.url)),
});

export function reading(overrides: Partial<CameraReading> = {}): CameraReading {
  return {
    cameraId: "otopark-a",
    kind: "parking",
    count: 28,
    level: "medium",
    parking: { total: 40, free: 12 },
    source: "simulated",
    measuredAt: new Date().toISOString(),
    ...overrides,
  };
}

/** The real app and Socket.IO on a random port, with the test camera registry. */
export async function startServer(llm: LlmClient | null = null) {
  const registry = loadRegistry(env.CAMERAS_FILE);
  const store = new LiveStore(registry, env.STALE_AFTER_MS);
  const server = createServer(createApp({ registry, store, env, llm }));
  const io = attachLiveSocket(server, store, ["http://localhost:3000"]);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      io.close();
      server.close(() => resolve());
    });
  return { url, store, close };
}

export function ingest(url: string, body: unknown, token: string | null = TOKEN) {
  return fetch(`${url}/internal/readings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
