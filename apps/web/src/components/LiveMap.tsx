"use client";

import {
  buildingsGeoJSON,
  campusMaskGeoJSON,
  darkStyle,
  heatGeoJSON,
  labelsGeoJSON,
  lerpCells,
  lotsGeoJSON,
  type PlaceView,
  roadsGeoJSON,
} from "@campus-live/client";
import type { CampusMap, DensityCell, LatLng } from "@campus-live/contracts";
import {
  type GeoJSONSource,
  getVersion,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

// OpenFreeMap Liberty (D24): free, no key; MapLibre adds the attribution its terms require
// (docs/data-sources.md). Dark mode is the same style darkened by darkStyle, so it keeps its colors;
// never a CSS filter, which would invert the heat colors too.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DARK = "(prefers-color-scheme: dark)";
// Each update glides in over this long, so the cloud flows instead of jumping.
const GLIDE_MS = 500;
// The basemap's flat buildings and its 3D ones: ground layers go under both, our lit buildings
// just above the flat ones.
const BASE_BUILDINGS = "building";
const BASE_BUILDINGS_3D = "building-3d";
const PITCH_3D = 50;
// Our layers a click selects a place from.
const CLICKABLE = ["lots-fill", "roads-line", "buildings-fill", "buildings-3d", "labels-dot", "labels-text"];

// Copied into public/ by scripts/copy-map-worker.mjs: bundled, MapLibre cannot find its own worker.
setWorkerUrl(`/maplibre-gl-worker.mjs?v=${getVersion()}`);

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type LngLat = [number, number];
const middleOf = (ring: LngLat[]): LngLat => [
  ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
  ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
];

function inside([x, y]: LngLat, ring: LngLat[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * How tall the basemap draws each of our buildings, from the tiles on screen: our lit building then
 * wraps the basemap's own instead of hiding inside it or towering over it.
 */
function baseHeights(map: MapLibreMap, places: PlaceView[]): Map<string, number> {
  const heights = new Map<string, number>();
  const footprints = places.flatMap((place) =>
    place.kind === "building" && place.geometry.type === "Polygon"
      ? [{ id: place.id, ring: place.geometry.coordinates[0] as LngLat[] }]
      : [],
  );
  for (const feature of map.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    const height = Number(feature.properties?.render_height);
    if (!Number.isFinite(height) || feature.geometry.type !== "Polygon") continue;
    const middle = middleOf(feature.geometry.coordinates[0] as LngLat[]);
    for (const { id, ring } of footprints) {
      if (inside(middle, ring)) heights.set(id, Math.max(heights.get(id) ?? 0, height + 0.5));
    }
  }
  return heights;
}

/** The theme's colors for our own layers. */
function ink(dark: boolean) {
  return dark
    ? { text: "#f1f5f9", halo: "rgba(2, 6, 23, 0.85)", veil: "rgba(2, 6, 23, 0.5)", casing: "#020617" }
    : {
        text: "#0f172a",
        halo: "rgba(255, 255, 255, 0.9)",
        veil: "rgba(255, 255, 255, 0.45)",
        casing: "#ffffff",
      };
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/**
 * The live campus map on OpenFreeMap Liberty, in 3D or 2D: the crowd as a heat cloud, buildings lit by
 * the crowd inside, parking lots and roads in their level's color, and every place's name and value.
 * Never a camera: the map only gets places and the merged heat (CLAUDE.md §0.2). Browser only.
 */
export default function LiveMap({
  campus,
  places,
  cells,
  selectedId,
  onSelect,
  me = null,
  picking = false,
  onPick,
}: {
  campus: CampusMap["campus"] | null;
  places: PlaceView[];
  cells: DensityCell[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The user's position, from the device or picked on the map: drawn as a dot, never sent anywhere. */
  me?: LatLng | null;
  /** While true, a tap on the map sets the user's position instead of selecting a place. */
  picking?: boolean;
  onPick?: (spot: LatLng) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // What the layers show; read again when a theme change reloads the style.
  const latest = useRef({ places, selectedId, campus });
  const heights = useRef(new Map<string, number>());
  const shown = useRef<DensityCell[]>([]);
  const select = useRef(onSelect);
  const pick = useRef({ picking, onPick });
  const meRef = useRef(me);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const modeRef = useRef(mode);
  // A map that cannot load (no WebGL, the basemap unreachable) says so instead of staying blank.
  const [problem, setProblem] = useState<string | null>(null);
  // The map arrives after its style: effects that need it run again once it has loaded.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    latest.current = { places, selectedId, campus };
    select.current = onSelect;
    pick.current = { picking, onPick };
    meRef.current = me;
  }, [places, selectedId, campus, onSelect, picking, onPick, me]);

  useEffect(() => {
    const media = window.matchMedia(DARK);
    let map: MapLibreMap | null = null;
    let cancelled = false;
    const styles: { light?: StyleSpecification; dark?: StyleSpecification } = {};
    const styleFor = (dark: boolean) => (dark ? styles.dark : styles.light)!;

    const layersFor = (target: MapLibreMap, dark: boolean) => {
      const colors = ink(dark);
      const ground = target.getLayer(BASE_BUILDINGS) ? BASE_BUILDINGS : undefined;
      const lit = target.getLayer(BASE_BUILDINGS_3D) ? BASE_BUILDINGS_3D : undefined;
      const { places: now, campus: outline } = latest.current;
      target.addSource("mask", { type: "geojson", data: outline ? campusMaskGeoJSON(outline) : EMPTY });
      target.addSource("lots", { type: "geojson", data: lotsGeoJSON(now) });
      target.addSource("roads", { type: "geojson", data: roadsGeoJSON(now) });
      target.addSource("buildings", { type: "geojson", data: buildingsGeoJSON(now, heights.current) });
      target.addSource("heat", { type: "geojson", data: heatGeoJSON(shown.current) });
      target.addSource("labels", { type: "geojson", data: labelsGeoJSON(now) });
      target.addSource("selected", { type: "geojson", data: EMPTY });

      target.addLayer(
        { id: "mask", type: "fill", source: "mask", paint: { "fill-color": colors.veil } },
        ground,
      );
      target.addLayer(
        {
          id: "campus-outline",
          type: "line",
          source: "mask",
          paint: { "line-color": "#6366f1", "line-width": 2, "line-opacity": 0.55, "line-dasharray": [3, 2] },
        },
        ground,
      );
      target.addLayer(
        {
          id: "lots-fill",
          type: "fill",
          source: "lots",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.45 },
        },
        ground,
      );
      target.addLayer(
        {
          id: "lots-line",
          type: "line",
          source: "lots",
          paint: { "line-color": ["get", "color"], "line-width": 1.5 },
        },
        ground,
      );
      target.addLayer(
        {
          id: "roads-casing",
          type: "line",
          source: "roads",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": colors.casing,
            "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 4.5, 18, 16],
          },
        },
        ground,
      );
      target.addLayer(
        {
          id: "roads-line",
          type: "line",
          source: "roads",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 2.5, 18, 12],
          },
        },
        ground,
      );
      target.addLayer(
        {
          id: "heat",
          type: "heatmap",
          source: "heat",
          paint: {
            // A weight is people per 3 m cell: 2 or more is as dense as it gets.
            "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 2, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 2],
            // Doubling per zoom level keeps each person's warmth about 25 m wide on the ground.
            "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 3.5, 18, 56],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(217, 70, 239, 0)",
              0.05,
              "rgba(217, 70, 239, 0.45)",
              0.25,
              "rgba(16, 185, 129, 0.6)",
              0.5,
              "rgba(250, 204, 21, 0.75)",
              0.75,
              "rgba(249, 115, 22, 0.85)",
              1,
              "rgba(220, 38, 38, 0.9)",
            ],
          },
        },
        ground,
      );
      target.addLayer(
        {
          id: "selected-line",
          type: "line",
          source: "selected",
          filter: ["!=", ["geometry-type"], "Point"],
          paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.9 },
        },
        // Above the buildings: a selected building's outline must show in 3D too.
        undefined,
      );
      target.addLayer(
        {
          id: "buildings-fill",
          type: "fill",
          source: "buildings",
          layout: { visibility: modeRef.current === "2d" ? "visible" : "none" },
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.75 },
        },
        lit,
      );
      target.addLayer(
        {
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "buildings",
          // At every zoom: in 3D the flat tint is hidden, so lit buildings must not vanish below 14.
          layout: { visibility: modeRef.current === "3d" ? "visible" : "none" },
          paint: {
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.9,
          },
        },
        lit,
      );
      target.addLayer({
        id: "labels-dot",
        type: "circle",
        source: "labels",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 7],
          "circle-stroke-color": colors.casing,
          "circle-stroke-width": 1.5,
        },
      });
      target.addLayer({
        id: "selected-dot",
        type: "circle",
        source: "selected",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-color": "#2563eb",
          "circle-stroke-width": 3,
        },
      });
      target.addLayer({
        id: "labels-text",
        type: "symbol",
        source: "labels",
        minzoom: 15,
        layout: {
          "text-field": [
            "format",
            ["get", "name"],
            { "text-font": ["literal", ["Noto Sans Bold"]] },
            "\n",
            {},
            ["get", "value"],
            { "text-font": ["literal", ["Noto Sans Regular"]], "font-scale": 0.9 },
          ],
          // Also the font of the line break between the two parts.
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-max-width": 12,
          // Lots and buildings first when labels collide; areas show their heat anyway.
          "symbol-sort-key": ["match", ["get", "kind"], "parking", 0, "building", 1, "road", 2, 3],
        },
        paint: { "text-color": colors.text, "text-halo-color": colors.halo, "text-halo-width": 1.5 },
      });
      const spot = meRef.current;
      target.addSource("me", {
        type: "geojson",
        data: spot
          ? {
              type: "Feature",
              geometry: { type: "Point", coordinates: [spot.lng, spot.lat] },
              properties: {},
            }
          : EMPTY,
      });
      target.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 16, "circle-color": "#2563eb", "circle-opacity": 0.18 },
      });
      target.addLayer({
        id: "me-dot",
        type: "circle",
        source: "me",
        paint: {
          "circle-radius": 7,
          "circle-color": "#2563eb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
      // The base map's own 3D buildings follow the mode too.
      if (lit) target.setLayoutProperty(lit, "visibility", modeRef.current === "3d" ? "visible" : "none");
    };

    fetch(STYLE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then((light) => {
        if (cancelled) return;
        styles.light = light;
        styles.dark = darkStyle(
          light as unknown as { layers: { paint?: object }[] },
        ) as unknown as StyleSpecification;
        const still = reducedMotion();
        // Reduced motion starts flat and never animates the tilt.
        if (still) {
          modeRef.current = "2d";
          setMode("2d");
        }
        try {
          map = new MapLibreMap({
            container: container.current!,
            style: styleFor(media.matches),
            center: [30.332, 40.742],
            zoom: 15,
            pitch: still ? 0 : PITCH_3D,
            maxPitch: 70,
            attributionControl: { compact: true },
          });
        } catch (error) {
          // MapLibre throws here without WebGL.
          setProblem(`Harita açılamadı: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const created = map;
        // Until the basemap has loaded once, an error means there is no map; a missing tile later is
        // harmless. (map.loaded() is no guide: it is false whenever tiles load or the heat updates.)
        let ready = false;
        created.on("error", (event) => {
          if (!ready) setProblem(`Harita yüklenemedi: ${event.error?.message ?? "bilinmeyen hata"}`);
        });
        created.once("load", () => {
          ready = true;
          setProblem(null);
          setLoaded(true);
        });
        created.addControl(new NavigationControl({ visualizePitch: true }), "top-left");
        // Every style load (the first, and each theme change) starts without our layers.
        created.on("style.load", () => layersFor(created, media.matches));
        created.on("click", CLICKABLE, (event) => {
          if (pick.current.picking) return;
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") select.current(id);
        });
        // While picking, a tap anywhere is the user's position.
        created.on("click", (event) => {
          if (pick.current.picking) pick.current.onPick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        });
        const cursor = (over: boolean) =>
          (created.getCanvas().style.cursor = pick.current.picking ? "crosshair" : over ? "pointer" : "");
        created.on("mouseenter", CLICKABLE, () => cursor(true));
        created.on("mouseleave", CLICKABLE, () => cursor(false));
        // Once tiles are on screen, lit buildings take the basemap's heights.
        created.on("idle", () => {
          if (modeRef.current !== "3d" || created.getZoom() < 14) return;
          const next = baseHeights(created, latest.current.places);
          const known = heights.current;
          if ([...next].every(([id, height]) => known.get(id) === height)) return;
          heights.current = new Map([...known, ...next]);
          (created.getSource("buildings") as GeoJSONSource | undefined)?.setData(
            buildingsGeoJSON(latest.current.places, heights.current),
          );
        });
        mapRef.current = created;
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setProblem(`Harita yüklenemedi: ${error instanceof Error ? error.message : String(error)}`);
      });

    const followTheme = () => map?.setStyle(styleFor(media.matches), { diff: false });
    media.addEventListener("change", followTheme);
    return () => {
      cancelled = true;
      media.removeEventListener("change", followTheme);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Places take their new colors and values with every snapshot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("lots") as GeoJSONSource | undefined)?.setData(lotsGeoJSON(places));
    (map.getSource("roads") as GeoJSONSource | undefined)?.setData(roadsGeoJSON(places));
    (map.getSource("buildings") as GeoJSONSource | undefined)?.setData(
      buildingsGeoJSON(places, heights.current),
    );
    (map.getSource("labels") as GeoJSONSource | undefined)?.setData(labelsGeoJSON(places));
    const chosen = places.find((place) => place.id === selectedId);
    (map.getSource("selected") as GeoJSONSource | undefined)?.setData(
      chosen ? { type: "Feature", geometry: chosen.geometry, properties: {} } : EMPTY,
    );
  }, [places, selectedId, loaded]);

  // Once the outline arrives the veil follows it, and the view fits the places: the campus outline
  // also takes in fields and woods far from any place.
  const outlineKey = campus?.geometry.type === "Polygon" ? JSON.stringify(campus.geometry.coordinates) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !campus || campus.geometry.type !== "Polygon") return;
    (map.getSource("mask") as GeoJSONSource | undefined)?.setData(campusMaskGeoJSON(campus));
    const bounds = new LngLatBounds();
    const points = latest.current.places.flatMap((place) => [place.geometry.coordinates].flat(3));
    for (let i = 0; i + 1 < points.length; i += 2) bounds.extend([points[i], points[i + 1]] as LngLat);
    if (bounds.isEmpty()) for (const point of campus.geometry.coordinates[0]) bounds.extend(point as LngLat);
    map.fitBounds(bounds, { padding: 40, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the outline itself changes
  }, [outlineKey, loaded]);

  // The user's dot follows their position, and the view goes to it when it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("me") as GeoJSONSource | undefined)?.setData(
      me
        ? { type: "Feature", geometry: { type: "Point", coordinates: [me.lng, me.lat] }, properties: {} }
        : EMPTY,
    );
    if (me)
      map.easeTo({
        center: [me.lng, me.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: reducedMotion() ? 0 : 600,
      });
  }, [me, loaded]);

  // While picking, the cursor says so.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking, loaded]);

  // Brings the selected place into view when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const place = latest.current.places.find((p) => p.id === selectedId);
    if (!map || !place) return;
    const [label] = labelsGeoJSON([place]).features;
    map.flyTo({
      center: label.geometry.coordinates,
      zoom: Math.max(map.getZoom(), 17),
      animate: !reducedMotion(),
      duration: 600,
    });
  }, [selectedId]);

  // The 2D/3D switch: tilts the view and swaps flat and extruded buildings.
  useEffect(() => {
    modeRef.current = mode;
    const map = mapRef.current;
    if (!map?.getLayer("buildings-3d")) return;
    const solid = mode === "3d";
    map.setLayoutProperty("buildings-3d", "visibility", solid ? "visible" : "none");
    map.setLayoutProperty("buildings-fill", "visibility", solid ? "none" : "visible");
    if (map.getLayer(BASE_BUILDINGS_3D)) {
      map.setLayoutProperty(BASE_BUILDINGS_3D, "visibility", solid ? "visible" : "none");
    }
    map.easeTo({ pitch: solid ? PITCH_3D : 0, duration: reducedMotion() ? 0 : 600 });
  }, [mode, loaded]);

  // The heat glides from what is on screen now (even mid-glide) to the new cells.
  useEffect(() => {
    const from = shown.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      shown.current = lerpCells(from, cells, t);
      (mapRef.current?.getSource("heat") as GeoJSONSource | undefined)?.setData(heatGeoJSON(shown.current));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cells]);

  return (
    <>
      {/* MapLibre makes its container position: relative, so the container fills a positioned wrapper. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {picking && (
        <p className="pointer-events-none absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground shadow-lg">
          Konumunu seçmek için haritada bir yere dokun
        </p>
      )}
      <div
        role="group"
        aria-label="Harita görünümü"
        className="absolute bottom-8 left-3 z-[1000] flex overflow-hidden rounded-xl border border-line bg-surface/90 text-xs font-semibold shadow-sm backdrop-blur"
      >
        {(["3d", "2d"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={`px-3 py-1.5 transition ${mode === option ? "bg-accent text-accent-foreground" : "hover:bg-surface-2"}`}
          >
            {option === "3d" ? "3B" : "2B"}
          </button>
        ))}
      </div>
      {problem && (
        <p className="absolute inset-x-3 top-3 z-[1000] rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
    </>
  );
}
