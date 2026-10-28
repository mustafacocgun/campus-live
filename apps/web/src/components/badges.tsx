import { LEVEL_COLOR, LEVEL_LABEL_TR } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";

/**
 * The level as a word beside a dot, on a tint of its color. The text is the level's color mixed
 * halfway into the page's text color: amber alone fails contrast on white, the mix keeps it legible
 * in both themes.
 */
export function LevelChip({ level }: { level: Level }) {
  const color = LEVEL_COLOR[level];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: `color-mix(in srgb, ${color} 55%, var(--foreground))`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {LEVEL_LABEL_TR[level]}
    </span>
  );
}

/** A place with no fresh reading: grey, never a guessed level. */
export function StaleChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LEVEL_COLOR.stale }} />
      Görüntü yok
    </span>
  );
}

/** Every reading not from a real camera says so (CLAUDE.md §0.5). */
export function DemoBadge() {
  return (
    <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">
      Demo
    </span>
  );
}
