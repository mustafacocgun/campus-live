"use client";

import { LEVEL_COLOR, LEVEL_LABEL_TR, PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind, Level } from "@campus-live/contracts";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useLivePlaces } from "@/lib/use-live-places";
import type { MyLocation } from "@/lib/my-location";
import { AccountBar } from "./AccountBar";
import { AssistantPanel } from "./AssistantPanel";
import { FilterChips } from "./FilterChips";
import { CampusIcon, InfoIcon, SearchIcon, ShieldIcon } from "./icons";
import { PlaceDetail } from "./PlaceDetail";
import { PlaceList } from "./PlaceList";
import { SummaryStrip } from "./SummaryStrip";
import { ThemeToggle } from "./ThemeToggle";

// MapLibre draws with the browser's WebGL, so the map is never rendered on the server.
const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

// The heat layer's ramp (LiveMap's heatmap-color), as a CSS gradient for the legend.
const HEAT_RAMP =
  "linear-gradient(to right, rgba(37,99,235,0.45), rgba(16,185,129,0.6), rgba(250,204,21,0.75), rgba(249,115,22,0.85), rgba(220,38,38,0.9))";

const LEVEL_ORDER: Level[] = ["low", "medium", "high"];
type Sort = "level" | "name";

/** Busiest first: places with fresh data before silent ones, then by level, then by count. */
function byLevel(a: PlaceView, b: PlaceView): number {
  const rank = (place: PlaceView) => (place.stale || !place.level ? -1 : LEVEL_ORDER.indexOf(place.level));
  return rank(b) - rank(a) || (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name, "tr");
}

