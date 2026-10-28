import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { type CameraReading, SOCKET_EVENTS } from "@campus-live/contracts";
import type { Server } from "socket.io";
import { createAccountsFeature } from "../src/accounts-feature.js";
import { createApp } from "../src/app.js";
import type { LlmClient } from "../src/modules/assistant/llm-client.js";
import { EnvSchema } from "../src/config/env.js";
import { type Db, migrate } from "../src/db/database.js";
import type { Mail, Mailer } from "../src/lib/mailer.js";
import { attachUserRooms, userRoom } from "../src/modules/alerts/user-rooms.js";
import { loadRegistry } from "../src/modules/cameras/camera-registry.js";
import { attachLiveSocket } from "../src/modules/live/live-socket.js";
import { LiveStore } from "../src/modules/live/live-store.js";
import { loadPlaces } from "../src/modules/places/place-registry.js";
import { loadCapacity } from "../src/modules/regions/capacity.js";

export const TOKEN = "test-token-1234567890";

// The tests' own cameras, places and capacities, so the demo files (config/) can change freely.
export const env = EnvSchema.parse({
  VISION_INGEST_TOKEN: TOKEN,
  CAMERAS_FILE: fileURLToPath(new URL("./fixtures/cameras.json", import.meta.url)),
  PLACES_FILE: fileURLToPath(new URL("./fixtures/places.json", import.meta.url)),
  CAPACITY_FILE: fileURLToPath(new URL("./fixtures/capacity.json", import.meta.url)),
  ALLOWED_EMAIL_DOMAINS: "okul.edu.tr, ogr.okul.edu.tr",
});
export const capacity = loadCapacity(env.CAPACITY_FILE);

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

/** A mailer that keeps what it was asked to send, so a test can read the sign-up code. */
export function fakeMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    mode: "smtp",
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}

/** An empty, migrated test database (DATABASE_URL_TEST); never the development one. */
export async function resetDb(db: Db): Promise<void> {
  await migrate(db);
  await db.query("TRUNCATE users, email_codes, sessions, alert_rules, notifications CASCADE");
}

/**
 * The real app and Socket.IO on a random port, with the test camera registry. With a database it
 * also runs accounts and alerts (checked every `alertCheckMs`), mailing through `mailer`.
 */
export async function startServer(
  llm: LlmClient | null = null,
  options: { db?: Db; mailer?: Mailer; alertCheckMs?: number } = {},
) {
  const registry = loadRegistry(env.CAMERAS_FILE);
  const places = loadPlaces(env.PLACES_FILE);
  const store = new LiveStore(registry, places, env.STALE_AFTER_MS);
  let io: Server | null = null;
  const accounts = options.db
    ? createAccountsFeature({
        db: options.db,
        env,
        regions: { places, registry, store, capacity },
        mailer: options.mailer ?? fakeMailer(),
        notify: (userId, notification) =>
          io?.to(userRoom(userId)).emit(SOCKET_EVENTS.notification, notification),
      })
    : null;
  const stopAlerts = accounts?.service.start(options.alertCheckMs ?? 50);
  const server = createServer(createApp({ registry, places, store, env, llm, capacity, accounts }));
  io = attachLiveSocket(server, store, ["http://localhost:3000"]);
  if (accounts) attachUserRooms(io, accounts.accounts.repo);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      stopAlerts?.();
      io?.close();
      server.close(() => resolve());
    });
  return { url, store, accounts, close };
}

export function ingest(url: string, body: unknown, token: string | null = TOKEN) {
  return fetch(`${url}/internal/readings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
