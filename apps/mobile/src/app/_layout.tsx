import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";

import AppTabs from "@/components/app-tabs";
import { SharedLocationProvider } from "@/hooks/use-shared-location";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SharedLocationProvider>
        <AppTabs />
      </SharedLocationProvider>
    </ThemeProvider>
  );
}