export function LiveDashboard() {
  const { campus, places, cells, connected, error, history } = useLivePlaces();
  const [topic, setTopic] = useState<CameraKind | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("level");
  // The user's position, for "the nearest…" questions: kept in this page only.
  const [me, setMe] = useState<MyLocation | null>(null);
  const [picking, setPicking] = useState(false);
  // The assistant can take the whole side panel; the place list then folds into one bar.
  const [aiWide, setAiWide] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const demo = places.some((place) => !place.stale && place.demo);
  const visible = places.filter(
    (place) => (!topic || PLACE_TOPIC[place.kind] === topic) && (!section || place.section === section),
  );
  // The search narrows the list only; the map keeps showing the topic and section.
  const needle = query.trim().toLocaleLowerCase("tr");
  const listed = visible
    .filter(
      (place) =>
        !needle ||
        place.name.toLocaleLowerCase("tr").includes(needle) ||
        place.section.toLocaleLowerCase("tr").includes(needle),
    )
    .sort(sort === "level" ? byLevel : (a, b) => a.name.localeCompare(b.name, "tr"));
  const live = places.filter((place) => !place.stale).length;
  // The heat belongs to the crowd. The API merges it for the whole campus, so a section filter
  // leaves it whole: its cells carry no place.
  const heat = topic === null || topic === "crowd" ? cells : [];
  const selected = places.find((place) => place.id === selectedId) ?? null;

  function chooseTopic(next: CameraKind | null) {
    setTopic(next);
    setSection(null);
    if (next && selected && PLACE_TOPIC[selected.kind] !== next) setSelectedId(null);
  }

  function chooseSection(next: string | null) {
    setSection(next);
    if (next && selected && selected.section !== next) setSelectedId(null);
  }

  // A place picked on the map, in the list or in an answer: its detail opens at the top of the side
  // panel. On a phone the panel sits below the map, so it is brought into view.
  function select(id: string | null) {
    setSelectedId(id);
    if (!id) return;
    const top = panel.current?.getBoundingClientRect().top;
    if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6)) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  }

  // A place an answer points at: shown whatever the filters, on the map and in the detail.
  function showPlace(id: string) {
    setTopic(null);
    setSection(null);
    // Its detail needs the room: the assistant goes back to its usual size.
    setAiWide(false);
    select(id);
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="chrome sticky top-0 z-[1100] flex h-14 shrink-0 items-center gap-3 px-3 shadow-card sm:px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
            <CampusIcon className="h-4.5 w-4.5" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-accent-text">Campus Live</span>
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
        <span
          className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:flex ${
            connected ? "bg-surface-2 text-foreground ring-line" : "bg-surface-2 text-muted ring-line"
          }`}
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:hidden" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`}
            />
          </span>
          {connected ? "Canlı bağlantı" : "Bağlantı yok"}
        </span>
        {demo && (
          <span className="hidden min-w-0 items-center gap-1.5 text-xs text-muted md:flex">
            <InfoIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Demo görüntüsü: kameralar kampüs kamerası değil, demo videolarıdır; sayılar tahminidir.
            </span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <AccountBar />
        </div>
      </header>
      {demo && (
        <p className="flex items-start gap-1.5 border-b border-line bg-panel px-3 py-2 text-xs text-muted md:hidden">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          Demo görüntüsü: kameralar kampüs kamerası değil, demo videolarıdır; sayılar tahminidir.
        </p>
      )}
      {error && (
        <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {/* grid-cols-1, not the implicit auto column: a long place row would widen it past a phone screen. */}
      <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_460px] 2xl:grid-cols-[minmax(0,1fr)_540px]">
        {/* The map fills the whole left side, edge to edge and full height: only its size changed. */}
        <div className="relative h-[60vh] min-h-80 lg:h-auto lg:min-h-0">
          <LiveMap
            campus={campus}
            places={visible}
            cells={heat}
            selectedId={selected?.id ?? null}
            onSelect={select}
            me={me}
            picking={picking}
            onPick={(spot) => {
              setMe({ ...spot, source: "map" });
              setPicking(false);
            }}
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
        </div>

        <aside ref={panel} className="flex scroll-mt-14 flex-col border-line bg-panel lg:min-h-0 lg:border-l">
          <div className="border-b border-line p-3">
            <SummaryStrip places={places} />
          </div>

          {/* The places: the list, or one place's detail. On a wide screen they share the height with the
              assistant, which gets the larger part, and scroll on their own. With the assistant widened
              they fold into one bar that brings them back. */}
          {aiWide && (
            <button
              type="button"
              onClick={() => setAiWide(false)}
              className="hidden items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold transition hover:bg-surface lg:flex"
            >
              <span>
                Yerler <span className="font-medium text-muted">({listed.length})</span>
              </span>
              <span className="text-xs font-semibold text-accent-text">Listeyi göster</span>
            </button>
          )}
          <section
            aria-label="Yerler"
            className={`flex flex-col lg:min-h-0 lg:flex-[3] ${aiWide ? "lg:hidden" : ""}`}
          >
            {selected ? (
              <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                <PlaceDetail
                  place={selected}
                  places={places}
                  history={history[selected.id] ?? []}
                  onBack={() => setSelectedId(null)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-3 px-4 pt-4">
                  <label className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-card ring-1 ring-line focus-within:ring-2 focus-within:ring-accent/40">
                    <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Kampüste yer veya bina ara…"
                      aria-label="Yer ara"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                    />
                  </label>
                  <FilterChips
                    places={places}
                    topic={topic}
                    section={section}
                    onTopic={chooseTopic}
                    onSection={chooseSection}
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                      Canlı durum ({listed.length} yer)
                    </h2>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      Sıralama:
                      <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value as Sort)}
                        className="cursor-pointer bg-transparent font-semibold text-foreground outline-none"
                      >
                        <option value="level">Yoğunluk</option>
                        <option value="name">Ad</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-2 pt-2 pb-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                  <PlaceList places={listed} selectedId={null} onSelect={select} />
                </div>
              </>
            )}
          </section>

          {/* The campus assistant, always in view and the larger part of the side panel. */}
          <section
            aria-label="Kampüs asistanı"
            className={`flex h-[600px] flex-col border-t border-line p-3 lg:h-auto lg:min-h-[320px] ${
              aiWide ? "lg:flex-1" : "lg:flex-[2]"
            }`}
          >
            <AssistantPanel
              me={me}
              picking={picking}
              onLocate={(next) => {
                setMe(next);
                setPicking(false);
              }}
              onPicking={setPicking}
              onShowPlace={showPlace}
              expanded={aiWide}
              onToggleExpand={() => setAiWide((wide) => !wide)}
            />
          </section>

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <ShieldIcon className="h-3.5 w-3.5" />
              Görüntü saklanmaz, yalnızca sayılar
            </span>
            <span className="tabular-nums">
              {live}/{places.length} yer canlı
            </span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
