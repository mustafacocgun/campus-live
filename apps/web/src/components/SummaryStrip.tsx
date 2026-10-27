import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR } from "@campus-live/client";
import type { CameraKind, CameraReading, Level, LiveCamera } from "@campus-live/contracts";
import { KIND_LABEL_TR, KindIcon } from "./icons";

const KINDS: CameraKind[] = ["crowd", "parking", "traffic"];
const LEVEL_ORDER: Level[] = ["low", "medium", "high"];

/** One tile per camera kind, summed from fresh readings only; stale cameras are left out, not guessed. */
export function SummaryStrip({ cameras }: { cameras: LiveCamera[] }) {
  const kinds = KINDS.filter((kind) => cameras.some((camera) => camera.kind === kind));
  if (!kinds.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {kinds.map((kind) => {
        const readings = cameras
          .filter((camera) => camera.kind === kind && !camera.stale && camera.reading)
          .map((camera) => camera.reading as CameraReading);
        return <SummaryTile key={kind} kind={kind} readings={readings} />;
      })}
    </div>
  );
}

function SummaryTile({ kind, readings }: { kind: CameraKind; readings: CameraReading[] }) {
  const worst = readings.length
    ? LEVEL_ORDER[Math.max(...readings.map((reading) => LEVEL_ORDER.indexOf(reading.level)))]
    : null;
  const color = worst ? LEVEL_COLOR[worst] : LEVEL_COLOR.stale;
  const count = readings.reduce((sum, reading) => sum + reading.count, 0);
  const free = readings.reduce((sum, reading) => sum + (reading.parking?.free ?? 0), 0);
  const total = readings.reduce((sum, reading) => sum + (reading.parking?.total ?? 0), 0);
  return (
    <section className="group relative overflow-hidden rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:px-4 sm:py-3">
      <span
        aria-hidden
        className="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-30"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
          <span className="hidden sm:inline" style={{ color }}>
            <KindIcon kind={kind} className="size-4" />
          </span>
          {KIND_LABEL_TR[kind]}
        </h2>
        {readings.length > 1 && (
          <span className="hidden text-[11px] text-muted sm:inline">{readings.length} nokta · en yoğunu</span>
        )}
      </div>
      {worst ? (
        <div className="relative mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-lg leading-tight font-bold tracking-tight tabular-nums sm:text-2xl">
            {kind === "parking" ? `${free}/${total}` : count}
            <span className="ml-1 text-sm font-medium text-muted">
              {kind === "parking" ? "boş" : kind === "crowd" ? "kişi" : "araç"}
            </span>
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ color, backgroundColor: `${color}26` }}
          >
            {LEVEL_LABEL_TR[worst]}
          </span>
          {readings.some(isDemo) && (
            <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">
              Demo
            </span>
          )}
        </div>
      ) : (
        <p className="relative mt-1.5 text-sm text-muted">Güncel veri yok</p>
      )}
      {kind === "parking" && worst && total > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-surface-2">
          <div
            className="h-full transition-[width] duration-700"
            style={{ width: `${(free / total) * 100}%`, backgroundColor: color }}
          />
        </div>
      )}
    </section>
  );
}
