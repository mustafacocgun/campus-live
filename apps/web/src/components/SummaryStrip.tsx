import { isDemo, LEVEL_COLOR } from "@campus-live/client";
import type { CameraKind, CameraReading, Level, LiveCamera } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { inkOn } from "@/lib/ink";
import { DemoBadge, LevelChip } from "./badges";
import { CameraIcon, KIND_LABEL_TR, KindIcon } from "./icons";

const KINDS: CameraKind[] = ["crowd", "parking", "traffic"];
const LEVEL_ORDER: Level[] = ["low", "medium", "high"];
const UNIT: Record<CameraKind, string> = { crowd: "kişi", parking: "boş", traffic: "araç" };

/** Fresh readings only: a stale camera is left out of every sum, not guessed. */
function freshReadings(cameras: LiveCamera[]): { camera: LiveCamera; reading: CameraReading }[] {
  return cameras.flatMap((camera) =>
    !camera.stale && camera.reading ? [{ camera, reading: camera.reading }] : [],
  );
}

/** One tile per camera kind, plus the busiest crowd spot. */
export function SummaryStrip({ cameras }: { cameras: LiveCamera[] }) {
  const kinds = KINDS.filter((kind) => cameras.some((camera) => camera.kind === kind));
  if (!kinds.length) return null;
  const fresh = freshReadings(cameras);
  const busiest = fresh
    .filter(({ camera }) => camera.kind === "crowd")
    .sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(b.reading.level) - LEVEL_ORDER.indexOf(a.reading.level) ||
        b.reading.count - a.reading.count,
    )[0];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {kinds.map((kind) => (
        <KindTile
          key={kind}
          kind={kind}
          readings={fresh.filter(({ camera }) => camera.kind === kind).map(({ reading }) => reading)}
        />
      ))}
      {busiest && (
        <Tile
          color={LEVEL_COLOR[busiest.reading.level]}
          icon={<CameraIcon camera={busiest.camera} className="size-4.5" />}
          label="En kalabalık"
        >
          <Figure value={busiest.reading.count} unit="kişi" level={busiest.reading.level} />
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
            {busiest.camera.name}
            {isDemo(busiest.reading) && <DemoBadge />}
          </p>
        </Tile>
      )}
    </div>
  );
}

function KindTile({ kind, readings }: { kind: CameraKind; readings: CameraReading[] }) {
  const worst = readings.length
    ? LEVEL_ORDER[Math.max(...readings.map((reading) => LEVEL_ORDER.indexOf(reading.level)))]
    : null;
  const count = readings.reduce((sum, reading) => sum + reading.count, 0);
  const free = readings.reduce((sum, reading) => sum + (reading.parking?.free ?? 0), 0);
  const total = readings.reduce((sum, reading) => sum + (reading.parking?.total ?? 0), 0);
  const color = worst ? LEVEL_COLOR[worst] : LEVEL_COLOR.stale;
  return (
    <Tile color={color} icon={<KindIcon kind={kind} className="size-4.5" />} label={KIND_LABEL_TR[kind]}>
      {worst ? (
        <>
          <Figure value={kind === "parking" ? `${free}/${total}` : count} unit={UNIT[kind]} level={worst} />
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
            {readings.length > 1 && `${readings.length} noktanın en yoğunu`}
            {readings.some(isDemo) && <DemoBadge />}
          </p>
          {kind === "parking" && total > 0 && (
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
