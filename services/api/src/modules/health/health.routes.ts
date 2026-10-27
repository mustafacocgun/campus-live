import { Router } from "express";
import { ok } from "../../lib/http.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json(ok({ status: "ok" }));
});
