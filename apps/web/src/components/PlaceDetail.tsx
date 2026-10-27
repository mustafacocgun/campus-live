"use client";

import {
  LEVEL_LABEL_TR,
  placeColor,
  placeValueText,
  type PlaceView,
  STALE_AFTER_MS,
} from "@campus-live/client";
import type { Level } from "@campus-live/contracts";
import { inkOn } from "@/lib/ink";
import { CHART_UNIT, type SessionPoint } from "@/lib/session-history";
import { DemoBadge, LevelChip } from "./badges";
import { CloseIcon, PlaceIcon } from "./icons";
import { SessionChart } from "./SessionChart";

const LEVELS: Level[] = ["low", "medium", "high"];
const KIND_TR = { area: "Açık alan", building: "Bina", parking: "Otopark", road: "Yol" } as const;

/** The selected place: its numbers, its level and this session's values. Numbers only, never images (§0.2). */
export function PlaceDetail({
  place,
  history,
  onClose,
}: {
  place: PlaceView;
  history: SessionPoint[];
  onClose?: () => void;
}) {
  const level = place.stale ? null : place.level;
  const color = placeColor(place);
  const reached = level ? LEVELS.indexOf(level) : -1;
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
          <PlaceIcon place={place} className="size-7" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg leading-tight font-bold">{place.name}</p>
          <p className="text-sm text-muted">
            {place.section} · {KIND_TR[place.kind]}
          </p>
        </div>
      </div>
      {level ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl leading-none font-bold">{placeValueText(place)}</span>
            <LevelChip level={level} />
            {place.demo && <DemoBadge />}
          </div>
          {place.parking && place.parking.total > 0 && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: `${color}33` }}>
                <div
                  className="h-full transition-[width] duration-700"
                  style={{
                    width: `${(place.parking.free / place.parking.total) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <p className="text-xs text-muted">
                {place.parking.total} yerin {place.parking.free} tanesi boş
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5" aria-hidden>
            {LEVELS.map((step, i) => (
              <div key={step} className="space-y-1">
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: i <= reached ? color : `${color}33` }}
                />
                <p className={`text-xs ${i === reached ? "font-semibold" : "text-muted"}`}>
                  {LEVEL_LABEL_TR[step]}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Güncel veri yok: son {STALE_AFTER_MS / 1000} saniyede bu yerden veri gelmedi.
        </p>
      )}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Bu oturum</h3>
          <p className="text-xs text-muted">
            Sayfa açıldığından beri gelen değerler. Tarayıcıda tutulur, kaydedilmez.
          </p>
        </div>
        <SessionChart points={history} unit={CHART_UNIT[place.kind]} />
      </div>
    </div>
  );
}
