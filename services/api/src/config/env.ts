import { DEFAULT_STALE_AFTER_MS } from "@campus-live/contracts";
import { z } from "zod";
import { SHARED_CAMERAS_FILE } from "../modules/cameras/camera-registry.js";
import { SHARED_PLACES_FILE } from "../modules/places/place-registry.js";
import { DEFAULT_CAPACITY_FILE } from "../modules/regions/capacity.js";

/** The value in both .env.example files: public, so anyone on the network could post readings with it (#8). */
const PLACEHOLDER_TOKEN = "change-me-to-a-long-random-string";

/** An optional setting: an empty value in .env counts as unset. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
  VISION_INGEST_TOKEN: z
    .string()
    .min(16, "VISION_INGEST_TOKEN must be at least 16 characters")
    .refine((token) => token !== PLACEHOLDER_TOKEN, {
      message:
        "VISION_INGEST_TOKEN is still the .env.example placeholder: put the same random value in " +
        "services/api/.env and services/vision/.env (see the README's setup step)",
    }),
  // The apps assume the default (DEFAULT_STALE_AFTER_MS); change both together.
  STALE_AFTER_MS: z.coerce.number().int().positive().default(DEFAULT_STALE_AFTER_MS),
  CAMERAS_FILE: z.string().default(SHARED_CAMERAS_FILE),
  PLACES_FILE: z.string().default(SHARED_PLACES_FILE),
  // The assistant's LLM (any OpenAI-compatible API). Without all three, it answers rule-based only.
  LLM_BASE_URL: z.string().trim().optional(),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_MODEL: z.string().trim().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  // Accounts and place alerts. Without DATABASE_URL (or with the database down) they are off and
  // the map and the assistant work as before (CLAUDE.md §4.3).
  DATABASE_URL: optionalText,
  // The only e-mail domains that may sign up, comma separated (exact match after the @).
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),
  // Placeholder capacities behind the alert percents (CLAUDE.md §0.5).
  CAPACITY_FILE: z.string().default(DEFAULT_CAPACITY_FILE),
  // Outgoing mail. Without SMTP_HOST, development writes each mail to services/api/.mail-outbox/.
  SMTP_HOST: optionalText,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: optionalText,
  SMTP_PASS: optionalText,
  MAIL_FROM: z.string().default("Campus Live <no-reply@campus-live.local>"),
  // The web app's address, for the link in alert e-mails.
  APP_URL: z.string().default("http://localhost:3000"),
  // The stage preview (D33): the vision services' addresses on the demo machine, comma separated
  // (http://127.0.0.1:8001,http://127.0.0.1:8002), with VISION_PREVIEW on there. Unset, the preview
  // route answers 404.
  VISION_PREVIEW_URL: optionalText,
});
export type Env = z.infer<typeof EnvSchema>;

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function allowedEmailDomains(env: Env): string[] {
  return env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}
