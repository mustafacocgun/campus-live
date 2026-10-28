"use client";

import { LEVEL_COLOR, LEVEL_LABEL_TR, type PlaceView, STALE_AFTER_MS } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";
import { ageText, KIND_TR, nearestParking } from "@/lib/place-format";
import { CHART_UNIT, type SessionPoint } from "@/lib/session-history";
import { DemoBadge, LevelChip, StaleChip } from "./badges";
import { ArrowLeftIcon, KindIcon } from "./icons";
import { SessionChart } from "./SessionChart";

const LEVELS: Level[] = ["low", "medium", "high"];

/** First and last value of this session, and the change between them as a whole percent. */
function trend(points: SessionPoint[]): { from: number; to: number; change: number | null } | null {
  if (points.length < 2) return null;
  const from = points[0].value;
  const to = points[points.length - 1].value;
  return { from, to, change: from > 0 ? Math.round(((to - from) / from) * 100) : null };
}

/**
 * The selected place: its number, its level and this session's values, and for a crowd the nearest
 * lot with free slots. Numbers only, never images (§0.2); the level bar has no numeric ranges, since
 * the thresholds are per camera and not the team's final numbers yet (§0.5).
 */
export function PlaceDetail({
  place,
  places,
  history,
  onBack,
}: {
  place: PlaceView;
  places: PlaceView[];
  history: SessionPoint[];
  onBack: () => void;
}) {
  const level = place.stale ? null : place.level;
  const reached = level ? LEVELS.indexOf(level) : -1;
  const lot = place.kind === "parking" ? null : nearestParking(place, places);
  const change = trend(history);
  const age = ageText(place.ageMs);
  const unit = CHART_UNIT[place.kind];
  const value = place.kind === "parking" ? place.parking?.free : place.count;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-semibold text-accent-text transition hover:bg-surface"
        >
          <ArrowLeftIcon />
          Tüm yerler
        </button>
        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase ring-1 ring-line">
          {KIND_TR[place.kind]}
        </span>
      </div>

      <div>
        <h2 className="text-2xl leading-tight font-bold tracking-tight">{place.name}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {place.section} · {KIND_TR[place.kind]}
          {age && ` · ${age} güncellendi`}
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        {level && value !== null && value !== undefined ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="flex items-baseline gap-2">
                <span className="text-4xl leading-none font-bold tabular-nums">
                  {value.toLocaleString("tr-TR")}
                </span>
                <span className="text-sm text-muted">
                  {place.kind === "parking" ? `boş yer / ${place.parking?.total ?? 0}` : unit}
                </span>
              </p>
              <span className="flex items-center gap-1.5">
                {place.demo && <DemoBadge />}
                <LevelChip level={level} />
              </span>
            </div>
            {/* The three levels as one bar; the reached part carries the color, a tick marks it. */}
            <div className="mt-4 grid grid-cols-3 gap-1" aria-hidden>
              {LEVELS.map((step, i) => (
                <div key={step} className="space-y-1.5">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: LEVEL_COLOR[step],
                      opacity: i <= reached ? 1 : 0.22,
                      boxShadow: i === reached ? "inset -3px 0 0 var(--foreground)" : undefined,
                    }}
                  />
                  <p
                    className={`flex items-center gap-1 text-xs ${i === reached ? "font-semibold" : "text-muted"}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: LEVEL_COLOR[step] }}
                    />
                    {LEVEL_LABEL_TR[step]}
                  </p>
                </div>
              ))}
            </div>
            <span className="sr-only">Seviye: {LEVEL_LABEL_TR[level]}</span>
          </>
        ) : (
          <div className="space-y-2">
            <StaleChip />
            <p className="text-sm text-muted">
              Son {STALE_AFTER_MS / 1000} saniyede bu yerden veri gelmedi; tahmin gösterilmez.
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold">Bu oturum</span>
            {change && (
              <span className="text-muted tabular-nums">
                {change.from} → {change.to} {unit}
                {change.change !== null && (
                  <>
                    {" "}
                    (
                    <span className="font-semibold text-foreground">
                      {change.change > 0 ? "+" : ""}
                      {change.change}%
                    </span>
                    )
                  </>
                )}
              </span>
            )}
          </div>
          <SessionChart points={history} unit={unit} />
          <p className="mt-1.5 text-[11px] text-muted">
            Sayfa açıldığından beri gelen değerler. Tarayıcıda tutulur, kaydedilmez.
          </p>
        </div>
      </section>

      {lot && (
        <section className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <KindIcon kind="parking" className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">En yakın otopark (kuş uçuşu)</span>
            <span className="block truncate text-sm font-semibold">
              {lot.lot.name} ({lot.metres} m)
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-green-600/12 px-2.5 py-1 text-xs font-semibold text-green-700 dark:text-green-400">
            {lot.lot.parking?.free} boş yer
          </span>
        </section>
      )}
    </div>
  );
}
