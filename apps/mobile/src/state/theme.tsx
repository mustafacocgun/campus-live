import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { type Palette, Palettes } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface ThemeState {
  c: Palette;
  dark: boolean;
  /** Light or dark, one tap; until then the app follows the system, as the web does. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** The app's theme: the user's choice for this session, or the system's while nothing is chosen. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === "dark";
  const [choice, setChoice] = useState<"light" | "dark" | null>(null);
  const dark = choice ? choice === "dark" : system;
  const value = useMemo(
    () => ({
      c: Palettes[dark ? "dark" : "light"],
      dark,
      toggle: () => setChoice(dark ? "light" : "dark"),
    }),
    [dark],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme outside ThemeProvider");
  return theme;
}
