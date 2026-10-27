"use client";

import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, STALE_AFTER_MS, valueText } from "@campus-live/client";
import type { Level, LiveCamera } from "@campus-live/contracts";
import { inkOn } from "@/lib/ink";
import { CHART_UNIT, type SessionPoint } from "@/lib/session-history";
import { DemoBadge, LevelChip } from "./badges";
import { CameraIcon, CloseIcon } from "./icons";
import { SessionChart } from "./SessionChart";

const LEVELS: Level[] = ["low", "medium", "high"];

/** The selected camera: its numbers, its level and this session's readings. Numbers only, never images (§0.2). */
export function CameraDetail({
  camera,
  history,
  onClose,
}: {
  camera: LiveCamera;
  history: SessionPoint[];
  onClose?: () => void;
}) {
  const reading = camera.stale ? null : camera.reading;
  const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
  const reached = reading ? LEVELS.indexOf(reading.level) : -1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Detay</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Detayı kapat"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
          style={{ backgroundColor: color, color: inkOn(color), boxShadow: `0 0 28px ${color}66` }}
        >
          <CameraIcon camera={camera} className="size-7" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg leading-tight font-bold">{camera.name}</p>
          <p className="text-sm text-muted">{camera.section}</p>
        </div>
      </div>
      {reading ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl leading-none font-bold">{valueText(reading)}</span>
            <LevelChip level={reading.level} />
            {isDemo(reading) && <DemoBadge />}
          </div>
          <div className="grid grid-cols-3 gap-1.5" aria-hidden>
            {LEVELS.map((level, i) => (
              <div key={level} className="space-y-1">
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: i <= reached ? color : `${color}33` }}
                />
                <p className={`text-xs ${i === reached ? "font-semibold" : "text-muted"}`}>
                  {LEVEL_LABEL_TR[level]}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Güncel veri yok: son {STALE_AFTER_MS / 1000} saniyede bu kameradan okuma gelmedi.
        </p>
      )}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Bu oturum</h3>
          <p className="text-xs text-muted">
            Sayfa açıldığından beri gelen okumalar. Tarayıcıda tutulur, kaydedilmez.
          </p>
        </div>
        <SessionChart points={history} unit={CHART_UNIT[camera.kind]} />
      </div>
    </div>
  );
}
