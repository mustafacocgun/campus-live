import { LEVEL_COLOR, LEVEL_LABEL_TR } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";

/** The level as a word beside a dot; the text stays in the text color (amber text fails contrast). */
export function LevelChip({ level }: { level: Level }) {
  const color = LEVEL_COLOR[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}26` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {LEVEL_LABEL_TR[level]}
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
