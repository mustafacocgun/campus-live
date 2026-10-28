import { LEVEL_COLOR, LEVEL_LABEL_TR, PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind, Level } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { KindIcon } from "./icons";

const LEVEL_ORDER: Level[] = ["low", "medium", "high"];

type Fresh = PlaceView & { level: Level; count: number };

/** Fresh places only: a stale place is left out of every sum, not guessed. */
function freshPlaces(places: PlaceView[]): Fresh[] {
  return places.filter(
    (place): place is Fresh => !place.stale && place.level !== null && place.count !== null,
  );
}

const of = (places: Fresh[], topic: CameraKind) =>
  places.filter((place) => PLACE_TOPIC[place.kind] === topic);

function worst(places: Fresh[]): Level | null {
  return places.length
    ? LEVEL_ORDER[Math.max(...places.map((place) => LEVEL_ORDER.indexOf(place.level)))]
    : null;
}

/** A level as colored text: the color mixed into the text color, so amber stays legible on white. */
function levelText(level: Level): string {
  return `color-mix(in srgb, ${LEVEL_COLOR[level]} 60%, var(--foreground))`;
}

/**
 * Four cards over the live campus: people, free parking, vehicles and the busiest place. Sums go over
 * places, never cameras: an area's overlapping views already count once in its place
 * (docs/architecture.md).
 */
export function SummaryStrip({ places }: { places: PlaceView[] }) {
  const fresh = freshPlaces(places);
  const crowd = of(fresh, "crowd");
  const lots = of(fresh, "parking");
  const roads = of(fresh, "traffic");
  const people = crowd.reduce((sum, place) => sum + place.count, 0);
  const free = lots.reduce((sum, place) => sum + (place.parking?.free ?? 0), 0);
  const total = lots.reduce((sum, place) => sum + (place.parking?.total ?? 0), 0);
  const vehicles = roads.reduce((sum, place) => sum + place.count, 0);
  const crowdLevel = worst(crowd);
  const busiest = [...crowd].sort(
    (a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level) || b.count - a.count,
  )[0];
  return (
    <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
      <Card label="Toplam kişi" icon={<KindIcon kind="crowd" className="h-4 w-4" />}>
        {crowdLevel ? (
          <Figure value={people.toLocaleString("tr-TR")}>
            <span style={{ color: levelText(crowdLevel) }}>{LEVEL_LABEL_TR[crowdLevel]} seviye</span>
          </Figure>
        ) : (
          <Empty />
        )}
      </Card>
      <Card label="Boş otopark" icon={<KindIcon kind="parking" className="h-4 w-4" />}>
        {total > 0 ? (
          <Figure value={free.toLocaleString("tr-TR")}>
            /{total} (%{Math.round((free / total) * 100)})
          </Figure>
        ) : (
          <Empty />
        )}
      </Card>
      <Card label="Araç trafiği" icon={<KindIcon kind="traffic" className="h-4 w-4" />}>
        {roads.length ? <Figure value={vehicles.toLocaleString("tr-TR")}>araç</Figure> : <Empty />}
      </Card>
      <Card
        label="En kalabalık"
        icon={<span className="text-sm leading-none font-bold">!</span>}
        alert={busiest?.level === "high"}
      >
        {busiest ? (
          <div className="mt-1 min-w-0">
            <p className="truncate text-sm leading-snug font-semibold">{busiest.name}</p>
            <p className="text-xs font-medium" style={{ color: levelText(busiest.level) }}>
              {busiest.count.toLocaleString("tr-TR")} kişi
            </p>
          </div>
        ) : (
          <Empty />
        )}
      </Card>
    </div>
  );
}

function Card({
  label,
  icon,
  alert = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</h2>
        {/* In the one-row layout the label needs the width: the icon gives way. */}
        <span className={`2xl:hidden ${alert ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
          {icon}
        </span>
      </div>
      {children}
    </section>
  );
}

/** The card's number, with its unit or context smaller beside it. */
function Figure({ value, children }: { value: string; children: ReactNode }) {
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium text-muted">{children}</span>
    </p>
  );
}

function Empty() {
  return <p className="mt-1 text-sm text-muted">Güncel veri yok</p>;
}
