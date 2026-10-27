"use client";

import { conesGeoJSON, heatGeoJSON, LEVEL_COLOR, lerpCells } from "@campus-live/client";
import type { DensityCell, LiveCamera } from "@campus-live/contracts";
import {
  type GeoJSONSource,
  getVersion,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { inkOn } from "@/lib/ink";
import { iconPathFor } from "./icons";

// OpenFreeMap: free, no key; MapLibre adds the attribution its terms require (docs/data-sources.md).
// A real dark style, never a CSS filter: inverting the map would invert the heat colors too.
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const DARK = "(prefers-color-scheme: dark)";
// Each update glides in over this long, so the cloud flows instead of jumping.
const GLIDE_MS = 500;
// Zoomed out further, pins shrink and names hide (globals.css, .map-far) so the heat stays visible.
const NEAR_ZOOM = 16.5;
const PIN_SHAPE = "M20 50C20 50 4 33.5 4 20a16 16 0 0 1 32 0c0 13.5-16 30-16 30z";

// Copied into public/ by scripts/copy-map-worker.mjs: bundled, MapLibre cannot find its own worker.
setWorkerUrl(`/maplibre-gl-worker.mjs?v=${getVersion()}`);

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A teardrop in the level color with the camera's icon; busy pins ripple where they touch the map. */
function pinHtml(camera: LiveCamera, selected: boolean): string {
  const reading = camera.stale ? null : camera.reading;
  const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
  const busy = reading?.level === "high";
  const classes = ["camera-pin", busy && "camera-pin--busy", selected && "camera-pin--selected"];
  return (
    `<div class="${classes.filter(Boolean).join(" ")}" style="--pin:${color};--ink:${inkOn(color)}">` +
    (busy ? `<span class="camera-pin__ripple"></span>` : "") +
    `<svg class="camera-pin__shape" viewBox="0 0 40 52"><path d="${PIN_SHAPE}"/></svg>` +
    `<svg class="camera-pin__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="${iconPathFor(camera)}"/></svg></div>`
  );
}

interface Pin {
  marker: Marker;
  shape: HTMLDivElement;
  html: string;
}

/**
 * The live campus map: the crowd as a heat cloud, each camera's view cone, and a pin per camera in its
 * level's color (grey without a fresh reading). Browser only: MapLibre draws with WebGL.
 */
export default function LiveMap({
  cameras,
  cells,
  selectedId,
  onSelect,
}: {
  cameras: LiveCamera[];
  cells: DensityCell[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, Pin>());
  // What the layers show; read again when a theme change reloads the style.
  const latest = useRef(cameras);
  const shown = useRef<DensityCell[]>([]);
  const select = useRef(onSelect);
  // A map that cannot load (no WebGL, the basemap unreachable) says so instead of staying blank.
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    latest.current = cameras;
    select.current = onSelect;
  }, [cameras, onSelect]);

  useEffect(() => {
    const media = window.matchMedia(DARK);
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current!,
        style: media.matches ? STYLE.dark : STYLE.light,
        center: [30.332, 40.742],
        zoom: 15,
        attributionControl: { compact: true },
      });
    } catch (error) {
      // MapLibre throws here without WebGL. Reported after the effect: an effect must not set state.
      const reason = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => setProblem(`Harita açılamadı: ${reason}`));
      return;
    }
    // Until the basemap has loaded, an error means there is no map (a missing tile later is harmless).
    map.on("error", (event) => {
      if (!map.loaded()) setProblem(`Harita yüklenemedi: ${event.error?.message ?? "bilinmeyen hata"}`);
    });
    map.on("load", () => setProblem(null));
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    const markZoom = () => map.getContainer().classList.toggle("map-far", map.getZoom() < NEAR_ZOOM);
    map.on("zoom", markZoom);
    markZoom();

    // Every style load (the first, and each theme change) starts without our layers.
    map.on("style.load", () => {
      map.addSource("cones", { type: "geojson", data: conesGeoJSON(latest.current) });
      map.addSource("heat", { type: "geojson", data: heatGeoJSON(shown.current) });
      map.addLayer({
        id: "cones-fill",
        type: "fill",
        source: "cones",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "cones-line",
        type: "line",
        source: "cones",
        paint: { "line-color": ["get", "color"], "line-opacity": 0.45, "line-width": 1 },
      });
      map.addLayer({
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
            "rgba(37, 99, 235, 0)",
            0.05,
            "rgba(37, 99, 235, 0.45)",
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
      });
    });

    const followTheme = () => map.setStyle(media.matches ? STYLE.dark : STYLE.light);
    media.addEventListener("change", followTheme);
    mapRef.current = map;
    const placed = pins.current;
    return () => {
      media.removeEventListener("change", followTheme);
      placed.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pins and cones follow every update; a pin is redrawn only when its look changes, so the ripple
  // of a busy camera keeps running.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("cones") as GeoJSONSource | undefined)?.setData(conesGeoJSON(cameras));
    const placed = pins.current;
    for (const [id, pin] of placed) {
      if (!cameras.some((camera) => camera.id === id)) {
        pin.marker.remove();
        placed.delete(id);
      }
    }
    for (const camera of cameras) {
      const selected = camera.id === selectedId;
      const html = pinHtml(camera, selected);
      let pin = placed.get(camera.id);
      if (!pin) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "camera-marker";
        element.title = camera.name;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          select.current(camera.id);
        });
        const shape = document.createElement("div");
        const label = document.createElement("span");
        label.className = "camera-label";
        label.textContent = camera.name;
        element.append(shape, label);
        const marker = new Marker({ element, anchor: "bottom" })
          .setLngLat([camera.longitude, camera.latitude])
          .addTo(map);
        pin = { marker, shape, html: "" };
        placed.set(camera.id, pin);
      }
      if (pin.html !== html) {
        pin.shape.innerHTML = html;
        pin.html = html;
      }
      pin.marker.getElement().style.zIndex = selected ? "2" : "1";
    }
  }, [cameras, selectedId]);

  // Refit when the set of shown cameras changes (the first list, a filter), not on every reading.
  const positions = cameras.map((camera) => `${camera.longitude},${camera.latitude}`).join(";");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !positions) return;
    const bounds = new LngLatBounds();
    for (const position of positions.split(";")) {
      const [lng, lat] = position.split(",").map(Number);
      bounds.extend([lng, lat]);
    }
    map.fitBounds(bounds, { padding: 64, maxZoom: 17, animate: !reducedMotion() });
  }, [positions]);

  // Brings the selected camera into view when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const camera = latest.current.find((c) => c.id === selectedId);
    if (!map || !camera) return;
    map.flyTo({
      center: [camera.longitude, camera.latitude],
      zoom: Math.max(map.getZoom(), 17),
      animate: !reducedMotion(),
      duration: 600,
    });
  }, [selectedId]);

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
      {problem && (
        <p className="absolute inset-x-3 top-3 z-[1000] rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
    </>
  );
}
