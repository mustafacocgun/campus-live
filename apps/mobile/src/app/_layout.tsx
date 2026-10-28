import { DarkTheme, DefaultTheme, ThemeProvider as NavigationTheme } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { AlertToasts } from "@/components/alert-toasts";
import { Icon, type IconName } from "@/components/icons";
import { AccountProvider, useAccount } from "@/state/account";
import { CampusProvider } from "@/state/campus";
import { ThemeProvider, useTheme } from "@/state/theme";

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Harita", icon: "map" },
  { name: "places", title: "Yerler", icon: "list" },
  { name: "assistant", title: "Asistan", icon: "send" },
  { name: "account", title: "Hesap", icon: "user" },
];

/** Four tabs over shared live state: the map, the places, the assistant and the account. */
function AppTabs() {
  const { c, dark } = useTheme();
  const { unread } = useAccount();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <NavigationTheme
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: c.page,
          card: c.card,
          text: c.fg,
          border: c.line,
          primary: c.accent,
        },
      }}
    >
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: c.accentText,
            tabBarInactiveTintColor: c.muted,
            tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          }}
        >
          {TABS.map((tab) => (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: tab.title,
                tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size - 2} color={color} />,
                ...(tab.name === "account" && unread > 0
                  ? {
                      tabBarBadge: unread > 9 ? "9+" : unread,
                      tabBarBadgeStyle: { backgroundColor: "#dc2626" },
                    }
                  : {}),
              }}
            />
          ))}
        </Tabs>
        <AlertToasts />
      </View>
    </NavigationTheme>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AccountProvider>
        <CampusProvider>
          <AppTabs />
        </CampusProvider>
      </AccountProvider>
    </ThemeProvider>
  );
}
