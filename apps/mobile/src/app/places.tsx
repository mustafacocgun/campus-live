import { PLACE_TOPIC, type PlaceView } from "@campus-live/client";
import type { Level } from "@campus-live/contracts";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader } from "@/components/app-header";
import { FilterChips } from "@/components/filter-chips";
import { Icon } from "@/components/icons";
import { PlaceDetail } from "@/components/place-detail";
import { PlaceRow } from "@/components/place-row";
import { SummaryStrip } from "@/components/summary-strip";
import { cardShadow } from "@/constants/theme";
import { useCampus } from "@/state/campus";
import { useTheme } from "@/state/theme";

const LEVEL_ORDER: Level[] = ["low", "medium", "high"];
type Sort = "level" | "name";

/** Busiest first: places with fresh data before silent ones, then by level, then by count. */
function byLevel(a: PlaceView, b: PlaceView): number {
  const rank = (place: PlaceView) => (place.stale || !place.level ? -1 : LEVEL_ORDER.indexOf(place.level));
  return rank(b) - rank(a) || (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name, "tr");
}

/**
 * The places, as the web's side panel lists them: the summary cards, search, the topic filters and the
 * live list, or one place's detail once one is chosen.
 */
export default function PlacesScreen() {
  const { c } = useTheme();
  const campus = useCampus();
  const { places, topic, section, selectedId, history } = campus;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("level");
  const selected = places.find((place) => place.id === selectedId) ?? null;

  if (selected) {
    return (
      <View style={[styles.screen, { backgroundColor: c.panel }]}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.detail}>
          <PlaceDetail
            place={selected}
            places={places}
            history={history[selected.id] ?? []}
            onBack={() => campus.select(null)}
            onShowOnMap={() => campus.showOnMap(selected.id)}
            onShowPlace={campus.select}
          />
        </ScrollView>
      </View>
    );
  }

  // The search narrows the list only; the map keeps showing the topic and section.
  const needle = query.trim().toLocaleLowerCase("tr");
  const listed = places
    .filter(
      (place) =>
        (!topic || PLACE_TOPIC[place.kind] === topic) &&
        (!section || place.section === section) &&
        (!needle ||
          place.name.toLocaleLowerCase("tr").includes(needle) ||
          place.section.toLocaleLowerCase("tr").includes(needle)),
    )
    .sort(sort === "level" ? byLevel : (a, b) => a.name.localeCompare(b.name, "tr"));
  const live = places.filter((place) => !place.stale).length;

  return (
    <View style={[styles.screen, { backgroundColor: c.panel }]}>
      <AppHeader />
      <FlatList
        data={listed}
        keyExtractor={(place) => place.id}
        renderItem={({ item }) => <PlaceRow place={item} onPress={campus.select} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.head}>
            <SummaryStrip places={places} />
            <View style={[styles.search, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}>
              <Icon name="search" size={16} color={c.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Kampüste yer veya bina ara…"
                placeholderTextColor={c.muted}
                accessibilityLabel="Yer ara"
                returnKeyType="search"
                clearButtonMode="while-editing"
                style={[styles.input, { color: c.fg }]}
              />
              {query.length > 0 && (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Aramayı temizle"
                  hitSlop={10}
                >
                  <Icon name="close" size={16} color={c.muted} />
                </Pressable>
              )}
            </View>
            <FilterChips
              places={places}
              topic={topic}
              section={section}
              onTopic={campus.chooseTopic}
              onSection={campus.chooseSection}
            />
            <View style={styles.listHead}>
              <Text style={[styles.caption, { color: c.muted }]}>CANLI DURUM ({listed.length} YER)</Text>
              <View style={styles.sort} accessibilityRole="radiogroup" accessibilityLabel="Sıralama">
                {(["level", "name"] as const).map((option) => {
                  const on = sort === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setSort(option)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={[styles.sortOption, on && { backgroundColor: c.card, borderColor: c.line }]}
                    >
                      <Text style={[styles.sortText, { color: on ? c.fg : c.muted }]}>
                        {option === "level" ? "Yoğunluk" : "Ad"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.muted }]}>
            {places.length ? "Eşleşen yer yok." : "Yerler yükleniyor…"}
          </Text>
        }
        ListFooterComponent={
          <View style={[styles.footer, { borderColor: c.line }]}>
            <View style={styles.footerItem}>
              <Icon name="shield" size={14} color={c.muted} />
              <Text style={[styles.footerText, { color: c.muted }]}>Görüntü saklanmaz, yalnızca sayılar</Text>
            </View>
            <Text style={[styles.footerText, { color: c.muted }]}>
              {live}/{places.length} yer canlı
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  detail: { padding: 16, paddingBottom: 32 },
  list: { padding: 12, paddingBottom: 24 },
  head: { gap: 12, marginBottom: 10 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  caption: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  sort: { flexDirection: "row", gap: 2 },
  sortOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sortText: { fontSize: 12, fontWeight: "600" },
  gap: { height: 8 },
  empty: { paddingVertical: 24, textAlign: "center", fontSize: 14 },
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 11 },
});
