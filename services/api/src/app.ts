import cors from "cors";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import type { AccountsFeature } from "./accounts-feature.js";
import { corsOrigins, type Env } from "./config/env.js";
import { HttpError } from "./lib/http.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { authRouter } from "./modules/accounts/auth.routes.js";
import { allowedOriginsOnly } from "./modules/accounts/require-user.js";
import { alertsRouter } from "./modules/alerts/alerts.routes.js";
import { assistantRouter } from "./modules/assistant/assistant.routes.js";
import type { LlmClient } from "./modules/assistant/llm-client.js";
import type { CameraRegistry } from "./modules/cameras/camera-registry.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { ingestRouter } from "./modules/live/ingest.routes.js";
import { liveRouter } from "./modules/live/live.routes.js";
import type { LiveStore } from "./modules/live/live-store.js";
import type { PlaceRegistry } from "./modules/places/place-registry.js";
import { placesRouter } from "./modules/places/places.routes.js";
import { previewRouter } from "./modules/preview/preview.routes.js";
import type { CapacityTable } from "./modules/regions/capacity.js";
import { monitoredPlaces } from "./modules/regions/regions.js";
import { regionsRouter } from "./modules/regions/regions.routes.js";

export interface AppDeps {
  registry: CameraRegistry;
  places: PlaceRegistry;
  store: LiveStore;
  env: Env;
  llm: LlmClient | null;
  capacity: CapacityTable;
  /** Null without a reachable database: the account routes then answer 503 and the rest works. */
  accounts?: AccountsFeature | null;
}

const accountsOff: RequestHandler = (_req, _res, next) =>
  next(new HttpError(503, "ACCOUNTS_OFF", "Hesap özellikleri şu an kullanılamıyor."));

export function createApp({ registry, places, store, env, llm, capacity, accounts = null }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  // Credentials: the session cookie travels from the web app's origin to the API.
  app.use(cors({ origin: corsOrigins(env), credentials: true }));
  // The public routes take small bodies; the ingest route parses its own, after the token check.
  app.use("/api", express.json({ limit: "256kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/places", placesRouter(places));
  app.use("/api/live", liveRouter(store));
  app.use("/api/preview", previewRouter({ store, visionUrl: env.VISION_PREVIEW_URL }));
  app.use("/api/regions", regionsRouter({ places, registry, store, capacity }));
  app.use("/api/assistant", assistantRouter({ store, places, llm }));
  if (accounts) {
    const sameSite = allowedOriginsOnly(corsOrigins(env));
    app.use("/api/auth", sameSite, authRouter(accounts.accounts));
    app.use(
      "/api/alerts",
      sameSite,
      alertsRouter({
        repo: accounts.alerts,
        accounts: accounts.accounts.repo,
        service: accounts.service,
        places,
        monitored: () => monitoredPlaces(registry),
      }),
    );
  } else {
    app.use(["/api/auth", "/api/alerts"], accountsOff);
  }
  app.use("/internal/readings", ingestRouter({ registry, store, token: env.VISION_INGEST_TOKEN }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
