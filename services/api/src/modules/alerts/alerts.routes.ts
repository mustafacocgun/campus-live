import { type AlertRule, AlertRuleInput, AlertRulePatch, MarkReadRequest } from "@campus-live/contracts";
import { Router } from "express";
import { z } from "zod";
import { HttpError, ok } from "../../lib/http.js";
import type { AccountsRepo } from "../accounts/accounts.repo.js";
import { currentUser, requireUser } from "../accounts/require-user.js";
import type { PlaceRegistry } from "../places/place-registry.js";
import type { AlertService } from "./alert-service.js";
import type { AlertsRepo, StoredRule } from "./alerts.repo.js";

const MAX_RULES = 20;
const RuleId = z.uuid();
const Limit = z.coerce.number().int().min(1).max(50).default(30);

/**
 * /api/alerts: the signed-in user's rules and notifications. A rule watches a place some camera feeds
 * (`monitored`, from the registry), so a place added to config/cameras.json can be chosen after the API
 * restarts.
 */
export function alertsRouter(deps: {
  repo: AlertsRepo;
  accounts: AccountsRepo;
  service: AlertService;
  places: PlaceRegistry;
  monitored: () => Set<string>;
}): Router {
  const { repo, service } = deps;
  const router = Router();
  router.use(requireUser(deps.accounts));

  function ruleId(raw: string): string {
    const parsed = RuleId.safeParse(raw);
    if (!parsed.success) throw new HttpError(404, "RULE_NOT_FOUND", "Bildirim kuralı bulunamadı.");
    return parsed.data;
  }

  // The place's name as places.json has it now; a place that left the file keeps its id.
  const named = (rule: StoredRule): AlertRule => ({
    ...rule,
    placeName: deps.places.get(rule.place)?.name ?? rule.place,
  });

  router.get("/rules", async (_req, res) => {
    res.json(ok((await repo.listRules(currentUser(res).id)).map(named)));
  });

  router.post("/rules", async (req, res) => {
    const input = AlertRuleInput.parse(req.body);
    const user = currentUser(res);
    if (!deps.monitored().has(input.place)) {
      throw new HttpError(400, "UNKNOWN_PLACE", "Bu yer için canlı veri yok: başka bir yer seçin.");
    }
    if ((await repo.countRules(user.id)) >= MAX_RULES) {
      throw new HttpError(400, "TOO_MANY_RULES", `En fazla ${MAX_RULES} bildirim kuralı ekleyebilirsiniz.`);
    }
    const rule = await repo.createRule(user.id, input);
    service.rulesChanged();
    res.status(201).json(ok(named(rule)));
  });

  router.patch("/rules/:id", async (req, res) => {
    const id = ruleId(req.params.id);
    const patch = AlertRulePatch.parse(req.body);
    const rule = await repo.updateRule(currentUser(res).id, id, patch);
    if (!rule) throw new HttpError(404, "RULE_NOT_FOUND", "Bildirim kuralı bulunamadı.");
    service.rulesChanged(id);
    res.json(ok(named(rule)));
  });

  router.delete("/rules/:id", async (req, res) => {
    const id = ruleId(req.params.id);
    if (!(await repo.deleteRule(currentUser(res).id, id))) {
      throw new HttpError(404, "RULE_NOT_FOUND", "Bildirim kuralı bulunamadı.");
    }
    service.rulesChanged(id);
    res.json(ok(null));
  });

  router.get("/notifications", async (req, res) => {
    res.json(ok(await repo.listNotifications(currentUser(res).id, Limit.parse(req.query.limit))));
  });

  router.post("/notifications/read", async (req, res) => {
    const { ids } = MarkReadRequest.parse(req.body ?? {});
    const valid = ids?.filter((id) => RuleId.safeParse(id).success);
    res.json(ok({ updated: await repo.markRead(currentUser(res).id, valid) }));
  });

  return router;
}
