import { PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind } from "@campus-live/contracts";
import { KIND_LABEL_TR } from "./icons";

const TOPICS: CameraKind[] = ["crowd", "parking", "traffic"];

/**
 * "Tümü" plus one pill per kind of place the map has (Kalabalık, Otopark, Trafik), and under them one
 * tab per section of the chosen kind. Only what the places actually have; nothing invented
 * (CLAUDE.md §0.5).
 */
export function FilterChips({
  places,
  topic,
  section,
  onTopic,
  onSection,
}: {
  places: PlaceView[];
  topic: CameraKind | null;
  section: string | null;
  onTopic: (topic: CameraKind | null) => void;
  onSection: (section: string | null) => void;
}) {
  const topics = TOPICS.filter((each) => places.some((place) => PLACE_TOPIC[place.kind] === each));
  if (!topics.length) return null;
  // Sections once a kind is chosen: under "Tümü" the row would be long and push the list down.
  const sections = topic
    ? [...new Set(places.filter((place) => PLACE_TOPIC[place.kind] === topic).map((place) => place.section))]
    : [];
  const pill = (key: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-accent text-accent-foreground shadow-card"
          : "bg-surface text-foreground ring-1 ring-line hover:ring-line-strong"
      }`}
    >
      {label}
    </button>
  );
  return (
    <nav aria-label="Yerleri süz" className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {pill("all", "Tümü", topic === null, () => onTopic(null))}
        {topics.map((each) => pill(each, KIND_LABEL_TR[each], topic === each, () => onTopic(each)))}
      </div>
      {sections.length > 1 && (
        // Scrolls sideways on a narrow sidebar instead of wrapping into a block of tabs.
        <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 [scrollbar-width:none]">
          {sections.map((each) => {
            const active = section === each;
            return (
              <button
                key={each}
                type="button"
                aria-pressed={active}
                onClick={() => onSection(active ? null : each)}
                className={`-mb-px shrink-0 border-b-2 px-2 pt-1 pb-2 text-xs font-semibold whitespace-nowrap transition ${
                  active
                    ? "border-accent text-accent-text"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {each}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
