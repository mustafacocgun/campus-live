import { placeValueText, type PlaceView } from "@campus-live/client";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DemoBadge, LevelChip, StaleChip } from "@/components/badges";
import { ageText, KIND_TR } from "@/lib/place-format";
import { useTheme } from "@/state/theme";

/** One place in the list, opening its detail; the level is written out, not shown by color alone. */
export const PlaceRow = memo(function PlaceRow({
  place,
  onPress,
}: {
  place: PlaceView;
  onPress: (id: string) => void;
}) {
  const { c } = useTheme();
  const fresh = !place.stale && place.level !== null;
  const age = ageText(place.ageMs);
  return (
    <Pressable
      onPress={() => onPress(place.id)}
      accessibilityRole="button"
      accessibilityHint="Ayrıntıları açar"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.card2 : c.card, borderColor: c.line },
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.names, !fresh && styles.faded]}>
          <Text numberOfLines={1} style={[styles.name, { color: c.fg }]}>
            {place.name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: c.muted }]}>
            {place.section} · {KIND_TR[place.kind]}
          </Text>
        </View>
        {fresh && place.level ? <LevelChip level={place.level} /> : <StaleChip />}
      </View>
      <View style={styles.bottom}>
        <View style={styles.valueRow}>
          {fresh ? (
            <Text style={[styles.value, { color: c.fg }]}>{placeValueText(place)}</Text>
          ) : (
            <Text style={[styles.meta, { color: c.muted }]}>Güncel veri yok</Text>
          )}
          {fresh && place.demo && <DemoBadge />}
        </View>
        {age && <Text style={[styles.meta, { color: c.muted }]}>{age}</Text>}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  names: { flex: 1, minWidth: 0 },
  faded: { opacity: 0.6 },
  name: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 12 },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
