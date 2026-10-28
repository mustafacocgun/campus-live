import {
  apiUrlProblem,
  buildingsGeoJSON,
  campusMaskGeoJSON,
  heatGeoJSON,
  labelsGeoJSON,
  LEVEL_COLOR,
  LEVEL_LABEL_TR,
  lotsGeoJSON,
  placeValueText,
  type PlaceView,
  roadsGeoJSON,
} from "@campus-live/client";
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapView,
} from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLivePlaces } from "@/hooks/use-live-places";
import { useMapStyle } from "@/hooks/use-map-style";
import { useSharedLocation } from "@/hooks/use-shared-location";

// The web map's layers (apps/web/src/components/LiveMap.tsx): keep the two in step.
// The heat ramp, low to high, also drawn as the legend's steps.
const RAMP = [
  "rgba(37, 99, 235, 0.45)",
  "rgba(16, 185, 129, 0.6)",
  "rgba(250, 204, 21, 0.75)",
  "rgba(249, 115, 22, 0.85)",
  "rgba(220, 38, 38, 0.9)",
];
// Ground layers go under the basemap's buildings, so 3D buildings stand on top of them.
const GROUND = "building";
const PITCH_3D = 50;

/** The bounding box of every place: where the map opens. */
function boundsOf(places: PlaceView[]): [number, number, number, number] {
  const points = places.flatMap((place) => [place.geometry.coordinates].flat(3));
  const longitudes = points.filter((_, i) => i % 2 === 0);
  const latitudes = points.filter((_, i) => i % 2 === 1);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

/**
 * The live campus map: the crowd as a heat cloud, buildings lit by the crowd inside, parking lots and
 * roads in their level's color, and each place's name and value, in 3D or flat. Never a camera: the app
 * only gets places and the merged heat (CLAUDE.md §0.2). MapLibre is native: it needs a development build.
 */
export default function MapScreen() {
  const { campus, places, cells, connected, error } = useLivePlaces();
  const { me, setMe, picking, setPicking, focusId, setFocusId } = useSharedLocation();
  const camera = useRef<CameraRef>(null);
  const dark = useColorScheme() === "dark";
  const mapStyle = useMapStyle(dark);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [still, setStill] = useState(false);
  // Reduced motion starts flat and never animates the tilt.
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      setStill(reduce);
      if (reduce) setMode("2d");
    });
  }, []);
  // The view goes to the user's new position.
  useEffect(() => {
    if (me) camera.current?.flyTo({ center: [me.lng, me.lat], zoom: 16, duration: still ? 0 : 800 });
  }, [me, still]);
  // A chip in the Asistan tab: the view goes to that place, and a card names it.
  const focused = places.find((place) => place.id === focusId) ?? null;
  const focusedPoint = focused ? labelsGeoJSON([focused]).features[0].geometry.coordinates : null;
  useEffect(() => {
    if (focusedPoint) camera.current?.flyTo({ center: focusedPoint, zoom: 17, duration: still ? 0 : 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly once per chip, not on every snapshot
  }, [focusId, focused !== null, still]);
  const problem = apiUrlProblem(API_URL, Platform.OS);
  const demo = places.some((place) => !place.stale && place.demo);
  const ink = dark
    ? { text: "#f1f5f9", halo: "rgba(2, 6, 23, 0.85)", veil: "rgba(2, 6, 23, 0.5)", casing: "#020617" }
    : {
        text: "#0f172a",
        halo: "rgba(255, 255, 255, 0.9)",
        veil: "rgba(255, 255, 255, 0.45)",
        casing: "#ffffff",
      };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Campus Live</Text>
        <Text style={styles.status}>{connected ? "● Canlı bağlantı" : "○ Bağlantı yok"}</Text>
      </View>
      {problem && <Text style={[styles.banner, styles.error]}>{problem}</Text>}
      {!problem && error && <Text style={[styles.banner, styles.error]}>{error}</Text>}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Text style={styles.legendText}>Az</Text>
          {RAMP.map((color) => (
            <View key={color} style={[styles.rampStep, { backgroundColor: color }]} />
          ))}
          <Text style={styles.legendText}>Yoğun</Text>
        </View>
        {(["low", "medium", "high"] as const).map((level) => (
          <View key={level} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR[level] }]} />
            <Text style={styles.legendText}>{LEVEL_LABEL_TR[level]}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.stale }]} />
          <Text style={styles.legendText}>Görüntü yok</Text>
        </View>
      </View>
      {demo && (
        <Text style={styles.banner}>
          Demo görüntüsü: kameralar kampüs kamerası değil, demo videolarıdır; sayılar tahminidir.
        </Text>
      )}
      {places.length && mapStyle ? (
        <View style={styles.map}>
          <MapView
            style={styles.map}
            mapStyle={mapStyle}
            logo={false}
            compass={false}
            onPress={(event) => {
              // While picking, a tap anywhere is the user's position.
              if (!picking) return;
              const [lng, lat] = event.nativeEvent.lngLat;
              setMe({ lat, lng, source: "map" });
              setPicking(false);
            }}
          >
            <Camera
              ref={camera}
              initialViewState={{
                bounds: boundsOf(places),
                padding: { top: 40, right: 40, bottom: 40, left: 40 },
              }}
              pitch={mode === "3d" ? PITCH_3D : 0}
              duration={still ? 0 : 600}
              maxZoom={19}
            />
            {campus && (
              <GeoJSONSource id="mask" data={campusMaskGeoJSON(campus)}>
                <Layer id="mask" type="fill" beforeId={GROUND} paint={{ "fill-color": ink.veil }} />
              </GeoJSONSource>
            )}
            <GeoJSONSource id="lots" data={lotsGeoJSON(places)}>
              <Layer
                id="lots-fill"
                type="fill"
                beforeId={GROUND}
                paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.45 }}
              />
              <Layer
                id="lots-line"
                type="line"
                beforeId={GROUND}
                paint={{ "line-color": ["get", "color"], "line-width": 1.5 }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="roads" data={roadsGeoJSON(places)}>
              <Layer
                id="roads-casing"
                type="line"
                beforeId={GROUND}
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": ink.casing,
                  "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 4.5, 18, 16],
                }}
              />
              <Layer
                id="roads-line"
                type="line"
                beforeId={GROUND}
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 2.5, 18, 12],
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="heat" data={heatGeoJSON(cells)}>
              <Layer
                id="heat"
                type="heatmap"
                beforeId={GROUND}
                paint={{
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
                    RAMP[0],
                    0.25,
                    RAMP[1],
                    0.5,
                    RAMP[2],
                    0.75,
                    RAMP[3],
                    1,
                    RAMP[4],
                  ],
                }}
              />
            </GeoJSONSource>
            {/* Extruded at every pitch: seen from straight above it is a flat tint. */}
            <GeoJSONSource id="buildings" data={buildingsGeoJSON(places)}>
              <Layer
                id="buildings-3d"
                type="fill-extrusion"
                paint={{
                  "fill-extrusion-color": ["get", "color"],
                  "fill-extrusion-height": ["get", "height"],
                  "fill-extrusion-base": 0,
                  "fill-extrusion-opacity": 0.9,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="labels" data={labelsGeoJSON(places)}>
              <Layer
                id="labels-dot"
                type="circle"
                paint={{
                  "circle-color": ["get", "color"],
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 7],
                  "circle-stroke-color": ink.casing,
                  "circle-stroke-width": 1.5,
                }}
              />
              <Layer
                id="labels-text"
                type="symbol"
                minzoom={15}
                layout={{
                  "text-field": [
                    "format",
                    ["get", "name"],
                    { "text-font": ["literal", ["Noto Sans Bold"]] },
                    "\n",
                    {},
                    ["get", "value"],
                    { "text-font": ["literal", ["Noto Sans Regular"]], "font-scale": 0.9 },
                  ],
                  "text-font": ["Noto Sans Regular"],
                  "text-size": 12,
                  "text-anchor": "top",
                  "text-offset": [0, 0.8],
                  "text-max-width": 12,
                  "symbol-sort-key": ["match", ["get", "kind"], "parking", 0, "building", 1, "road", 2, 3],
                }}
                paint={{ "text-color": ink.text, "text-halo-color": ink.halo, "text-halo-width": 1.5 }}
              />
            </GeoJSONSource>
            {/* The user's dot, on top of everything: drawn here, never sent beyond our API. */}
            <GeoJSONSource
              id="me"
              data={
                me
                  ? {
                      type: "Feature",
                      geometry: { type: "Point", coordinates: [me.lng, me.lat] },
                      properties: {},
                    }
                  : { type: "FeatureCollection", features: [] }
              }
            >
              <Layer
                id="me-halo"
                type="circle"
                paint={{ "circle-radius": 16, "circle-color": "#2563eb", "circle-opacity": 0.18 }}
              />
              <Layer
                id="me-dot"
                type="circle"
                paint={{
                  "circle-radius": 7,
                  "circle-color": "#2563eb",
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 2.5,
                }}
              />
            </GeoJSONSource>
          </MapView>
          {picking && (
            <View style={styles.pickBanner}>
              <Text style={styles.pickBannerText}>Konumunu seçmek için haritaya dokun</Text>
              <Pressable onPress={() => setPicking(false)} accessibilityRole="button">
                <Text style={styles.pickBannerCancel}>Vazgeç</Text>
              </Pressable>
            </View>
          )}
          {focused && (
            <View style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {focused.name}
                </Text>
                <Text style={styles.cardValue}>
                  {placeValueText(focused)}
                  {!focused.stale && focused.demo ? " · demo verisi" : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setFocusId(null)}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <Text style={styles.cardClose}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Harita görünümü">
            {(["3d", "2d"] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === option }}
                onPress={() => setMode(option)}
                style={[styles.mode, mode === option && styles.modeOn]}
              >
                <Text style={[styles.modeText, mode === option && styles.modeTextOn]}>
                  {option === "3d" ? "3B" : "2B"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.empty}>{problem ? "" : "Harita yükleniyor…"}</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pickBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#1d4ed8",
  },
  pickBannerText: { color: "#ffffff", fontWeight: "600", flexShrink: 1 },
  pickBannerCancel: { color: "#ffffff", textDecorationLine: "underline" },
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
  },
  cardText: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  cardValue: { fontSize: 13, color: "#334155" },
  cardClose: { fontSize: 18, color: "#334155", paddingHorizontal: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  status: { fontSize: 13 },
  banner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fffbeb",
    color: "#78350f",
  },
  error: { backgroundColor: "#fef2f2", color: "#b91c1c" },
  map: { flex: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 12, paddingBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  rampStep: { width: 12, height: 8 },
  legendText: { fontSize: 13 },
  empty: { padding: 24, textAlign: "center", color: "#6b7280" },
  modes: {
    position: "absolute",
    left: 12,
    bottom: 24,
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  mode: { paddingHorizontal: 12, paddingVertical: 6 },
  modeOn: { backgroundColor: "#2563eb" },
  modeText: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  modeTextOn: { color: "#ffffff" },
});
