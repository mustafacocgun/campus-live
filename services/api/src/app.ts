import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOrigins, type Env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { assistantRouter } from "./modules/assistant/assistant.routes.js";
import type { LlmClient } from "./modules/assistant/llm-client.js";
import type { CameraRegistry } from "./modules/cameras/camera-registry.js";
import { camerasRouter } from "./modules/cameras/cameras.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { ingestRouter } from "./modules/live/ingest.routes.js";
import type { LiveStore } from "./modules/live/live-store.js";

export interface AppDeps {
  registry: CameraRegistry;
  store: LiveStore;
  env: Env;
  llm: LlmClient | null;
}

export function createApp({ registry, store, env, llm }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: corsOrigins(env) }));
  // The public routes take small bodies; the ingest route parses its own, after the token check.
  app.use("/api", express.json({ limit: "256kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/cameras", camerasRouter(store));
  app.use("/api/assistant", assistantRouter({ store, llm }));
  app.use("/internal/readings", ingestRouter({ registry, store, token: env.VISION_INGEST_TOKEN }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
