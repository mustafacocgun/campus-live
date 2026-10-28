import { LEVEL_COLOR, LEVEL_LABEL_TR, type PlaceView, STALE_AFTER_MS } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DemoBadge, LevelChip, StaleChip } from "@/components/badges";
import { Icon, KindIcon } from "@/components/icons";
import { SessionChart } from "@/components/session-chart";
import { cardShadow } from "@/constants/theme";
import { ageText, KIND_TR, nearestParking } from "@/lib/place-format";
import { CHART_UNIT, type SessionPoint } from "@/lib/session-history";
import { useTheme } from "@/state/theme";

// The web app's PlaceDetail (apps/web/src/components/PlaceDetail.tsx): keep the two in step.
const LEVELS: Level[] = ["low", "medium", "high"];

/** First and last value of this session, and the change between them as a whole percent. */
function trend(points: SessionPoint[]): { from: number; to: number; change: number | null } | null {
  if (points.length < 2) return null;
  const from = points[0].value;
  const to = points[points.length - 1].value;
  return { from, to, change: from > 0 ? Math.round(((to - from) / from) * 100) : null };
}

/**
 * The selected place: its number, its level and this session's values, and for a crowd the nearest
 * lot with free slots. Numbers only, never images (§0.2); the level bar has no numeric ranges, since
 * the thresholds are per camera and not the team's final numbers yet (§0.5).
 */
export function PlaceDetail({
  place,
  places,
  history,
  onBack,
  onShowOnMap,
  onShowPlace,
}: {
  place: PlaceView;
  places: PlaceView[];
  history: SessionPoint[];
  onBack: () => void;
  onShowOnMap: () => void;
  onShowPlace: (id: string) => void;
}) {
  const { c } = useTheme();
  const level = place.stale ? null : place.level;
  const reached = level ? LEVELS.indexOf(level) : -1;
  const lot = place.kind === "parking" ? null : nearestParking(place, places);
  const change = trend(history);
  const age = ageText(place.ageMs);
  const unit = CHART_UNIT[place.kind];
  const value = place.kind === "parking" ? place.parking?.free : place.count;
  const card = [styles.card, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)];
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: c.card }]}
        >
          <Icon name="arrowLeft" size={16} color={c.accentText} />
          <Text style={[styles.backText, { color: c.accentText }]}>Tüm yerler</Text>
        </Pressable>
        <Text style={[styles.kind, { color: c.muted, backgroundColor: c.card, borderColor: c.line }]}>
          {KIND_TR[place.kind].toLocaleUpperCase("tr")}
        </Text>
      </View>

      <View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
          {place.name}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]}>
          {place.section} · {KIND_TR[place.kind]}
          {age && ` · ${age} güncellendi`}
        </Text>
      </View>

      <View style={card}>
        {level && value !== null && value !== undefined ? (
          <>
            <View style={styles.valueRow}>
              <View style={styles.figure}>
                <Text style={[styles.value, { color: c.fg }]}>{value.toLocaleString("tr-TR")}</Text>
                <Text style={[styles.unit, { color: c.muted }]}>
                  {place.kind === "parking" ? `boş yer / ${place.parking?.total ?? 0}` : unit}
                </Text>
              </View>
              <View style={styles.badges}>
                {place.demo && <DemoBadge />}
                <LevelChip level={level} />
              </View>
            </View>
            {/* The three levels as one bar; the reached part carries the color. */}
            <View style={styles.levels} accessible accessibilityLabel={`Seviye: ${LEVEL_LABEL_TR[level]}`}>
              {LEVELS.map((step, i) => (
                <View key={step} style={styles.level}>
                  <View
                    style={[
                      styles.levelBar,
                      { backgroundColor: LEVEL_COLOR[step], opacity: i <= reached ? 1 : 0.22 },
                      i === reached && { borderRightWidth: 3, borderRightColor: c.fg },
                    ]}
                  />
                  <View style={styles.levelLabel}>
                    <View style={[styles.dot, { backgroundColor: LEVEL_COLOR[step] }]} />
                    <Text
                      style={[
                        styles.levelText,
                        { color: i === reached ? c.fg : c.muted },
                        i === reached && styles.bold,
                      ]}
                    >
                      {LEVEL_LABEL_TR[step]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.staleBox}>
            <StaleChip />
            <Text style={[styles.meta, { color: c.muted }]}>
              Son {STALE_AFTER_MS / 1000} saniyede bu yerden veri gelmedi; tahmin gösterilmez.
            </Text>
          </View>
        )}

        <View style={[styles.session, { borderColor: c.line }]}>
          <View style={styles.sessionHead}>
            <Text style={[styles.sessionTitle, { color: c.fg }]}>Bu oturum</Text>
            {change && (
              <Text style={[styles.small, { color: c.muted }]}>
                {change.from} → {change.to} {unit}
                {change.change !== null && (
                  <Text style={[styles.bold, { color: c.fg }]}>
                    {" "}
                    ({change.change > 0 ? "+" : ""}
                    {change.change}%)
                  </Text>
                )}
              </Text>
            )}
          </View>
          <SessionChart points={history} unit={unit} />
          <Text style={[styles.note, { color: c.muted }]}>
            Uygulama açıldığından beri gelen değerler. Telefonda tutulur, kaydedilmez.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onShowOnMap}
        accessibilityRole="button"
        style={({ pressed }) => [styles.mapButton, { backgroundColor: pressed ? c.accent2 : c.accent }]}
      >
        <Icon name="map" size={16} color={c.onAccent} />
        <Text style={[styles.mapButtonText, { color: c.onAccent }]}>Haritada göster</Text>
      </Pressable>

      {lot && (
        <Pressable
          onPress={() => onShowPlace(lot.lot.id)}
          accessibilityRole="button"
          style={[card, styles.lot]}
        >
          <View style={[styles.lotIcon, { backgroundColor: c.accent }]}>
            <KindIcon kind="parking" size={18} color={c.onAccent} />
          </View>
          <View style={styles.lotText}>
            <Text style={[styles.small, { color: c.muted }]}>En yakın otopark (kuş uçuşu)</Text>
            <Text numberOfLines={1} style={[styles.lotName, { color: c.fg }]}>
              {lot.lot.name} ({lot.metres} m)
            </Text>
          </View>
          <Text style={[styles.free, { color: c.good, backgroundColor: "rgba(22, 163, 74, 0.12)" }]}>
            {lot.lot.parking?.free} boş yer
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginLeft: -6,
  },
  backText: { fontSize: 14, fontWeight: "600" },
  kind: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  meta: { marginTop: 2, fontSize: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  valueRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  figure: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  value: { fontSize: 36, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 14 },
  badges: { flexDirection: "row", alignItems: "center", gap: 6 },
  levels: { marginTop: 16, flexDirection: "row", gap: 4 },
  level: { flex: 1, gap: 6 },
  levelBar: { height: 8, borderRadius: 4 },
  levelLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  levelText: { fontSize: 12 },
  bold: { fontWeight: "600" },
  staleBox: { gap: 8 },
  session: { marginTop: 16, borderTopWidth: 1, paddingTop: 12, gap: 8 },
  sessionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  sessionTitle: { fontSize: 12, fontWeight: "600" },
  small: { fontSize: 12 },
  note: { fontSize: 11 },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    minHeight: 48,
  },
  mapButtonText: { fontSize: 14, fontWeight: "600" },
  lot: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  lotIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  lotText: { flex: 1, minWidth: 0 },
  lotName: { fontSize: 14, fontWeight: "600" },
  free: {
    fontSize: 12,
    fontWeight: "600",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
});
