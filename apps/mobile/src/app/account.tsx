import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AlertSettings } from "@/components/alert-settings";
import { AppHeader } from "@/components/app-header";
import { DemoBadge } from "@/components/badges";
import { Icon } from "@/components/icons";
import { LoginForm } from "@/components/login-form";
import { cardShadow, tint } from "@/constants/theme";
import { campusTime } from "@/lib/place-format";
import { useAccount } from "@/state/account";
import { useTheme } from "@/state/theme";

/**
 * The account: sign-in while signed out; once in, the inbox, the alert settings and sign-out (the web's
 * bell, gear and account menu). While accounts are off (no database), the map works and this says so.
 */
export default function AccountScreen() {
  const { c } = useTheme();
  const { account, notifications, unread, signedIn, signOut, markAllRead } = useAccount();
  // What was unread when the tab opened stays highlighted while it is open; opening marks it read.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      if (!unread) return;
      setFresh(new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));
      void markAllRead();
    }, [unread, notifications, markAllRead]),
  );
  const card = [styles.card, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)];

  return (
    // "padding" on Android too: the app is edge to edge, so the window no longer shrinks for the
    // keyboard and the sign-in fields would stay under it.
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.panel }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {account.status === "loading" ? (
          <ActivityIndicator color={c.muted} style={styles.loading} />
        ) : account.status === "off" ? (
          <View style={[card, styles.padded]}>
            <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
              Hesap sistemi kapalı
            </Text>
            <Text style={[styles.body, { color: c.muted }]}>
              API'nin hesap özellikleri şu an kullanılamıyor (veritabanı bağlı değil ya da API'ye
              ulaşılamıyor). Canlı harita ve asistan hesap olmadan da çalışır.
            </Text>
          </View>
        ) : account.status === "signed-out" ? (
          <LoginForm onSignedIn={signedIn} />
        ) : (
          <>
            <View style={[card, styles.profile]}>
              <View style={[styles.initial, { backgroundColor: c.accent }]}>
                <Text style={[styles.initialText, { color: c.onAccent }]}>
                  {account.user.email.charAt(0).toLocaleUpperCase("tr")}
                </Text>
              </View>
              <Text numberOfLines={1} style={[styles.email, { color: c.fg }]}>
                {account.user.email}
              </Text>
              <Pressable
                onPress={() => void signOut()}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.signOut,
                  { borderColor: c.line },
                  pressed && { backgroundColor: c.card2 },
                ]}
              >
                <Icon name="logOut" size={16} color={c.fg} />
                <Text style={[styles.signOutText, { color: c.fg }]}>Çıkış yap</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
                Bildirimler
              </Text>
              {notifications.length ? (
                <View style={[card, styles.inbox]}>
                  {notifications.map((notification) => (
                    <View
                      key={notification.id}
                      style={[
                        styles.notification,
                        fresh.has(notification.id) && { backgroundColor: tint(c.accent2, 0.1) },
                      ]}
                    >
                      <Text style={[styles.body, { color: c.fg }]}>{notification.message}</Text>
                      <View style={styles.notificationMeta}>
                        <Text style={[styles.small, { color: c.muted }]}>
                          {campusTime(notification.createdAt)}
                        </Text>
                        {notification.demo && <DemoBadge />}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.body, { color: c.muted }]}>
                  Henüz bildirim yok. Aşağıdan bir yer için eşik belirleyin.
                </Text>
              )}
            </View>

            <AlertSettings />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 24 },
  loading: { marginTop: 48 },
  card: { borderRadius: 16, borderWidth: 1 },
  padded: { padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12 },
  profile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  initialText: { fontSize: 16, fontWeight: "700" },
  email: { flex: 1, fontSize: 14, fontWeight: "500" },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  signOutText: { fontSize: 14, fontWeight: "600" },
  section: { gap: 10 },
  inbox: { padding: 6, gap: 2 },
  notification: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  notificationMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
});
