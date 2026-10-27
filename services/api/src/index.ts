import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { corsOrigins, EnvSchema } from "./config/env.js";
import { loadRegistry } from "./modules/cameras/camera-registry.js";
import { attachLiveSocket } from "./modules/live/live-socket.js";
import { LiveStore } from "./modules/live/live-store.js";

const env = EnvSchema.parse(process.env);
const registry = loadRegistry(env.CAMERAS_FILE);
const store = new LiveStore(registry, env.STALE_AFTER_MS);
const server = createServer(createApp({ registry, store, env }));
attachLiveSocket(server, store, corsOrigins(env));

// All interfaces, so phones on the same network can reach it during development.
server.listen(env.PORT, () => {
  console.log(`Campus Live API on http://localhost:${env.PORT} (${registry.list().length} cameras)`);
});
