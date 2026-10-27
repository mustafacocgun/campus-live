import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
  VISION_INGEST_TOKEN: z.string().min(16, "VISION_INGEST_TOKEN must be at least 16 characters"),
  STALE_AFTER_MS: z.coerce.number().int().positive().default(15_000),
  CAMERAS_FILE: z.string().default("config/cameras.json"),
});
export type Env = z.infer<typeof EnvSchema>;

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
