import { PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind } from "@campus-live/contracts";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { KIND_LABEL_TR } from "@/components/icons";
import { cardShadow } from "@/constants/theme";
import { useTheme } from "@/state/theme";

const TOPICS: CameraKind[] = ["crowd", "parking", "traffic"];

/**
 * "Tümü" plus one pill per kind of place the map has (Kalabalık, Otopark, Trafik), and under them one
 * tab per section of the chosen kind. Only what the places actually have; nothing invented.
 */
export function FilterChips({
  places,
  topic,
  section,
  onTopic,
  onSection,
}: {
  places: PlaceView[];
  topic: CameraKind | null;
  section: string | null;
  onTopic: (topic: CameraKind | null) => void;
  onSection: (section: string | null) => void;
}) {
  const { c } = useTheme();
  const topics = TOPICS.filter((each) => places.some((place) => PLACE_TOPIC[place.kind] === each));
  if (!topics.length) return null;
  const sections = topic
    ? [...new Set(places.filter((place) => PLACE_TOPIC[place.kind] === topic).map((place) => place.section))]
    : [];
  const pill = (key: string, label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.pill,
        active
          ? [{ backgroundColor: c.accent, borderColor: c.accent }, cardShadow(c)]
          : { backgroundColor: c.card, borderColor: c.line },
      ]}
    >
      <Text style={[styles.pillText, { color: active ? c.onAccent : c.fg }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityLabel="Yerleri süz" style={styles.wrap}>
      <View style={styles.pills}>
        {pill("all", "Tümü", topic === null, () => onTopic(null))}
        {topics.map((each) => pill(each, KIND_LABEL_TR[each], topic === each, () => onTopic(each)))}
      </View>
      {sections.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabs, { borderColor: c.line }]}
          contentContainerStyle={styles.tabsRow}
        >
          {sections.map((each) => {
            const active = section === each;
            return (
              <Pressable
                key={each}
                onPress={() => onSection(active ? null : each)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.tab, { borderBottomColor: active ? c.accent : "transparent" }]}
              >
                <Text style={[styles.tabText, { color: active ? c.accentText : c.muted }]}>{each}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { fontSize: 13, fontWeight: "600" },
  tabs: { borderBottomWidth: 1, flexGrow: 0 },
  tabsRow: { gap: 4 },
  tab: { borderBottomWidth: 2, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 9, marginBottom: -1 },
  tabText: { fontSize: 13, fontWeight: "600" },
});
