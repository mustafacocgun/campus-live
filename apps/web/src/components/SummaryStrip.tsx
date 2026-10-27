import { LEVEL_COLOR, PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind, Level } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { inkOn } from "@/lib/ink";
import { DemoBadge, LevelChip } from "./badges";
import { KIND_LABEL_TR, KindIcon, PlaceIcon } from "./icons";

const TOPICS: CameraKind[] = ["crowd", "parking", "traffic"];
const LEVEL_ORDER: Level[] = ["low", "medium", "high"];
const UNIT: Record<CameraKind, string> = { crowd: "kişi", parking: "boş", traffic: "araç" };

type Fresh = PlaceView & { level: Level; count: number };

/** Fresh places only: a stale place is left out of every sum, not guessed. */
function freshPlaces(places: PlaceView[]): Fresh[] {
  return places.filter(
    (place): place is Fresh => !place.stale && place.level !== null && place.count !== null,
  );
}

/**
 * One tile per kind of place, plus the busiest crowd place. Sums go over places, never cameras: an
 * area's overlapping views already count once in its place (docs/architecture.md).
 */
export function SummaryStrip({ places }: { places: PlaceView[] }) {
  const topics = TOPICS.filter((topic) => places.some((place) => PLACE_TOPIC[place.kind] === topic));
  if (!topics.length) return null;
  const fresh = freshPlaces(places);
  const busiest = fresh
    .filter((place) => PLACE_TOPIC[place.kind] === "crowd")
    .sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level) || b.count - a.count)[0];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {topics.map((topic) => (
        <TopicTile
          key={topic}
          topic={topic}
          places={fresh.filter((place) => PLACE_TOPIC[place.kind] === topic)}
        />
      ))}
      {busiest && (
        <Tile
          color={LEVEL_COLOR[busiest.level]}
          icon={<PlaceIcon place={busiest} className="size-4.5" />}
          label="En kalabalık"
        >
          <Figure value={busiest.count} unit="kişi" level={busiest.level} />
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
            {busiest.name}
            {busiest.demo && <DemoBadge />}
          </p>
        </Tile>
      )}
    </div>
  );
}

function TopicTile({ topic, places }: { topic: CameraKind; places: Fresh[] }) {
  const worst = places.length
    ? LEVEL_ORDER[Math.max(...places.map((place) => LEVEL_ORDER.indexOf(place.level)))]
    : null;
  const count = places.reduce((sum, place) => sum + place.count, 0);
  const free = places.reduce((sum, place) => sum + (place.parking?.free ?? 0), 0);
  const total = places.reduce((sum, place) => sum + (place.parking?.total ?? 0), 0);
  const color = worst ? LEVEL_COLOR[worst] : LEVEL_COLOR.stale;
  return (
    <Tile color={color} icon={<KindIcon kind={topic} className="size-4.5" />} label={KIND_LABEL_TR[topic]}>
      {worst ? (
        <>
          <Figure value={topic === "parking" ? `${free}/${total}` : count} unit={UNIT[topic]} level={worst} />
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
            {places.length > 1 && `${places.length} yerin en yoğunu`}
            {places.some((place) => place.demo) && <DemoBadge />}
          </p>
          {topic === "parking" && total > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: `${color}33` }}>
              <div
                className="h-full transition-[width] duration-700"
                style={{ width: `${(free / total) * 100}%`, backgroundColor: color }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Güncel veri yok</p>
      )}
    </Tile>
  );
}

function Tile({
  color,
  icon,
  label,
  children,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-surface p-3 sm:p-4"
      style={{
        borderColor: `${color}59`,
        backgroundImage: `linear-gradient(135deg, ${color}2e, transparent 70%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: color, color: inkOn(color), boxShadow: `0 0 14px ${color}59` }}
        >
          {icon}
        </span>
        <h2 className="truncate text-xs font-semibold tracking-wider text-muted uppercase">{label}</h2>
      </div>
      {children}
    </section>
  );
}

/** The tile's number: proportional figures at this size, the unit smaller beside it. */
function Figure({ value, unit, level }: { value: number | string; unit: string; level: Level }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <p className="text-2xl leading-none font-bold">
        {value}
        <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
      </p>
      <LevelChip level={level} />
    </div>
  );
}
