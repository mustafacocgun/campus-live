import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTransport } from "nodemailer";
import type { Env } from "../config/env.js";

/** services/api/.mail-outbox (git-ignored; same depth from src/ and dist/). */
export const MAIL_OUTBOX_DIR = fileURLToPath(new URL("../../.mail-outbox/", import.meta.url));

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** "smtp" sends; "outbox" writes .eml files for development; "off" refuses (production without SMTP). */
  readonly mode: "smtp" | "outbox" | "off";
  send(mail: Mail): Promise<void>;
}

/**
 * SMTP when SMTP_HOST is set. Without it, development writes each mail to MAIL_OUTBOX_DIR so sign-up
 * can be tried locally; production refuses rather than pretend a mail went out.
 */
function smtpTransport(env: Env) {
  return createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    // A mail server that hangs must not hold a sign-up or an alert for long.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export function createMailer(env: Env): Mailer {
  if (env.SMTP_HOST) {
    const transport = smtpTransport(env);
    return {
      mode: "smtp",
      async send(mail) {
        await transport.sendMail({ from: env.MAIL_FROM, ...mail });
      },
    };
  }
  if (env.NODE_ENV === "production") {
    return {
      mode: "off",
      async send() {
        throw new Error("mail is not configured (SMTP_HOST)");
      },
    };
  }
  const transport = createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  return {
    mode: "outbox",
    async send(mail) {
      const info = await transport.sendMail({ from: env.MAIL_FROM, ...mail });
      mkdirSync(MAIL_OUTBOX_DIR, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.eml`;
      writeFileSync(`${MAIL_OUTBOX_DIR}${name}`, info.message as Buffer);
    },
  };
}

/**
 * A mail error without the addresses SMTP servers put in their messages: e-mails never go into a log
 * (CLAUDE.md §0.4). Only the error's code and the server's status code are kept.
 */
export function mailErrorSummary(error: unknown): string {
  return `mail failed (${errorCodes(error)})`;
}

function errorCodes(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  return [code, responseCode].filter(Boolean).join(", ") || "unknown";
}

/**
 * One line for the startup log: whether mail can go out. With SMTP it logs in once (no mail is
 * sent), so a wrong app password shows at startup, not at someone's first sign-up. Never prints the
 * address or the password.
 */
export async function mailStatus(env: Env): Promise<string> {
  if (!env.SMTP_HOST) {
    return env.NODE_ENV === "production"
      ? "off: no SMTP_HOST, so nobody can sign up"
      : "dev outbox: mails are written to services/api/.mail-outbox/, not sent (no SMTP_HOST)";
  }
  if (!env.SMTP_USER || !env.SMTP_PASS) return `smtp ${env.SMTP_HOST}: SMTP_USER or SMTP_PASS is empty`;
  const transport = smtpTransport(env);
  try {
    await transport.verify();
    const from = env.MAIL_FROM.includes("@campus-live.local")
      ? "; MAIL_FROM is still the placeholder, set it to this account's address"
      : "";
    return `smtp ${env.SMTP_HOST}, login ok${from}`;
  } catch (error) {
    const hint =
      (error as { code?: unknown }).code === "EAUTH" ? ": check SMTP_USER and the app password" : "";
    return `smtp ${env.SMTP_HOST}, login failed (${errorCodes(error)})${hint}`;
  } finally {
    transport.close();
  }
}
