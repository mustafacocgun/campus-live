import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config/env.js";

describe("EnvSchema", () => {
  it("refuses the .env.example placeholder ingest token (#8)", () => {
    const result = EnvSchema.safeParse({ VISION_INGEST_TOKEN: "change-me-to-a-long-random-string" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/placeholder/);
  });

  it("accepts a real token", () => {
    expect(EnvSchema.safeParse({ VISION_INGEST_TOKEN: "3f9c2a7e1b8d4c6f0a5e9b2d7c1f8a3e" }).success).toBe(
      true,
    );
  });
});
