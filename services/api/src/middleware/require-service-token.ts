import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { HttpError } from "../lib/http.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Lets a request through only with `Authorization: Bearer <token>`; compared in constant time. */
export function requireServiceToken(token: string): RequestHandler {
  const expected = digest(token);
  return (req, _res, next) => {
    const given = req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!given || !timingSafeEqual(digest(given), expected)) {
      return next(new HttpError(401, "UNAUTHORIZED", "A valid service token is required"));
    }
    next();
  };
}
