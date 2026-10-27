import { apiUrlProblem, isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import { useLiveCameras } from "@/hooks/use-live-cameras";

/** The live campus map: one marker per camera, colored by level, grey when stale. */
export default function MapScreen() {
  const { cameras, connected, error } = useLiveCameras();
  const problem = apiUrlProblem(API_URL, Platform.OS);
  const demo = cameras.some((camera) => camera.reading && isDemo(camera.reading));
  const center = cameras.length
    ? {
        latitude: cameras.reduce((sum, c) => sum + c.latitude, 0) / cameras.length,
        longitude: cameras.reduce((sum, c) => sum + c.longitude, 0) / cameras.length,
      }
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Campus Live</Text>
        <Text style={styles.status}>{connected ? "● Canlı bağlantı" : "○ Bağlantı yok"}</Text>
      </View>
      {problem && <Text style={[styles.banner, styles.error]}>{problem}</Text>}
      {!problem && error && <Text style={[styles.banner, styles.error]}>{error}</Text>}
      <View style={styles.legend}>
        {(["low", "medium", "high"] as const).map((level) => (
          <View key={level} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR[level] }]} />
            <Text style={styles.legendText}>{LEVEL_LABEL_TR[level]}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.stale }]} />
          <Text style={styles.legendText}>Veri yok</Text>
        </View>
      </View>
      {demo && (
        <Text style={styles.banner}>Demo verisi: kameralar demo videolarıdır ve sayılar tahminidir.</Text>
      )}
      {center ? (
        <MapView
          style={styles.map}
          initialRegion={{ ...center, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
        >
          {cameras.map((camera) => {
            const reading = camera.stale ? null : camera.reading;
            const value = reading
              ? `${valueText(reading)} · ${LEVEL_LABEL_TR[reading.level]}`
              : "Güncel veri yok";
            const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
            return (
              <Marker
                key={`${camera.id}-${reading?.level ?? "stale"}`}
                coordinate={{ latitude: camera.latitude, longitude: camera.longitude }}
                title={camera.name}
                description={reading && isDemo(reading) ? `${value} · Demo verisi` : value}
              >
                {/* A drawn dot, not pinColor: Android pins keep only the hue, so grey became blue (#2). */}
                <View style={[styles.dot, { backgroundColor: color }]} />
              </Marker>
            );
          })}
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
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: "#ffffff" },
  legend: { flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13 },
  empty: { padding: 24, textAlign: "center", color: "#6b7280" },
});
