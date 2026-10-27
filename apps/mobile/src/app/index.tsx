import {
  apiUrlProblem,
  camerasGeoJSON,
  conesGeoJSON,
  heatGeoJSON,
  isDemo,
  LEVEL_COLOR,
  LEVEL_LABEL_TR,
} from "@campus-live/client";
import { Camera, GeoJSONSource, Layer, Map as MapView } from "@maplibre/maplibre-react-native";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLiveCameras } from "@/hooks/use-live-cameras";

// The web map's basemap and layers (apps/web/src/components/LiveMap.tsx): keep the two in step.
// OpenFreeMap: free, no key; MapLibre shows the attribution its terms require.
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// The heat ramp, low to high, also drawn as the legend's steps.
const RAMP = [
  "rgba(37, 99, 235, 0.45)",
  "rgba(16, 185, 129, 0.6)",
  "rgba(250, 204, 21, 0.75)",
  "rgba(249, 115, 22, 0.85)",
  "rgba(220, 38, 38, 0.9)",
];

/**
 * The live campus map: the crowd as a heat cloud, each camera's view cone, and a dot per camera in its
 * level's color (grey without a fresh reading). MapLibre is native: it needs a development build.
 */
export default function MapScreen() {
  const { cameras, cells, connected, error } = useLiveCameras();
  const dark = useColorScheme() === "dark";
  const problem = apiUrlProblem(API_URL, Platform.OS);
  const demo = cameras.some((camera) => camera.reading && isDemo(camera.reading));
  const longitudes = cameras.map((camera) => camera.longitude);
  const latitudes = cameras.map((camera) => camera.latitude);

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
      {cameras.length ? (
        <MapView style={styles.map} mapStyle={dark ? STYLE.dark : STYLE.light} logo={false} compass={false}>
          <Camera
            initialViewState={{
              bounds: [
                Math.min(...longitudes),
                Math.min(...latitudes),
                Math.max(...longitudes),
                Math.max(...latitudes),
              ],
              padding: { top: 48, right: 48, bottom: 48, left: 48 },
            }}
            maxZoom={19}
          />
          <GeoJSONSource id="cones" data={conesGeoJSON(cameras)}>
            <Layer
              id="cones-fill"
              type="fill"
              paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.08 }}
            />
            <Layer
              id="cones-line"
              type="line"
              paint={{ "line-color": ["get", "color"], "line-opacity": 0.45, "line-width": 1 }}
            />
          </GeoJSONSource>
          <GeoJSONSource id="heat" data={heatGeoJSON(cells)}>
            <Layer
              id="heat"
              type="heatmap"
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
          <GeoJSONSource id="cameras" data={camerasGeoJSON(cameras)}>
            <Layer
              id="cameras"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 18, 9],
                "circle-color": ["get", "color"],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
            <Layer
              id="camera-labels"
              type="symbol"
              minzoom={16.5}
              layout={{
                "text-field": ["get", "name"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 12,
                "text-offset": [0, 1],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{
                "text-color": dark ? "#e6e9ef" : "#0f172a",
                "text-halo-color": dark ? "#141821" : "#ffffff",
                "text-halo-width": 1.5,
              }}
            />
          </GeoJSONSource>
        </MapView>
      ) : (
        <Text style={styles.empty}>{problem ? "" : "Harita yükleniyor…"}</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
});
