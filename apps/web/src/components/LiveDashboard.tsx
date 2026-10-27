"use client";

import { LEVEL_COLOR, LEVEL_LABEL_TR, PLACE_TOPIC } from "@campus-live/client";
import type { CameraKind } from "@campus-live/contracts";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useLivePlaces } from "@/lib/use-live-places";
import { AssistantPanel } from "./AssistantPanel";
import { FilterChips } from "./FilterChips";
import { LogoMark } from "./icons";
import { PlaceDetail } from "./PlaceDetail";
import { PlaceList } from "./PlaceList";
import { SummaryStrip } from "./SummaryStrip";

// MapLibre draws with the browser's WebGL, so the map is never rendered on the server.
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

// The heat layer's ramp (LiveMap's heatmap-color), as a CSS gradient for the legend.
const HEAT_RAMP =
  "linear-gradient(to right, rgba(37,99,235,0.45), rgba(16,185,129,0.6), rgba(250,204,21,0.75), rgba(249,115,22,0.85), rgba(220,38,38,0.9))";

export function LiveDashboard() {
  const { campus, places, cells, connected, error, history } = useLivePlaces();
  const [topic, setTopic] = useState<CameraKind | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const demo = places.some((place) => !place.stale && place.demo);
  const visible = places.filter(
    (place) => (!topic || PLACE_TOPIC[place.kind] === topic) && (!section || place.section === section),
  );
  // The heat belongs to the crowd. The API merges it for the whole campus, so a section filter
  // leaves it whole: its cells carry no place.
  const heat = topic === null || topic === "crowd" ? cells : [];
  const selected = places.find((place) => place.id === selectedId) ?? null;
  // The wide layout always has room for a detail column, so it shows the first place until one is picked.
  const detailed = selected ?? visible[0] ?? null;

  function chooseTopic(next: CameraKind | null) {
    setTopic(next);
    setSection(null);
    if (next && selected && PLACE_TOPIC[selected.kind] !== next) setSelectedId(null);
  }

  function chooseSection(next: string | null) {
    setSection(next);
    if (next && selected && selected.section !== next) setSelectedId(null);
  }

  // On a phone the list sits below the map, where the detail opens: bring the map back into view.
  function selectFromList(id: string) {
    setSelectedId(id);
    const top = mapBox.current?.getBoundingClientRect().top;
    if (top !== undefined && (top < 0 || top > window.innerHeight / 2)) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      mapBox.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 p-4 lg:h-screen lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-accent to-brand-2 text-accent-foreground shadow-lg shadow-accent/30">
            <LogoMark className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight">
              Campus{" "}
              <span className="bg-linear-to-r from-accent to-brand-2 bg-clip-text text-transparent">
                Live
              </span>
            </h1>
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
          <span
            aria-hidden
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white"
          >
            i
          </span>
          Demo görüntüsü: kameralar kampüs kamerası değil, demo videolarıdır; sayılar tahminidir.
        </p>
      )}
      <FilterChips
        places={places}
        topic={topic}
        section={section}
        onTopic={chooseTopic}
        onSection={chooseSection}
      />
      {/* grid-cols-1, not the implicit auto column: a long place row would widen it past a phone screen. */}
      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_400px_320px]">
        {/* The summary sits over the map column only, so the place list keeps the full height. */}
        <div className="flex flex-col gap-4 lg:min-h-0">
          <SummaryStrip places={places} />
          <div
            ref={mapBox}
            className="relative h-[60vh] scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:h-auto lg:min-h-0 lg:flex-1"
          >
            <LiveMap
              campus={campus}
              places={visible}
              cells={heat}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
            <div className="pointer-events-none absolute right-3 bottom-8 z-[1000] flex flex-col gap-1.5 rounded-xl border border-line bg-surface/90 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur">
              <span className="flex items-center gap-2">
                Kalabalık
                <span className="text-muted">Az</span>
                <span className="h-2 w-24 rounded-full" style={{ backgroundImage: HEAT_RAMP }} />
                <span className="text-muted">Yoğun</span>
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {(["low", "medium", "high"] as const).map((level) => (
                  <span key={level} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: LEVEL_COLOR[level] }}
                    />
                    {LEVEL_LABEL_TR[level]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LEVEL_COLOR.stale }} />
                  Görüntü yok
                </span>
              </span>
            </div>
            {/* Narrower screens have no detail column: the detail opens over the map until closed. */}
            {selected && (
              <div className="absolute top-3 right-3 z-1000 max-h-[calc(100%-1.5rem)] w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur 2xl:hidden">
                <PlaceDetail
                  place={selected}
                  history={history[selected.id] ?? []}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        </div>
        <aside className="flex flex-col gap-4 lg:min-h-0">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm lg:min-h-0 lg:overflow-y-auto">
            <h2 className="mb-3 flex items-baseline justify-between font-semibold">
              Canlı durum
              {visible.length > 0 && (
                <span className="text-xs font-medium text-muted">{visible.length} yer</span>
              )}
            </h2>
            <PlaceList places={visible} selectedId={selected?.id ?? null} onSelect={selectFromList} />
          </section>
          <section className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm lg:min-h-[280px] lg:flex-1">
            <AssistantPanel />
          </section>
        </aside>
        <section className="hidden rounded-2xl border border-line bg-surface p-4 shadow-sm 2xl:block 2xl:min-h-0 2xl:overflow-y-auto">
          {detailed ? (
            <PlaceDetail place={detailed} history={history[detailed.id] ?? []} />
          ) : (
            <p className="text-sm text-muted">Yerler yükleniyor…</p>
          )}
        </section>
      </div>
    </main>
  );
}
