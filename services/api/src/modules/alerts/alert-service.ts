import type { AlertNotification, Region } from "@campus-live/contracts";
import { isDbUnreachable } from "../../db/database.js";
import { type Mailer, mailErrorSummary } from "../../lib/mailer.js";
import { alertMessage, MIN_ALERT_GAP_MS, step } from "./alert-engine.js";
import type { ActiveRule, AlertsRepo } from "./alerts.repo.js";

// As often as the apps get a live snapshot (live-socket.ts): an alert lands with what the map shows.
const CHECK_MS = 1_000;

export interface AlertServiceDeps {
  repo: AlertsRepo;
  /** Every watchable place's percent now (regions.ts). */
  regions: (now: Date) => Region[];
  mailer: Mailer;
  /** Delivers a notification to the user's open apps (Socket.IO room). */
  notify: (userId: string, notification: AlertNotification) => void;
  /** The web app's address, for the link in alert e-mails. */
  appUrl: string;
}

/**
 * Checks every enabled rule against its place once a second. Only fresh readings count: a place with
 * every camera silent is skipped, so a camera going dark never fires an alert.
 */
export class AlertService {
  private rules: ActiveRule[] | null = null;
  /** Per rule: ready to fire (see alert-engine's `step`). Kept in memory; a restart re-arms quietly. */
  private readonly armed = new Map<string, boolean>();
  private running = false;

  constructor(private readonly deps: AlertServiceDeps) {}

  /** Starts the checks; returns the stop function. */
  start(checkMs = CHECK_MS): () => void {
    const timer = setInterval(() => void this.run(), checkMs);
    return () => clearInterval(timer);
  }

  /** A rule was created, changed or deleted: reload before the next check. */
  rulesChanged(changedRuleId?: string): void {
    this.rules = null;
    // A new threshold or direction starts unobserved, so it arms again without firing.
    if (changedRuleId) this.armed.delete(changedRuleId);
  }

  private async run(): Promise<void> {
    // A slow database must not stack checks on top of each other.
    if (this.running) return;
    this.running = true;
    try {
      await this.evaluate();
    } catch (error) {
      // Never stops the live map. No rule contents in the log: they carry users' e-mails.
      console.error(`Alerts: ${isDbUnreachable(error) ? "database unreachable" : (error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async evaluate(now = new Date()): Promise<void> {
    this.rules ??= await this.deps.repo.activeRules();
    if (!this.rules.length) return;
    const regions = new Map(this.deps.regions(now).map((region) => [region.id, region]));
    for (const rule of this.rules) {
      const region = regions.get(rule.place);
      if (region?.percent == null) continue;
      const { fire, armed } = step(rule, this.armed.get(rule.id), region.percent);
      this.armed.set(rule.id, armed);
      if (!fire) continue;
      const last = rule.lastNotifiedAt ? Date.parse(rule.lastNotifiedAt) : null;
      if (last !== null && now.getTime() - last < MIN_ALERT_GAP_MS) continue;
      rule.lastNotifiedAt = now.toISOString();
      await this.fire(rule, region as Region & { percent: number }, now);
    }
  }

  private async fire(rule: ActiveRule, region: Region & { percent: number }, now: Date): Promise<void> {
    const { repo, mailer, notify } = this.deps;
    const message = alertMessage(region.name, rule, region.percent);
    const notification = await repo.insertNotification(
      rule.userId,
      rule.id,
      {
        place: region.id,
        placeName: region.name,
        direction: rule.direction,
        thresholdPct: rule.thresholdPct,
        percent: region.percent,
        demo: region.demo,
        message,
      },
      now,
    );
    await repo.markNotified(rule.id, now);
    notify(rule.userId, notification);
    if (!rule.email) return;
    // Not awaited: a slow mail server must not hold the next check.
    mailer
      .send({
        to: rule.userEmail,
        subject: `Campus Live: ${message}`,
        text: [
          message,
          "",
          "Yüzde, yerin tahmini kapasitesine göredir; sayılar kameralardan tahmin edilir.",
          ...(region.demo
            ? ["Demo verisi: bu sayılar kampüs kamerasından değil, demo videolarından gelir."]
            : []),
          "",
          `Canlı harita: ${this.deps.appUrl}`,
          "Bu bildirimi Campus Live'daki bildirim ayarlarınızdan kapatabilirsiniz.",
        ].join("\n"),
      })
      .catch((error) => console.error(`Alert mail: ${mailErrorSummary(error)}`));
  }
}
