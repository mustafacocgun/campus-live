import { LEVEL_COLOR, LEVEL_LABEL_TR } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";
import { StyleSheet, Text, View } from "react-native";

import { mix, tint } from "@/constants/theme";
import { useTheme } from "@/state/theme";

/**
 * The level as a word beside a dot, on a tint of its color. The text is the level's color mixed
 * halfway into the text color: amber alone fails contrast on white, the mix keeps it legible.
 */
export function LevelChip({ level }: { level: Level }) {
  const { c } = useTheme();
  const color = LEVEL_COLOR[level];
  return (
    <View style={[styles.chip, { backgroundColor: tint(color, 0.14) }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.chipText, { color: mix(color, c.fg, 0.55) }]}>{LEVEL_LABEL_TR[level]}</Text>
    </View>
  );
}

/** A place with no fresh reading: grey, never a guessed level. */
export function StaleChip() {
  const { c } = useTheme();
  return (
    <View style={[styles.chip, styles.stale, { borderColor: c.line }]}>
      <View style={[styles.dot, { backgroundColor: LEVEL_COLOR.stale }]} />
      <Text style={[styles.chipText, { color: c.muted, fontWeight: "500" }]}>Görüntü yok</Text>
    </View>
  );
}

/** Every reading not from a real camera says so (CLAUDE.md §0.5). */
export function DemoBadge() {
  const { c } = useTheme();
  return (
    <View style={[styles.demo, { borderColor: c.line }]}>
      <Text style={[styles.demoText, { color: c.muted }]}>DEMO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  stale: { borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: "600" },
  demo: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  demoText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
});
