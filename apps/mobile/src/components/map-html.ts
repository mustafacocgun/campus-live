/**
 * The page the map's WebView loads: MapLibre GL JS drawing the same layers as the web map
 * (apps/web/src/components/LiveMap.tsx), keep the two in step. Expo Go has no native MapLibre, so the
 * phone draws the map the way a browser does. The app sends it GeoJSON built by @campus-live/client
 * (window.__receive) and gets back taps (ReactNativeWebView.postMessage). Never a camera: the page only
 * gets places and the merged heat (CLAUDE.md §0.2).
 *
 * MapLibre 5's UMD build carries its worker inline; the web app's version 6 needs its worker served
 * from the page's own origin, which an inline page has not got.
 */
const MAPLIBRE = "https://unpkg.com/maplibre-gl@5.6.0/dist";

const SCRIPT = String.raw`
const PITCH_3D = 50;
const GLIDE_MS = 500;
const BASE_BUILDINGS = "building";
const BASE_BUILDINGS_3D = "building-3d";
const CLICKABLE = ["lots-fill", "roads-line", "buildings-fill", "buildings-3d", "labels-dot", "labels-text"];
const EMPTY = { type: "FeatureCollection", features: [] };
const S = {
  map: null, style: null, dark: false, still: false, mode: "3d", picking: false, me: null,
  data: null, shown: [], heights: {}, fitted: false, frame: 0,
};

function post(message) {
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
}
window.onerror = function (message) {
  post({ type: "error", message: "Harita hatası: " + message });
};

function ink(dark) {
  return dark
    ? { text: "#f1f5f9", halo: "rgba(2, 6, 23, 0.85)", veil: "rgba(2, 6, 23, 0.5)", casing: "#020617" }
    : { text: "#0f172a", halo: "rgba(255, 255, 255, 0.9)", veil: "rgba(255, 255, 255, 0.45)", casing: "#ffffff" };
}

const cellKey = (cell) => cell.lat.toFixed(6) + "," + cell.lng.toFixed(6);
// @campus-live/client's lerpCells: cells that appear fade in from 0, cells that vanish fade out.
function lerpCells(from, to, t) {
  const pairs = new Map();
  for (const cell of from) pairs.set(cellKey(cell), { cell, a: cell.weight, b: 0 });
  for (const cell of to) {
    const key = cellKey(cell);
    const known = pairs.get(key);
    pairs.set(key, { cell, a: known ? known.a : 0, b: cell.weight });
  }
  const cells = [];
  for (const { cell, a, b } of pairs.values()) {
    const weight = a + (b - a) * t;
    if (weight >= 0.01) cells.push({ lat: cell.lat, lng: cell.lng, weight });
  }
  return cells;
}
function heatGeoJSON(cells) {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cell.lng, cell.lat] },
      properties: { weight: cell.weight },
    })),
  };
}

function middleOf(ring) {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}
function inside(point, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Our lit buildings take the basemap's heights, so they wrap its own instead of hiding inside it.
function buildings() {
  const data = S.data ? S.data.buildings : EMPTY;
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => {
      const height = S.heights[feature.properties.id];
      return height === undefined
        ? feature
        : { ...feature, properties: { ...feature.properties, height } };
    }),
  };
}
function updateHeights() {
  const map = S.map;
  if (!map || !S.data || S.mode !== "3d" || map.getZoom() < 14) return;
  const footprints = S.data.buildings.features.map((f) => ({ id: f.properties.id, ring: f.geometry.coordinates[0] }));
  let changed = false;
  for (const feature of map.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    const height = Number(feature.properties && feature.properties.render_height);
    if (!Number.isFinite(height) || feature.geometry.type !== "Polygon") continue;
    const middle = middleOf(feature.geometry.coordinates[0]);
    for (const { id, ring } of footprints) {
      if (!inside(middle, ring)) continue;
      const next = Math.max(S.heights[id] || 0, height + 0.5);
      if (S.heights[id] !== next) { S.heights[id] = next; changed = true; }
    }
  }
  if (changed) source("buildings", buildings());
}

function source(id, data) {
  const target = S.map && S.map.getSource(id);
  if (target) target.setData(data);
}
function meData() {
  return S.me
    ? { type: "Feature", geometry: { type: "Point", coordinates: [S.me.lng, S.me.lat] }, properties: {} }
    : EMPTY;
}

function addLayers() {
  const map = S.map;
  const colors = ink(S.dark);
  const d = S.data;
  const ground = map.getLayer(BASE_BUILDINGS) ? BASE_BUILDINGS : undefined;
  const lit = map.getLayer(BASE_BUILDINGS_3D) ? BASE_BUILDINGS_3D : undefined;
  map.addSource("mask", { type: "geojson", data: d && d.mask ? d.mask : EMPTY });
  map.addSource("lots", { type: "geojson", data: d ? d.lots : EMPTY });
  map.addSource("roads", { type: "geojson", data: d ? d.roads : EMPTY });
  map.addSource("buildings", { type: "geojson", data: buildings() });
  map.addSource("heat", { type: "geojson", data: heatGeoJSON(S.shown) });
  map.addSource("labels", { type: "geojson", data: d ? d.labels : EMPTY });
  map.addSource("selected", { type: "geojson", data: d && d.selected ? d.selected : EMPTY });
  map.addSource("me", { type: "geojson", data: meData() });

  map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": colors.veil } }, ground);
  map.addLayer({
    id: "campus-outline", type: "line", source: "mask",
    paint: { "line-color": "#6366f1", "line-width": 2, "line-opacity": 0.55, "line-dasharray": [3, 2] },
  }, ground);
  map.addLayer({
    id: "lots-fill", type: "fill", source: "lots",
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.45 },
  }, ground);
  map.addLayer({
    id: "lots-line", type: "line", source: "lots",
    paint: { "line-color": ["get", "color"], "line-width": 1.5 },
  }, ground);
  map.addLayer({
    id: "roads-casing", type: "line", source: "roads",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": colors.casing,
      "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 4.5, 18, 16],
    },
  }, ground);
  map.addLayer({
    id: "roads-line", type: "line", source: "roads",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 2.5, 18, 12],
    },
  }, ground);
  map.addLayer({
    id: "heat", type: "heatmap", source: "heat",
    paint: {
      // A weight is people per 3 m cell: 2 or more is as dense as it gets.
      "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 2, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 2],
      // Doubling per zoom level keeps each person's warmth about 25 m wide on the ground.
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 3.5, 18, 56],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(217, 70, 239, 0)",
        0.05, "rgba(217, 70, 239, 0.45)",
        0.25, "rgba(16, 185, 129, 0.6)",
        0.5, "rgba(250, 204, 21, 0.75)",
        0.75, "rgba(249, 115, 22, 0.85)",
        1, "rgba(220, 38, 38, 0.9)",
      ],
    },
  }, ground);
  map.addLayer({
    id: "selected-line", type: "line", source: "selected",
    filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "buildings-fill", type: "fill", source: "buildings",
    layout: { visibility: S.mode === "2d" ? "visible" : "none" },
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.75 },
  }, lit);
  map.addLayer({
    id: "buildings-3d", type: "fill-extrusion", source: "buildings",
    layout: { visibility: S.mode === "3d" ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
    },
  }, lit);
  map.addLayer({
    id: "labels-dot", type: "circle", source: "labels",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 7],
      "circle-stroke-color": colors.casing,
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "selected-dot", type: "circle", source: "selected",
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 11, "circle-color": "rgba(0, 0, 0, 0)", "circle-stroke-color": "#2563eb", "circle-stroke-width": 3 },
  });
  map.addLayer({
    id: "labels-text", type: "symbol", source: "labels", minzoom: 15,
    layout: {
      "text-field": [
        "format",
        ["get", "name"], { "text-font": ["literal", ["Noto Sans Bold"]] },
        "\n", {},
        ["get", "value"], { "text-font": ["literal", ["Noto Sans Regular"]], "font-scale": 0.9 },
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "top",
      "text-offset": [0, 0.8],
      "text-max-width": 12,
      "symbol-sort-key": ["match", ["get", "kind"], "parking", 0, "building", 1, "road", 2, 3],
    },
    paint: { "text-color": colors.text, "text-halo-color": colors.halo, "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "me-halo", type: "circle", source: "me",
    paint: { "circle-radius": 16, "circle-color": "#2563eb", "circle-opacity": 0.18 },
  });
  map.addLayer({
    id: "me-dot", type: "circle", source: "me",
    paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
  });
  if (lit) map.setLayoutProperty(lit, "visibility", S.mode === "3d" ? "visible" : "none");
}

function fit() {
  if (!S.map || S.fitted || !S.data || !S.data.bounds) return;
  const b = S.data.bounds;
  S.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, animate: false });
  S.fitted = true;
}

function create() {
  if (!window.maplibregl) {
    post({ type: "error", message: "Harita kütüphanesi yüklenemedi: internet bağlantısını kontrol edin." });
    return;
  }
  let map;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: S.style,
      center: [30.332, 40.742],
      zoom: 15,
      pitch: S.mode === "3d" ? PITCH_3D : 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
  } catch (error) {
    post({ type: "error", message: "Harita açılamadı: " + (error && error.message) });
    return;
  }
  S.map = map;
  let ready = false;
  map.on("error", (event) => {
    if (!ready) post({ type: "error", message: "Harita yüklenemedi: " + ((event.error && event.error.message) || "bilinmeyen hata") });
  });
  map.once("load", () => {
    ready = true;
    fit();
    post({ type: "ready" });
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  // Every style load (the first, and each theme change) starts without our layers.
  map.on("style.load", addLayers);
  map.on("click", (event) => {
    if (S.picking) {
      post({ type: "pick", lat: event.lngLat.lat, lng: event.lngLat.lng });
      return;
    }
    // A finger is wider than a cursor: anything within 12 px of the tap counts.
    const p = event.point;
    const layers = CLICKABLE.filter((id) => map.getLayer(id));
    const hit = map.queryRenderedFeatures([[p.x - 12, p.y - 12], [p.x + 12, p.y + 12]], { layers })[0];
    const id = hit && hit.properties && hit.properties.id;
    post({ type: "select", id: typeof id === "string" ? id : null });
  });
  map.on("idle", updateHeights);
}

function glide(cells) {
  const from = S.shown;
  const start = performance.now();
  cancelAnimationFrame(S.frame);
  const step = (now) => {
    const t = S.still ? 1 : Math.min(1, (now - start) / GLIDE_MS);
    S.shown = lerpCells(from, cells, t);
    source("heat", heatGeoJSON(S.shown));
    if (t < 1) S.frame = requestAnimationFrame(step);
  };
  S.frame = requestAnimationFrame(step);
}

function setMode(mode) {
  S.mode = mode;
  const map = S.map;
  if (!map || !map.getLayer("buildings-3d")) return;
  const solid = mode === "3d";
  map.setLayoutProperty("buildings-3d", "visibility", solid ? "visible" : "none");
  map.setLayoutProperty("buildings-fill", "visibility", solid ? "none" : "visible");
  if (map.getLayer(BASE_BUILDINGS_3D)) map.setLayoutProperty(BASE_BUILDINGS_3D, "visibility", solid ? "visible" : "none");
  map.easeTo({ pitch: solid ? PITCH_3D : 0, duration: S.still ? 0 : 600 });
}

function handle(message) {
  switch (message.type) {
    case "style":
      S.style = message.style;
      S.dark = message.dark;
      S.still = message.still;
      document.documentElement.dataset.theme = message.dark ? "dark" : "light";
      document.body.style.background = message.background;
      if (S.map) S.map.setStyle(message.style, { diff: false });
      else create();
      break;
    case "data":
      S.data = message;
      source("mask", message.mask || EMPTY);
      source("lots", message.lots);
      source("roads", message.roads);
      source("buildings", buildings());
      source("labels", message.labels);
      source("selected", message.selected || EMPTY);
      if (S.map && S.map.loaded()) fit();
      break;
    case "heat":
      glide(message.cells);
      break;
    case "mode":
      setMode(message.mode);
      break;
    case "picking":
      S.picking = message.on;
      break;
    case "me":
      S.me = message.me;
      source("me", meData());
      if (S.me && S.map) {
        S.map.easeTo({ center: [S.me.lng, S.me.lat], zoom: Math.max(S.map.getZoom(), 16), duration: S.still ? 0 : 600 });
      }
      break;
    case "fly":
      if (S.map) S.map.flyTo({ center: message.center, zoom: Math.max(S.map.getZoom(), 17), animate: !S.still, duration: 600 });
      break;
  }
}

window.__receive = function (message) {
  try {
    handle(message);
  } catch (error) {
    post({ type: "error", message: "Harita hatası: " + (error && error.message) });
  }
};
post({ type: "page" });
`;

export const MAP_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: #dbe6f6; font-family: system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
  .maplibregl-ctrl-group { border-radius: 12px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; }
  .maplibregl-ctrl-group button { width: 40px; height: 40px; }
  [data-theme="dark"] .maplibregl-ctrl-group { background: #222225; }
  [data-theme="dark"] .maplibregl-ctrl-group button + button { border-top-color: #303035; }
  [data-theme="dark"] .maplibregl-ctrl-attrib { background: rgba(34,34,37,0.85) !important; color: #a1a1aa !important; }
  [data-theme="dark"] .maplibregl-ctrl-attrib a { color: #a1a1aa; }
  [data-theme="dark"] .maplibregl-ctrl-icon, [data-theme="dark"] .maplibregl-ctrl-attrib-button { filter: invert(1); }
</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script>${SCRIPT}</script>
</body>
</html>`;
