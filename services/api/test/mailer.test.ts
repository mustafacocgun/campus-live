import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config/env.js";
import { mailStatus } from "../src/lib/mailer.js";
import { TOKEN } from "./helpers.js";

const env = (mail: Record<string, string>) => EnvSchema.parse({ VISION_INGEST_TOKEN: TOKEN, ...mail });

describe("mailStatus", () => {
  it("says mails go to the dev outbox while SMTP_HOST is empty", async () => {
    expect(await mailStatus(env({ SMTP_HOST: "" }))).toMatch(/^dev outbox/);
  });

  it("says sign-up is closed in production without SMTP", async () => {
    expect(await mailStatus(env({ NODE_ENV: "production" }))).toMatch(/^off/);
  });

  it("names the empty setting instead of trying to log in", async () => {
    expect(await mailStatus(env({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@example.com" }))).toBe(
      "smtp smtp.example.com: SMTP_USER or SMTP_PASS is empty",
    );
  });

  it("reports a server it cannot reach as a failed login, without the password", async () => {
    const status = await mailStatus(
      env({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_USER: "a@example.com", SMTP_PASS: "gizli-sifre" }),
    );
    expect(status).toMatch(/^smtp 127\.0\.0\.1, login failed \(/);
    expect(status).not.toContain("gizli-sifre");
    expect(status).not.toContain("a@example.com");
  });
});
