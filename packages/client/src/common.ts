import { DEFAULT_STALE_AFTER_MS, type Level } from "@campus-live/contracts";

/** A camera silent for longer is shown grey; matches the API's default STALE_AFTER_MS. */
export const STALE_AFTER_MS = DEFAULT_STALE_AFTER_MS;

export const LEVEL_LABEL_TR: Record<Level, string> = { low: "Az", medium: "Orta", high: "Yoğun" };
export const LEVEL_COLOR: Record<Level | "stale", string> = {
  low: "#16a34a",
  medium: "#f59e0b",
  high: "#dc2626",
  stale: "#9ca3af",
};

/** Stale when the last reading arrived more than `staleAfterMs` ago, both times by this device's clock. */
export function isStaleSince(receivedAt: number | null, now: number, staleAfterMs = STALE_AFTER_MS): boolean {
  return receivedAt === null || now - receivedAt > staleAfterMs;
}
