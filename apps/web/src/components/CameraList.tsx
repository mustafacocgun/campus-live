import { isDemo, LEVEL_COLOR, valueText } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";
import { inkOn } from "@/lib/ink";
import { DemoBadge, LevelChip } from "./badges";
import { CameraIcon, ChevronIcon } from "./icons";

/** One row per camera, each opening its detail; the level is written out, not shown by color alone. */
export function CameraList({
  cameras,
  selectedId,
  onSelect,
}: {
  cameras: LiveCamera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!cameras.length) return <p className="text-sm text-muted">Kameralar yükleniyor…</p>;
  return (
    <ul className="space-y-1.5">
      {cameras.map((camera) => {
        const reading = camera.stale ? null : camera.reading;
        const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
        const selected = camera.id === selectedId;
        return (
          <li key={camera.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(camera.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left transition ${
                selected ? "bg-accent/10 ring-1 ring-accent" : "bg-surface-2 hover:bg-line/60"
              }`}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: color, color: inkOn(color), boxShadow: `0 0 14px ${color}40` }}
              >
                <CameraIcon camera={camera} className="size-4.5" />
              </span>
              {/* Two aligned lines, so the name only shares its line with the value. */}
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{camera.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {reading ? valueText(reading) : ""}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{camera.section}</span>
                  {reading ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <LevelChip level={reading.level} />
                      {isDemo(reading) && <DemoBadge />}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted">Güncel veri yok</span>
                  )}
                </span>
              </span>
              <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
