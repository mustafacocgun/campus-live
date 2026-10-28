import type { AlertNotification } from "@campus-live/contracts";
import { allowedEmailDomains, type Env } from "./config/env.js";
import type { Db } from "./db/database.js";
import type { Mailer } from "./lib/mailer.js";
import { AccountsRepo } from "./modules/accounts/accounts.repo.js";
import type { AccountsDeps } from "./modules/accounts/auth.routes.js";
import { AlertService } from "./modules/alerts/alert-service.js";
import { AlertsRepo } from "./modules/alerts/alerts.repo.js";
import { type RegionSource, regionsNow } from "./modules/regions/regions.js";

/** Accounts and place alerts: present only while a database is configured and reachable. */
export interface AccountsFeature {
  accounts: AccountsDeps;
  alerts: AlertsRepo;
  service: AlertService;
}

export function createAccountsFeature(deps: {
  db: Db;
  env: Env;
  regions: RegionSource;
  mailer: Mailer;
  notify: (userId: string, notification: AlertNotification) => void;
}): AccountsFeature {
  const { db, env, regions, mailer, notify } = deps;
  const alerts = new AlertsRepo(db);
  return {
    accounts: {
      repo: new AccountsRepo(db),
      mailer,
      allowedDomains: allowedEmailDomains(env),
      secureCookies: env.NODE_ENV === "production",
    },
    alerts,
    service: new AlertService({
      repo: alerts,
      regions: (now) => regionsNow(regions, now),
      mailer,
      notify,
      appUrl: env.APP_URL,
    }),
  };
}
