import type { AlertNotification } from "@campus-live/contracts";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DemoBadge } from "@/components/badges";
import { Icon } from "@/components/icons";
import { cardShadow } from "@/constants/theme";
import { useAccount } from "@/state/account";
import { useTheme } from "@/state/theme";

const SHOWN_MS = 8_000;

function Toast({ notification, onDismiss }: { notification: AlertNotification; onDismiss: () => void }) {
  const { c } = useTheme();
  // The app re-renders with every reading: the timer must not restart each time it does.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [notification.id]);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}
    >
      <View style={[styles.icon, { backgroundColor: c.accent }]}>
        <Icon name="bell" size={16} color={c.onAccent} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.message, { color: c.fg }]}>{notification.message}</Text>
        {notification.demo && <DemoBadge />}
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Bildirimi kapat"
        style={styles.close}
      >
        <Icon name="close" size={16} color={c.muted} />
      </Pressable>
    </View>
  );
}

/** Alerts that arrived while the app was open, over every tab, under the top bar. */
export function AlertToasts() {
  const { arrived, dismiss } = useAccount();
  const top = useSafeAreaInsets().top;
  if (!arrived.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.stack, { top: top + 64 }]}>
      {arrived.map((notification) => (
        <Toast key={notification.id} notification={notification} onDismiss={() => dismiss(notification.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: "absolute", left: 12, right: 12, gap: 8 },
  toast: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 4 },
  message: { fontSize: 14, lineHeight: 19 },
  close: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
    marginRight: -4,
  },
});
