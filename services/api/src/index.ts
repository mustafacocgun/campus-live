import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createLlmClient } from "./modules/assistant/llm-client.js";
import { corsOrigins, EnvSchema } from "./config/env.js";
import { loadRegistry } from "./modules/cameras/camera-registry.js";
import { attachLiveSocket } from "./modules/live/live-socket.js";
import { LiveStore } from "./modules/live/live-store.js";

const env = EnvSchema.parse(process.env);
const registry = loadRegistry(env.CAMERAS_FILE);
const store = new LiveStore(registry, env.STALE_AFTER_MS);
const llm =
  env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL
    ? createLlmClient({
        baseUrl: env.LLM_BASE_URL,
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL,
        timeoutMs: env.LLM_TIMEOUT_MS,
      })
    : null;
const server = createServer(createApp({ registry, store, env, llm }));
attachLiveSocket(server, store, corsOrigins(env));

// All interfaces, so phones on the same network can reach it during development.
server.listen(env.PORT, () => {
  console.log(`Campus Live API on http://localhost:${env.PORT} (${registry.list().length} cameras)`);
  // The model name only; the key is never logged.
  console.log(
    llm ? `Assistant: LLM ${env.LLM_MODEL}` : "Assistant: rule-based answers only (no LLM_* settings)",
  );
});
