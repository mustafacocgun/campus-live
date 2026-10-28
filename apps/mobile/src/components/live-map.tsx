import {
  buildingsGeoJSON,
  campusMaskGeoJSON,
  labelsGeoJSON,
  lotsGeoJSON,
  type PlaceView,
  roadsGeoJSON,
} from "@campus-live/client";
import type { CampusMap, DensityCell, LatLng } from "@campus-live/contracts";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { MAP_HTML } from "@/components/map-html";
import { cardShadow } from "@/constants/theme";
import { useMapStyle } from "@/hooks/use-map-style";
import { useTheme } from "@/state/theme";

type Mode = "3d" | "2d";

// Its typings default the extra props to `undefined`, which leaves no valid props at all.
const MapWebView = WebView<object>;

/** The bounding box of every place: where the map opens. */
function boundsOf(places: PlaceView[]): [number, number, number, number] | null {
  const points = places.flatMap((place) => [place.geometry.coordinates].flat(3));
  if (!points.length) return null;
  const longitudes = points.filter((_, i) => i % 2 === 0);
  const latitudes = points.filter((_, i) => i % 2 === 1);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

/**
 * The live campus map, in 3D or 2D: the crowd as a heat cloud, buildings lit by the crowd inside,
 * parking lots and roads in their level's color, every place's name and value. MapLibre GL JS draws it
 * in a WebView (map-html.ts), so it runs in Expo Go as well as in a development build.
 */
export function LiveMap({
  campus,
  places,
  cells,
  selectedId,
  onSelect,
  me,
  picking,
  onPick,
}: {
  campus: CampusMap["campus"] | null;
  places: PlaceView[];
  cells: DensityCell[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  me: LatLng | null;
  picking: boolean;
  onPick: (spot: LatLng) => void;
}) {
  const { c, dark } = useTheme();
  const style = useMapStyle(dark);
  const web = useRef<WebView<object>>(null);
  // The page has loaded its script and can take messages.
  const [page, setPage] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("3d");
  const [still, setStill] = useState(false);

  // Reduced motion starts flat and never animates.
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      setStill(reduce);
      if (reduce) setMode("2d");
    });
  }, []);

  function send(message: object) {
    web.current?.injectJavaScript(`window.__receive(${JSON.stringify(message)});true;`);
  }

  useEffect(() => {
    if (page) send({ type: "mode", mode });
  }, [page, mode]);

  useEffect(() => {
    if (page) send({ type: "picking", on: picking });
  }, [page, picking]);

  useEffect(() => {
    if (page) send({ type: "me", me });
  }, [page, me]);

  // Places take their new colors and values with every snapshot.
  useEffect(() => {
    if (!page) return;
    const chosen = places.find((place) => place.id === selectedId);
    send({
      type: "data",
      mask: campus ? campusMaskGeoJSON(campus) : null,
      lots: lotsGeoJSON(places),
      roads: roadsGeoJSON(places),
      buildings: buildingsGeoJSON(places),
      labels: labelsGeoJSON(places),
      selected: chosen ? { type: "Feature", geometry: chosen.geometry, properties: {} } : null,
      bounds: campus ? boundsOf(places) : null,
    });
  }, [page, campus, places, selectedId]);

  useEffect(() => {
    if (page) send({ type: "heat", cells });
  }, [page, cells]);

  // Sent last: the first style message creates the map, with the mode and data already in place.
  useEffect(() => {
    if (page && style) send({ type: "style", style, dark, still, background: c.page });
  }, [page, style, dark, still, c.page]);

  // Brings the selected place into view when the selection changes.
  useEffect(() => {
    if (!page || !selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    if (place) send({ type: "fly", center: labelsGeoJSON([place]).features[0].geometry.coordinates });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only when the selection changes
  }, [page, selectedId]);

  function receive(event: WebViewMessageEvent) {
    let message: { type: string; id?: string | null; lat?: number; lng?: number; message?: string };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === "page") setPage(true);
    else if (message.type === "ready") setProblem(null);
    else if (message.type === "error") setProblem(message.message ?? "Harita yüklenemedi.");
    else if (message.type === "select") onSelect(message.id ?? null);
    else if (message.type === "pick" && message.lat !== undefined && message.lng !== undefined)
      onPick({ lat: message.lat, lng: message.lng });
  }

  return (
    <View style={[styles.fill, { backgroundColor: c.page }]}>
      <MapWebView
        ref={web}
        source={{ html: MAP_HTML }}
        originWhitelist={["*"]}
        onMessage={receive}
        // A reload (Android may drop the page in the background) starts again from the first message.
        onLoadStart={() => setPage(false)}
        onError={() => setProblem("Harita yüklenemedi: internet bağlantısını kontrol edin.")}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={[styles.fill, { backgroundColor: c.page }]}
      />
      {picking && (
        <View pointerEvents="none" style={styles.pickWrap}>
          <Text style={[styles.pick, { backgroundColor: c.accent, color: c.onAccent }]}>
            Konumunu seçmek için haritada bir yere dokun
          </Text>
        </View>
      )}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Harita görünümü"
        style={[styles.modes, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}
      >
        {(["3d", "2d"] as const).map((option) => {
          const on = mode === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setMode(option)}
              style={[styles.mode, on && { backgroundColor: c.accent }]}
            >
              <Text style={[styles.modeText, { color: on ? c.onAccent : c.fg }]}>
                {option === "3d" ? "3B" : "2B"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {problem && (
        <Text style={[styles.problem, { backgroundColor: c.card, color: c.danger, borderColor: c.line }]}>
          {problem}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pickWrap: { position: "absolute", top: 12, left: 0, right: 0, alignItems: "center" },
  pick: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    fontSize: 14,
    fontWeight: "600",
    overflow: "hidden",
  },
  modes: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  mode: {
    minWidth: 48,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  modeText: { fontSize: 13, fontWeight: "700" },
  problem: {
    position: "absolute",
    top: 60,
    left: 12,
    right: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    overflow: "hidden",
  },
});
