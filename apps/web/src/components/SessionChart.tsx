"use client";

import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import type { SessionPoint } from "@/lib/session-history";

const W = 280;
const H = 104;
const PAD = { top: 10, right: 10, bottom: 20, left: 30 };

/** Campus time, whatever the device's zone (CLAUDE.md §2.10). */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** One camera's readings since the page opened; a crosshair reads any point, by pointer or arrow keys. */
export function SessionChart({ points, unit }: { points: SessionPoint[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  // Two charts can be on the page at once (the map overlay and the detail column): ids must differ.
  const gradient = `chart${useId().replace(/[^\w-]/g, "")}`;
  if (points.length < 2)
    return (
      <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
        Grafik ilk birkaç okumadan sonra çizilir.
      </p>
    );

  const values = points.map((point) => point.value);
  const top = Math.max(1, ...values);
  const first = points[0].at;
  const last = points[points.length - 1];
  const span = Math.max(1, last.at - first);
  const x = (at: number) => PAD.left + ((at - first) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - value / top) * (H - PAD.top - PAD.bottom);
  const base = y(0);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(last.at).toFixed(1)} ${base}L${PAD.left} ${base}Z`;
  const index = active === null ? null : Math.min(active, points.length - 1);
  const shown = index === null ? null : points[index];
  const summary = `Bu oturumda ${points.length} okuma: en düşük ${Math.min(...values)}, en yüksek ${Math.max(...values)}, son ${last.value} ${unit}.`;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((point, i) => {
      if (Math.abs(x(point.at) - px) < Math.abs(x(points[best].at) - px)) best = i;
    });
    setActive(best);
  }

  function step(event: KeyboardEvent) {
    const end = points.length - 1;
    const current = index ?? end;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: end }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(end, next)));
  }

  const left = shown ? (x(shown.at) / W) * 100 : 0;
  return (
    <div
      role="group"
      aria-label={summary}
      tabIndex={0}
      onKeyDown={step}
      onFocus={() => setActive((current) => current ?? points.length - 1)}
      onBlur={() => setActive(null)}
      className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
        aria-hidden
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={y(top)} y2={y(top)} className="stroke-line" />
        <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} className="stroke-line" />
        <g className="fill-muted text-[10px] tabular-nums">
          <text x={PAD.left - 6} y={y(top) + 3} textAnchor="end">
            {top}
          </text>
          <text x={PAD.left - 6} y={base + 3} textAnchor="end">
            0
          </text>
          <text x={PAD.left} y={H - 4}>
            {clock(first)}
          </text>
          <text x={W - PAD.right} y={H - 4} textAnchor="end">
            {clock(last.at)}
          </text>
        </g>
        <defs>
          {/* The brand's violet-to-fuchsia, along the line and fading down through the area. */}
          <linearGradient id={`${gradient}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--brand-2)" />
          </linearGradient>
          <linearGradient id={`${gradient}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand-2)" stopOpacity={0.3} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradient}-area)`} />
        <path
          d={line}
          fill="none"
          stroke={`url(#${gradient}-line)`}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {shown && (
          <line
            x1={x(shown.at)}
            x2={x(shown.at)}
            y1={PAD.top}
            y2={base}
            vectorEffect="non-scaling-stroke"
            className="stroke-muted/60"
          />
        )}
        <circle
          cx={x((shown ?? last).at)}
          cy={y((shown ?? last).value)}
          r={4}
          strokeWidth={2}
          className="fill-brand-2 stroke-surface"
        />
      </svg>
      {shown && (
        <div
          className="pointer-events-none absolute -top-2 flex flex-col rounded-lg border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{
            left: `${left}%`,
            transform: `translate(${left < 25 ? "0" : left > 75 ? "-100%" : "-50%"}, -100%)`,
          }}
        >
          <strong className="font-semibold">
            {shown.value} {unit}
          </strong>
          <span className="text-muted">{clock(shown.at)}</span>
        </div>
      )}
    </div>
  );
}
