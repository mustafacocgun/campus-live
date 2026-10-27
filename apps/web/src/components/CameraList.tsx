import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";

/** Cameras grouped by section; the level is written out, not shown by color alone. */
export function CameraList({ cameras }: { cameras: LiveCamera[] }) {
  const sections = [...new Set(cameras.map((camera) => camera.section))];
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase">{section}</h3>
          <ul className="mt-1 space-y-1">
            {cameras
              .filter((camera) => camera.section === section)
              .map((camera) => {
                const reading = camera.stale ? null : camera.reading;
                const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
                return (
                  <li
                    key={camera.id}
                    className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {camera.name}
                    </span>
                    <span className="text-sm text-right">
                      {reading ? (
                        <>
                          {valueText(reading)} · <strong>{LEVEL_LABEL_TR[reading.level]}</strong>
                          {isDemo(reading) && (
                            <span className="ml-2 rounded bg-gray-100 px-1 text-xs">Demo</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">Güncel veri yok</span>
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
