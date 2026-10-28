import type { User } from "@campus-live/contracts";
import type { RequestHandler, Response } from "express";
import { HttpError } from "../../lib/http.js";
import type { AccountsRepo } from "./accounts.repo.js";
import { hashToken, sessionTokenFrom } from "./sessions.js";

/** Lets a request through only with a live session cookie; the user is then in res.locals.user. */
export function requireUser(repo: AccountsRepo): RequestHandler {
  return async (req, res, next) => {
    const token = sessionTokenFrom(req);
    const user = token ? await repo.userBySession(hashToken(token)) : null;
    if (!user) return next(new HttpError(401, "UNAUTHENTICATED", "Bu işlem için giriş yapmanız gerekiyor."));
    res.locals.user = user;
    next();
  };
}

export function currentUser(res: Response): User {
  return res.locals.user as User;
}

/**
 * Refuses a state-changing request whose Origin header names a site not in CORS_ORIGINS: a second
 * guard after SameSite, since a cookie is what signs these requests in. Requests without an Origin
 * (curl, server-to-server, the tests) carry no browser cookie jar and pass.
 */
export function allowedOriginsOnly(origins: string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.header("origin");
    if (req.method !== "GET" && req.method !== "HEAD" && origin && !origins.includes(origin)) {
      return next(new HttpError(403, "FORBIDDEN_ORIGIN", "Bu kaynaktan gelen isteğe izin verilmiyor."));
    }
    next();
  };
}
