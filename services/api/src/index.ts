import "dotenv/config";
import { createServer } from "node:http";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import type { Server } from "socket.io";
import { type AccountsFeature, createAccountsFeature } from "./accounts-feature.js";
import { createApp } from "./app.js";
import { createLlmClient } from "./modules/assistant/llm-client.js";
import { allowedEmailDomains, corsOrigins, EnvSchema } from "./config/env.js";
import { createDb, migrate } from "./db/database.js";
import { createMailer, mailStatus } from "./lib/mailer.js";
import { attachUserRooms, userRoom } from "./modules/alerts/user-rooms.js";
import { loadRegistry } from "./modules/cameras/camera-registry.js";
import { attachLiveSocket } from "./modules/live/live-socket.js";
import { LiveStore } from "./modules/live/live-store.js";
import { loadPlaces } from "./modules/places/place-registry.js";
import { loadCapacity } from "./modules/regions/capacity.js";

const env = EnvSchema.parse(process.env);
const registry = loadRegistry(env.CAMERAS_FILE);
const places = loadPlaces(env.PLACES_FILE);
const store = new LiveStore(registry, places, env.STALE_AFTER_MS);
const capacity = loadCapacity(env.CAPACITY_FILE);
const llm =
  env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL
    ? createLlmClient({
        baseUrl: env.LLM_BASE_URL,
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL,
        timeoutMs: env.LLM_TIMEOUT_MS,
      })
    : null;

// Accounts and alerts need the database; without it they stay off and the live map works as before.
let io: Server | null = null;
let accounts: AccountsFeature | null = null;
let accountsStatus = "off (no DATABASE_URL)";
if (env.DATABASE_URL) {
  const db = createDb(env.DATABASE_URL);
  try {
    const applied = await migrate(db);
    const mailer = createMailer(env);
    accounts = createAccountsFeature({
      db,
      env,
      regions: { places, registry, store, capacity },
      mailer,
      notify: (userId, notification) =>
        io?.to(userRoom(userId)).emit(SOCKET_EVENTS.notification, notification),
    });
    accounts.service.start();
    const domains = allowedEmailDomains(env);
    accountsStatus =
      `on (mail: ${mailer.mode}; sign-up: ${domains.length ? domains.join(", ") : "closed, no ALLOWED_EMAIL_DOMAINS"})` +
      (applied.length ? `; applied ${applied.join(", ")}` : "");
  } catch (error) {
    // The URL holds a password: only the error's code is logged.
    accountsStatus = `off (database unreachable: ${(error as { code?: string }).code ?? (error as Error).message})`;
    await db.end().catch(() => undefined);
  }
}

const server = createServer(createApp({ registry, places, store, env, llm, capacity, accounts }));
io = attachLiveSocket(server, store, corsOrigins(env));
if (accounts) attachUserRooms(io, accounts.accounts.repo);

// All interfaces, so phones on the same network can reach it during development.
server.listen(env.PORT, () => {
  console.log(
    `Campus Live API on http://localhost:${env.PORT} (${places.list().length} places, ${registry.list().length} cameras)`,
  );
  // The model name only; the key is never logged.
  console.log(
    llm ? `Assistant: LLM ${env.LLM_MODEL}` : "Assistant: rule-based answers only (no LLM_* settings)",
  );
  console.log(`Accounts and alerts: ${accountsStatus}`);
  // After listening: a slow mail server must not hold the live map's start.
  if (accounts) void mailStatus(env).then((status) => console.log(`Mail: ${status}`));
});
