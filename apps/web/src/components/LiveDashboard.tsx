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
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Campus Live</h1>
          <p className="text-gray-500">Kampüsün canlı haritası</p>
        </div>
        <span className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-600" : "bg-gray-400"}`} />
          {connected ? "Canlı bağlantı" : "Bağlantı yok"}
        </span>
      </header>
      {error && <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>}
      {demo && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          Demo verisi: kameralar demo videolarıdır ve sayılar tahminidir.
        </p>
      )}
      <div className="grid flex-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-[60vh] lg:h-auto">
          <LiveMap cameras={cameras} />
        </div>
        <aside className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3 text-sm">
            {(["low", "medium", "high"] as const).map((level) => (
              <span key={level} className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
                {LEVEL_LABEL_TR[level]}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: LEVEL_COLOR.stale }} />
              Veri yok
            </span>
          </div>
          <CameraList cameras={cameras} />
          <AssistantPanel />
        </aside>
      </div>
    </main>
  );
}
