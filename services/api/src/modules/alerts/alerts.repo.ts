import type { AlertNotification, AlertRule, AlertRuleInput, AlertRulePatch } from "@campus-live/contracts";
import type { Db } from "../../db/database.js";

/** A rule as stored: the routes add the place's current name from places.json. */
export type StoredRule = Omit<AlertRule, "placeName">;

/** An enabled rule with its owner, as the alert service evaluates it. */
export interface ActiveRule extends StoredRule {
  userId: string;
  userEmail: string;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const RULE_COLUMNS = "id, place, direction, threshold_pct, email, enabled, created_at, last_notified_at";

interface RuleRow {
  id: string;
  place: string;
  direction: AlertRule["direction"];
  threshold_pct: number;
  email: boolean;
  enabled: boolean;
  created_at: Date;
  last_notified_at: Date | null;
}

interface NotificationRow {
  id: string;
  place: string;
  place_name: string;
  direction: AlertNotification["direction"];
  threshold_pct: number;
  percent: number;
  demo: boolean;
  message: string;
  created_at: Date;
  read_at: Date | null;
}

function toRule(row: RuleRow): StoredRule {
  return {
    id: row.id,
    place: row.place,
    direction: row.direction,
    thresholdPct: row.threshold_pct,
    email: row.email,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    lastNotifiedAt: iso(row.last_notified_at),
  };
}

function toNotification(row: NotificationRow): AlertNotification {
  return {
    id: row.id,
    place: row.place,
    placeName: row.place_name,
    direction: row.direction,
    thresholdPct: row.threshold_pct,
    percent: row.percent,
    demo: row.demo,
    message: row.message,
    createdAt: row.created_at.toISOString(),
    readAt: iso(row.read_at),
  };
}

/** Every SQL query on alert rules and notifications; each one scoped to its user. */
export class AlertsRepo {
  constructor(private readonly db: Db) {}

  async listRules(userId: string): Promise<StoredRule[]> {
    const { rows } = await this.db.query<RuleRow>(
      `SELECT ${RULE_COLUMNS} FROM alert_rules WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows.map(toRule);
  }

  async countRules(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM alert_rules WHERE user_id = $1",
      [userId],
    );
    return rows[0].n;
  }

  async createRule(userId: string, input: AlertRuleInput): Promise<StoredRule> {
    const { rows } = await this.db.query<RuleRow>(
      `INSERT INTO alert_rules (user_id, place, direction, threshold_pct, email)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${RULE_COLUMNS}`,
      [userId, input.place, input.direction, input.thresholdPct, input.email],
    );
    return toRule(rows[0]);
  }

  /** Null when the rule does not exist or belongs to someone else. */
  async updateRule(userId: string, id: string, patch: AlertRulePatch): Promise<StoredRule | null> {
    const { rows } = await this.db.query<RuleRow>(
      `UPDATE alert_rules SET
         direction = COALESCE($3, direction),
         threshold_pct = COALESCE($4, threshold_pct),
         email = COALESCE($5, email),
         enabled = COALESCE($6, enabled)
       WHERE id = $1 AND user_id = $2 RETURNING ${RULE_COLUMNS}`,
      [
        id,
        userId,
        patch.direction ?? null,
        patch.thresholdPct ?? null,
        patch.email ?? null,
        patch.enabled ?? null,
      ],
    );
    return rows[0] ? toRule(rows[0]) : null;
  }

  async deleteRule(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query("DELETE FROM alert_rules WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);
    return rowCount === 1;
  }

  /** Every enabled rule of a verified user. */
  async activeRules(): Promise<ActiveRule[]> {
    const { rows } = await this.db.query<RuleRow & { user_id: string; user_email: string }>(
      `SELECT r.id, r.place, r.direction, r.threshold_pct, r.email, r.enabled, r.created_at,
              r.last_notified_at, r.user_id, u.email AS user_email
       FROM alert_rules r JOIN users u ON u.id = r.user_id
       WHERE r.enabled AND u.verified_at IS NOT NULL`,
    );
    return rows.map((row) => ({ ...toRule(row), userId: row.user_id, userEmail: row.user_email }));
  }

  async markNotified(ruleId: string, at: Date): Promise<void> {
    await this.db.query("UPDATE alert_rules SET last_notified_at = $2 WHERE id = $1", [ruleId, at]);
  }

  async insertNotification(
    userId: string,
    ruleId: string,
    alert: Omit<AlertNotification, "id" | "createdAt" | "readAt">,
    at: Date,
  ): Promise<AlertNotification> {
    const { rows } = await this.db.query<NotificationRow>(
      `INSERT INTO notifications
         (user_id, rule_id, place, place_name, direction, threshold_pct, percent, demo, message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        userId,
        ruleId,
        alert.place,
        alert.placeName,
        alert.direction,
        alert.thresholdPct,
        alert.percent,
        alert.demo,
        alert.message,
        at,
      ],
    );
    return toNotification(rows[0]);
  }

  async listNotifications(userId: string, limit: number): Promise<AlertNotification[]> {
    const { rows } = await this.db.query<NotificationRow>(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows.map(toNotification);
  }

  /** Marks the given notifications read, or all of the user's; returns how many changed. */
  async markRead(userId: string, ids?: string[]): Promise<number> {
    const { rowCount } = ids
      ? await this.db.query(
          "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[])",
          [userId, ids],
        )
      : await this.db.query(
          "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
          [userId],
        );
    return rowCount ?? 0;
  }
}
