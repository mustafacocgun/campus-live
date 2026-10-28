import { LEVEL_COLOR, placeValueText, type PlaceView } from "@campus-live/client";
import { ageText, KIND_TR } from "@/lib/place-format";
import { DemoBadge, LevelChip, StaleChip } from "./badges";

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
  if (!places.length) return <p className="px-1 py-6 text-center text-sm text-muted">Eşleşen yer yok.</p>;
  return (
    <ul className="space-y-2">
      {places.map((place) => {
        const fresh = !place.stale && place.level !== null;
        const selected = place.id === selectedId;
        const age = ageText(place.ageMs);
        return (
          <li key={place.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(place.id)}
              className={`relative w-full rounded-xl border px-3.5 py-3 text-left transition ${
                selected
                  ? "border-line bg-surface shadow-card"
                  : "border-transparent hover:border-line hover:bg-surface"
              }`}
            >
              {/* The selected row's mark, in the level's color like its pin on the map. */}
              {selected && (
                <span
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                  style={{
                    backgroundColor: fresh && place.level ? LEVEL_COLOR[place.level] : "var(--accent)",
                  }}
                />
              )}
              <span className="flex items-start justify-between gap-3">
                <span className={`min-w-0 ${fresh ? "" : "opacity-60"}`}>
                  <span className="block truncate text-sm font-semibold">{place.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {place.section} · {KIND_TR[place.kind]}
                  </span>
                </span>
                {fresh && place.level ? <LevelChip level={place.level} /> : <StaleChip />}
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5">
                  {fresh ? (
                    <span className="text-sm font-semibold tabular-nums">{placeValueText(place)}</span>
                  ) : (
                    <span className="text-muted">Güncel veri yok</span>
                  )}
                  {fresh && place.demo && <DemoBadge />}
                </span>
                {age && <span className="shrink-0 text-muted">{age}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
