import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";

/** Cameras grouped by section; the level is written out, not shown by color alone. */
export function CameraList({ cameras }: { cameras: LiveCamera[] }) {
  const sections = [...new Set(cameras.map((camera) => camera.section))];
  if (!cameras.length) return <p className="text-sm text-muted">Kameralar yükleniyor…</p>;
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section}>
          <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{section}</h3>
          <ul className="mt-1.5 space-y-1.5">
            {cameras
              .filter((camera) => camera.section === section)
              .map((camera) => {
                const reading = camera.stale ? null : camera.reading;
                const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
                return (
                  <li
                    key={camera.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}33` }}
                      />
                      <span className="truncate font-medium">{camera.name}</span>
                    </span>
                    {reading ? (
                      <span className="flex shrink-0 items-center gap-2 text-sm">
                        <span className="font-semibold tabular-nums">{valueText(reading)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ color, backgroundColor: `${color}26` }}
                        >
                          {LEVEL_LABEL_TR[reading.level]}
                        </span>
                        {isDemo(reading) && (
                          <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">
                            Demo
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm text-muted">Güncel veri yok</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
