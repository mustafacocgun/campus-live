import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "cl_session";
export const SESSION_DAYS = 30;

/** A new session token (sent to the browser once) and the hash the database keeps instead. */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** One cookie's value from a raw Cookie header (Express has no parser without another package). */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionTokenFrom(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}

/**
 * HttpOnly, so page scripts never see it; SameSite=Lax, so other sites cannot send it with a form.
 * The web app (:3000) and the API (:4000) are the same site on localhost, so Lax is enough there.
 */
export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
}
