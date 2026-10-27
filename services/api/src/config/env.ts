import { DEFAULT_STALE_AFTER_MS } from "@campus-live/contracts";
import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
  VISION_INGEST_TOKEN: z.string().min(16, "VISION_INGEST_TOKEN must be at least 16 characters"),
  // The apps assume the default (DEFAULT_STALE_AFTER_MS); change both together.
  STALE_AFTER_MS: z.coerce.number().int().positive().default(DEFAULT_STALE_AFTER_MS),
  CAMERAS_FILE: z.string().default("config/cameras.json"),
  // The assistant's LLM (any OpenAI-compatible API). Without all three, it answers rule-based only.
  LLM_BASE_URL: z.string().trim().optional(),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_MODEL: z.string().trim().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
});
export type Env = z.infer<typeof EnvSchema>;

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
