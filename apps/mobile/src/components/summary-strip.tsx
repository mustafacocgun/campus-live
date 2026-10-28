import { LEVEL_COLOR, LEVEL_LABEL_TR, PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { CameraKind, Level } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { KindIcon } from "@/components/icons";
import { cardShadow, mix } from "@/constants/theme";
import { useTheme } from "@/state/theme";

// The web app's SummaryStrip (apps/web/src/components/SummaryStrip.tsx): keep the two in step.
const LEVEL_ORDER: Level[] = ["low", "medium", "high"];

type Fresh = PlaceView & { level: Level; count: number };

/** Fresh places only: a stale place is left out of every sum, not guessed. */
function freshPlaces(places: PlaceView[]): Fresh[] {
  return places.filter(
    (place): place is Fresh => !place.stale && place.level !== null && place.count !== null,
  );
}

const of = (places: Fresh[], topic: CameraKind) =>
  places.filter((place) => PLACE_TOPIC[place.kind] === topic);

function worst(places: Fresh[]): Level | null {
  return places.length
    ? LEVEL_ORDER[Math.max(...places.map((place) => LEVEL_ORDER.indexOf(place.level)))]
    : null;
}

/**
 * Four cards over the live campus: people, free parking, vehicles and the busiest place. Sums go over
 * places, never cameras: an area's overlapping views already count once in its place.
 */
export function SummaryStrip({ places }: { places: PlaceView[] }) {
  const { c } = useTheme();
  const fresh = freshPlaces(places);
  const crowd = of(fresh, "crowd");
  const lots = of(fresh, "parking");
  const roads = of(fresh, "traffic");
  const people = crowd.reduce((sum, place) => sum + place.count, 0);
  const free = lots.reduce((sum, place) => sum + (place.parking?.free ?? 0), 0);
  const total = lots.reduce((sum, place) => sum + (place.parking?.total ?? 0), 0);
  const vehicles = roads.reduce((sum, place) => sum + place.count, 0);
  const crowdLevel = worst(crowd);
  const busiest = [...crowd].sort(
    (a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level) || b.count - a.count,
  )[0];
  const levelText = (level: Level) => mix(LEVEL_COLOR[level], c.fg, 0.6);
  return (
    <View style={styles.grid}>
      <Card label="Toplam kişi" icon={<KindIcon kind="crowd" size={16} color={c.muted} />}>
        {crowdLevel ? (
          <Figure value={people.toLocaleString("tr-TR")}>
            <Text style={{ color: levelText(crowdLevel) }}>{LEVEL_LABEL_TR[crowdLevel]} seviye</Text>
          </Figure>
        ) : (
          <Empty />
        )}
      </Card>
      <Card label="Boş otopark" icon={<KindIcon kind="parking" size={16} color={c.muted} />}>
        {total > 0 ? (
          <Figure value={free.toLocaleString("tr-TR")}>
            /{total} (%{Math.round((free / total) * 100)})
          </Figure>
        ) : (
          <Empty />
        )}
      </Card>
      <Card label="Araç trafiği" icon={<KindIcon kind="traffic" size={16} color={c.muted} />}>
        {roads.length ? <Figure value={vehicles.toLocaleString("tr-TR")}>araç</Figure> : <Empty />}
      </Card>
      <Card
        label="En kalabalık"
        icon={
          <Text style={[styles.alert, { color: busiest?.level === "high" ? c.danger : c.muted }]}>!</Text>
        }
      >
        {busiest ? (
          <View style={styles.busiest}>
            <Text numberOfLines={1} style={[styles.busiestName, { color: c.fg }]}>
              {busiest.name}
            </Text>
            <Text style={[styles.unit, { color: levelText(busiest.level) }]}>
              {busiest.count.toLocaleString("tr-TR")} kişi
            </Text>
          </View>
        ) : (
          <Empty />
        )}
      </Card>
    </View>
  );
}

function Card({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}>
      <View style={styles.cardHead}>
        <Text numberOfLines={1} style={[styles.label, { color: c.muted }]}>
          {label.toLocaleUpperCase("tr")}
        </Text>
        {icon}
      </View>
      {children}
    </View>
  );
}

/** The card's number, with its unit or context smaller beside it. */
function Figure({ value, children }: { value: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.value, { color: c.fg }]}>{value}</Text>
      <Text style={[styles.unit, { color: c.muted }]}>{children}</Text>
    </View>
  );
}

function Empty() {
  const { c } = useTheme();
  return <Text style={[styles.empty, { color: c.muted }]}>Güncel veri yok</Text>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 0,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { flex: 1, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  alert: { fontSize: 14, fontWeight: "700" },
  figure: { marginTop: 4, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 },
  value: { fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 12, fontWeight: "500" },
  busiest: { marginTop: 4 },
  busiestName: { fontSize: 14, fontWeight: "600" },
  empty: { marginTop: 4, fontSize: 14 },
});
