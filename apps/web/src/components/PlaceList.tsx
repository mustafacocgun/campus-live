import { placeColor, placeValueText, type PlaceView } from "@campus-live/client";
import { inkOn } from "@/lib/ink";
import { DemoBadge, LevelChip } from "./badges";
import { ChevronIcon, PlaceIcon } from "./icons";

/** One row per place, each opening its detail; the level is written out, not shown by color alone. */
export function PlaceList({
  places,
  selectedId,
  onSelect,
}: {
  places: PlaceView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!places.length) return <p className="text-sm text-muted">Yerler yükleniyor…</p>;
  return (
    <ul className="space-y-1.5">
      {places.map((place) => {
        const fresh = !place.stale && place.level !== null;
        const color = placeColor(place);
        const selected = place.id === selectedId;
        return (
          <li key={place.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(place.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left transition ${
                selected ? "bg-accent/10 ring-1 ring-accent" : "bg-surface-2 hover:bg-line/60"
              }`}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: color, color: inkOn(color), boxShadow: `0 0 14px ${color}40` }}
              >
                <PlaceIcon place={place} className="size-4.5" />
              </span>
              {/* Two aligned lines, so the name only shares its line with the value. */}
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{place.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {fresh ? placeValueText(place) : ""}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{place.section}</span>
                  {fresh && place.level ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <LevelChip level={place.level} />
                      {place.demo && <DemoBadge />}
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
