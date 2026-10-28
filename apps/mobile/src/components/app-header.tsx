import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/icons";
import { useAccount } from "@/state/account";
import { useCampus } from "@/state/campus";
import { useTheme } from "@/state/theme";

/**
 * The top bar of every tab, the web's navy chrome: the mark, the live connection, the theme switch and
 * the inbox. Under it, on every tab, the demo notice whenever a reading is not from a real camera.
 */
export function AppHeader() {
  const { c, dark, toggle } = useTheme();
  const { connected, places, error } = useCampus();
  const { account, unread } = useAccount();
  const top = useSafeAreaInsets().top;
  const demo = places.some((place) => !place.stale && place.demo);
  return (
    <View>
      <View style={[styles.bar, { backgroundColor: c.chrome, paddingTop: top }]}>
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: c.chromeAccent }]}>
            <Icon name="campus" size={18} color="#ffffff" />
          </View>
          <Text style={[styles.title, { color: c.chromeFg }]}>Campus Live</Text>
        </View>
        <View
          accessibilityLabel={connected ? "Canlı bağlantı" : "Bağlantı yok"}
          style={[styles.status, { backgroundColor: c.chrome2, borderColor: c.chromeLine }]}
        >
          <View style={[styles.statusDot, { backgroundColor: connected ? "#22c55e" : "#9ca3af" }]} />
          <Text style={[styles.statusText, { color: connected ? c.chromeFg : c.chromeMuted }]}>
            {connected ? "Canlı" : "Bağlantı yok"}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={dark ? "Açık temaya geç" : "Koyu temaya geç"}
            android_ripple={{ color: c.chromeLine, borderless: true }}
            style={styles.iconButton}
          >
            <Icon name={dark ? "sun" : "moon"} size={20} color={c.chromeMuted} />
          </Pressable>
          {account.status !== "off" && account.status !== "loading" && (
            <Pressable
              onPress={() => router.navigate("/account")}
              accessibilityRole="button"
              accessibilityLabel={unread ? `Bildirimler: ${unread} okunmamış` : "Bildirimler"}
              android_ripple={{ color: c.chromeLine, borderless: true }}
              style={styles.iconButton}
            >
              <Icon name="bell" size={20} color={c.chromeMuted} />
              {unread > 0 && (
                <View style={[styles.badge, { borderColor: c.chrome }]}>
                  <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      </View>
      {demo && (
        <View style={[styles.notice, { backgroundColor: c.panel, borderColor: c.line }]}>
          <Icon name="info" size={14} color={c.muted} />
          <Text style={[styles.noticeText, { color: c.muted }]}>
            Demo görüntüsü: kameralar kampüs kamerası değil, demo videolarıdır; sayılar tahminidir.
          </Text>
        </View>
      )}
      {error && (
        <Text style={[styles.error, { backgroundColor: c.dangerBg, color: c.danger, borderColor: c.line }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    paddingBottom: 6,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" },
  actions: { marginLeft: "auto", flexDirection: "row", alignItems: "center" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 6,
    right: 5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  notice: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 16 },
  error: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderBottomWidth: 1 },
});
