import { apiUrlProblem, LEVEL_COLOR, LEVEL_LABEL_TR, PLACE_TOPIC, placeValueText } from "@campus-live/client";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/components/app-header";
import { DemoBadge, LevelChip, StaleChip } from "@/components/badges";
import { FilterChips } from "@/components/filter-chips";
import { Icon } from "@/components/icons";
import { LiveMap } from "@/components/live-map";
import { API_URL } from "@/constants/api";
import { cardShadow, HEAT_RAMP } from "@/constants/theme";
import { KIND_TR } from "@/lib/place-format";
import { useCampus } from "@/state/campus";
import { useTheme } from "@/state/theme";

/**
 * The live campus map: the topic filters over it, the legend, and the tapped place's summary card,
 * which opens its detail. Never a camera: the app only gets places and the merged heat (CLAUDE.md §0.2).
 */
export default function MapScreen() {
  const { c } = useTheme();
  const campus = useCampus();
  const { places, cells, topic, section, selectedId, me, picking } = campus;
  const problem = apiUrlProblem(API_URL, Platform.OS);
  const visible = places.filter(
    (place) => (!topic || PLACE_TOPIC[place.kind] === topic) && (!section || place.section === section),
  );
  // The heat belongs to the crowd; the API merges it for the whole campus, so a section filter leaves
  // it whole.
  const heat = topic === null || topic === "crowd" ? cells : [];
  const selected = places.find((place) => place.id === selectedId) ?? null;
  const fresh = selected && !selected.stale && selected.level;

  return (
    <View style={[styles.screen, { backgroundColor: c.page }]}>
      <AppHeader />
      {problem && (
        <Text style={[styles.banner, { backgroundColor: c.dangerBg, color: c.danger }]}>{problem}</Text>
      )}
      <View style={[styles.filters, { backgroundColor: c.panel, borderColor: c.line }]}>
        <FilterChips
          places={places}
          topic={topic}
          section={section}
          onTopic={campus.chooseTopic}
          onSection={campus.chooseSection}
        />
      </View>
      <View style={styles.map}>
        <LiveMap
          campus={campus.campus}
          places={visible}
          cells={heat}
          selectedId={selectedId}
          onSelect={(id) => !picking && campus.select(id)}
          me={me}
          picking={picking}
          onPick={(spot) => campus.setMe({ ...spot, source: "map" })}
        />

        {/* Top right: the map's attribution and the 3B/2B switch keep the bottom corners. */}
        {!picking && (
          <View
            pointerEvents="none"
            style={[styles.legend, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}
          >
            <View style={styles.legendRow}>
              <Text style={[styles.legendText, { color: c.fg }]}>Kalabalık</Text>
              <Text style={[styles.legendText, { color: c.muted }]}>Az</Text>
              <View style={styles.ramp}>
                {HEAT_RAMP.map((color) => (
                  <View key={color} style={[styles.rampStep, { backgroundColor: color }]} />
                ))}
              </View>
              <Text style={[styles.legendText, { color: c.muted }]}>Yoğun</Text>
            </View>
            <View style={styles.legendRow}>
              {(["low", "medium", "high"] as const).map((level) => (
                <View key={level} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR[level] }]} />
                  <Text style={[styles.legendText, { color: c.fg }]}>{LEVEL_LABEL_TR[level]}</Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.stale }]} />
                <Text style={[styles.legendText, { color: c.fg }]}>Görüntü yok</Text>
              </View>
            </View>
          </View>
        )}

        {picking && (
          <Pressable
            onPress={campus.stopPicking}
            accessibilityRole="button"
            style={[styles.cancelPick, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}
          >
            <Text style={[styles.cancelText, { color: c.fg }]}>Vazgeç</Text>
          </Pressable>
        )}

        {selected && !picking && (
          <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}>
            <View style={styles.sheetTop}>
              <View style={styles.sheetNames}>
                <Text numberOfLines={1} style={[styles.sheetName, { color: c.fg }]}>
                  {selected.name}
                </Text>
                <Text numberOfLines={1} style={[styles.sheetMeta, { color: c.muted }]}>
                  {selected.section} · {KIND_TR[selected.kind]}
                </Text>
              </View>
              <Pressable
                onPress={() => campus.select(null)}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                hitSlop={8}
                style={styles.close}
              >
                <Icon name="close" size={18} color={c.muted} />
              </Pressable>
            </View>
            <View style={styles.sheetValue}>
              {fresh ? (
                <>
                  <Text style={[styles.value, { color: c.fg }]}>{placeValueText(selected)}</Text>
                  {selected.demo && <DemoBadge />}
                  {selected.level && <LevelChip level={selected.level} />}
                </>
              ) : (
                <StaleChip />
              )}
            </View>
            <Pressable
              onPress={() => campus.openDetail(selected.id)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.detailButton,
                { backgroundColor: pressed ? c.accent2 : c.accent },
              ]}
            >
              <Text style={[styles.detailText, { color: c.onAccent }]}>Ayrıntılar</Text>
              <Icon name="arrowRight" size={16} color={c.onAccent} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: { marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 10, fontSize: 14 },
  filters: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  map: { flex: 1 },
  legend: {
    position: "absolute",
    right: 12,
    top: 12,
    maxWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "500" },
  ramp: { flexDirection: "row", borderRadius: 4, overflow: "hidden" },
  rampStep: { width: 12, height: 8 },
  cancelPick: {
    position: "absolute",
    top: 56,
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "600" },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  sheetTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  sheetNames: { flex: 1, minWidth: 0 },
  sheetName: { fontSize: 17, fontWeight: "700" },
  sheetMeta: { fontSize: 13 },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  sheetValue: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  value: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    minHeight: 46,
  },
  detailText: { fontSize: 14, fontWeight: "600" },
});
