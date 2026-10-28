import type { AlertDirection } from "@campus-live/contracts";

/**
 * After an alert, a rule fires again only once the region has come back this many points past the
 * threshold: counts are estimates that wobble, and a region hovering at 59-61% must not mail every
 * few seconds.
 */
export const REARM_MARGIN_PCT = 5;
/** And never twice within this long, whatever the wobble. */
export const MIN_ALERT_GAP_MS = 10 * 60_000;

export interface Threshold {
  direction: AlertDirection;
  thresholdPct: number;
}

/** Past the threshold in the rule's direction: below it, or above it. */
export function isPast(rule: Threshold, percent: number): boolean {
  return rule.direction === "below" ? percent < rule.thresholdPct : percent > rule.thresholdPct;
}

function isBack(rule: Threshold, percent: number): boolean {
  return rule.direction === "below"
    ? percent >= rule.thresholdPct + REARM_MARGIN_PCT
    : percent <= rule.thresholdPct - REARM_MARGIN_PCT;
}

/**
 * One fresh percent for a rule. `armed` is undefined before the rule has seen its region: the first
 * look only arms it (when the region is not yet past the threshold), so creating a rule, or restarting
 * the API, never sends an alert by itself. An armed rule fires when the region crosses the threshold
 * and stays quiet until it is back past the margin.
 */
export function step(
  rule: Threshold,
  armed: boolean | undefined,
  percent: number,
): { fire: boolean; armed: boolean } {
  if (armed === undefined) return { fire: false, armed: !isPast(rule, percent) };
  if (armed && isPast(rule, percent)) return { fire: true, armed: false };
  if (!armed && isBack(rule, percent)) return { fire: false, armed: true };
  return { fire: false, armed };
}

/** The in-app line. No suffix after a number: Turkish suffixes depend on how the number is read. */
export function alertMessage(section: string, rule: Threshold, percent: number): string {
  const crossing = rule.direction === "below" ? "altına indi" : "üstüne çıktı";
  return `${section} doluluğu %${percent}: %${rule.thresholdPct} eşiğinin ${crossing}.`;
}
