"use client";

import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR } from "@campus-live/client";
import dynamic from "next/dynamic";
import { useLiveCameras } from "@/lib/use-live-cameras";
import { AssistantPanel } from "./AssistantPanel";
import { CameraList } from "./CameraList";

// Leaflet needs the browser's window, so the map is never rendered on the server.
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

export function LiveDashboard() {
  const { cameras, connected, error } = useLiveCameras();
  const demo = cameras.some((camera) => camera.reading && isDemo(camera.reading));
  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4 lg:h-screen lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
            CL
          </span>
          <div>
            <h1 className="text-xl leading-tight font-bold tracking-tight">Campus Live</h1>
            <p className="text-sm text-muted">Kampüsün canlı haritası</p>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`}
            />
          </span>
          {connected ? "Canlı bağlantı" : "Bağlantı yok"}
        </span>
      </header>
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {demo && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white">
            i
          </span>
          Demo verisi: kameralar demo videolarıdır ve sayılar tahminidir.
        </p>
      )}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative h-[55vh] overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:h-auto">
          <LiveMap cameras={cameras} />
          <div className="pointer-events-none absolute right-3 bottom-8 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-line bg-surface/90 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur">
            {(["low", "medium", "high"] as const).map((level) => (
              <span key={level} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
                {LEVEL_LABEL_TR[level]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LEVEL_COLOR.stale }} />
              Veri yok
            </span>
          </div>
        </div>
        <aside className="flex flex-col gap-4 lg:min-h-0">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm lg:min-h-0 lg:overflow-y-auto">
            <h2 className="mb-3 font-semibold">Canlı durum</h2>
            <CameraList cameras={cameras} />
          </section>
          <section className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm lg:min-h-[280px] lg:flex-1">
            <AssistantPanel />
          </section>
        </aside>
      </div>
    </main>
  );
}
