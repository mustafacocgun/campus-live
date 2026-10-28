import { PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { GridIcon, KIND_LABEL_TR, KindIcon, PlaceIcon } from "./icons";

const TOPICS: CameraKind[] = ["crowd", "parking", "traffic"];

/**
 * "Tümü" plus one chip per kind of place the map has (Kalabalık, Otopark, Trafik); under Kalabalık,
 * one chip per section. Only what the places actually have; nothing invented (CLAUDE.md §0.5).
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
  const crowd = places.filter((place) => PLACE_TOPIC[place.kind] === "crowd");
  const sections = [...new Map(crowd.map((place) => [place.section, place])).values()];
  const chip = (key: string, label: string, icon: ReactNode, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border py-1.5 pr-3 pl-1.5 text-sm font-semibold transition ${
        active
          ? "border-transparent bg-linear-to-r from-accent to-accent-2 text-accent-foreground shadow-lg shadow-accent/30"
          : "border-line bg-surface hover:border-accent/60"
      }`}
    >
      {/* The icon sits in its own tile, tinted while the chip is off and white-on-glass once on. */}
      <span
        className={`grid h-7 w-7 place-items-center rounded-lg ${active ? "bg-white/20" : "bg-accent/15 text-accent-text"}`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
  return (
    <nav aria-label="Yerleri süz" className="flex flex-wrap gap-2">
      {chip("all", "Tümü", <GridIcon />, topic === null, () => onTopic(null))}
      {topics.map((each) =>
        chip(
          each,
          KIND_LABEL_TR[each],
          <KindIcon kind={each} className="h-4 w-4" />,
          topic === each && !section,
          () => onTopic(each),
        ),
      )}
      {topic === "crowd" &&
        sections.map((place) =>
          chip(
            place.section,
            place.section,
            <PlaceIcon place={place} className="h-4 w-4" />,
            section === place.section,
            () => onSection(section === place.section ? null : place.section),
          ),
        )}
    </nav>
  );
}
