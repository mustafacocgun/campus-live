import type { RequestHandler } from "express";
import { HttpError } from "../../lib/http.js";

/** At most `limit` requests per `windowMs` from one client IP (CLAUDE.md §4.9). */
export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return next(new HttpError(429, "RATE_LIMITED", "Çok fazla soru: lütfen biraz bekleyin."));
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
