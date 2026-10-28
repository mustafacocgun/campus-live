import type { ApiError } from "@campus-live/contracts";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { isDbUnreachable } from "../db/database.js";
import { HttpError } from "../lib/http.js";

function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json(fail("NOT_FOUND", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(fail(err.code, err.message));
  } else if (err instanceof ZodError) {
    res.status(400).json(fail("VALIDATION_ERROR", err.issues.map((issue) => issue.message).join("; ")));
  } else if (err?.type === "entity.parse.failed") {
    res.status(400).json(fail("INVALID_JSON", "The request body is not valid JSON"));
  } else if (err?.type === "entity.too.large") {
    res.status(413).json(fail("TOO_LARGE", "The request body is too large"));
  } else if (isDbUnreachable(err)) {
    res
      .status(503)
      .json(
        fail("ACCOUNTS_UNAVAILABLE", "Hesap özellikleri şu an kullanılamıyor: veritabanına ulaşılamadı."),
      );
  } else if (typeof err?.severity === "string") {
    // A Postgres error: its `detail` can quote a row's values (an e-mail), so only code and message
    // are logged (CLAUDE.md §0.4).
    console.error(`Database error ${err.code}: ${err.message}`);
    res.status(500).json(fail("INTERNAL_ERROR", "Something went wrong"));
  } else {
    console.error(err);
    res.status(500).json(fail("INTERNAL_ERROR", "Something went wrong"));
  }
};
