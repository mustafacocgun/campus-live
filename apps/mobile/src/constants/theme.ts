/**
 * The web app's palette (apps/web/src/app/globals.css), keep the two in step. Three layers, each a step
 * apart: the top bar (chrome) > the panel > the cards. Light: navy bar, light blue panel, white cards on
 * a soft blue page. Dark: black bar and page, grey panel, lighter grey cards. Green, amber and red stay
 * the levels (Az, Orta, Yoğun): no other color competes with them.
 */
export interface Palette {
  page: string;
  panel: string;
  card: string;
  card2: string;
  fg: string;
  muted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accent2: string;
  accentText: string;
  onAccent: string;
  chrome: string;
  chrome2: string;
  chromeFg: string;
  chromeMuted: string;
  chromeLine: string;
  chromeAccent: string;
  danger: string;
  dangerBg: string;
  warnBg: string;
  good: string;
  shadow: string;
}

export const Palettes: Record<"light" | "dark", Palette> = {
  light: {
    page: "#dbe6f6",
    panel: "#eaf1fc",
    card: "#ffffff",
    card2: "#f3f7fd",
    fg: "#0b1b3f",
    // 5.6:1 on the panel.
    muted: "#4f5f7d",
    line: "#d3dff1",
    lineStrong: "#b3c6e5",
    // Navy (blue-900): white text on it keeps 10:1.
    accent: "#1e3a8a",
    accent2: "#1d4ed8",
    accentText: "#1e40af",
    onAccent: "#ffffff",
    chrome: "#172c66",
    chrome2: "#22397a",
    chromeFg: "#ffffff",
    // 7.6:1 on the bar.
    chromeMuted: "#c3d0ee",
    chromeLine: "rgba(255, 255, 255, 0.16)",
    chromeAccent: "#3b6fe0",
    danger: "#b91c1c",
    dangerBg: "rgba(239, 68, 68, 0.1)",
    warnBg: "rgba(245, 158, 11, 0.12)",
    good: "#15803d",
    shadow: "#0f2350",
  },
  dark: {
    page: "#000000",
    panel: "#161618",
    card: "#222225",
    card2: "#2a2a2e",
    fg: "#f4f4f5",
    // 7.3:1 on the panel.
    muted: "#a1a1aa",
    line: "#303035",
    lineStrong: "#45454c",
    // Blue-600: white text on it keeps 5.2:1.
    accent: "#2563eb",
    accent2: "#1d4ed8",
    // Blue-300 on the grey panels keeps 9:1.
    accentText: "#93c5fd",
    onAccent: "#ffffff",
    chrome: "#0a0a0b",
    chrome2: "#1f1f22",
    chromeFg: "#f4f4f5",
    chromeMuted: "#a1a1aa",
    chromeLine: "rgba(255, 255, 255, 0.1)",
    chromeAccent: "#2563eb",
    danger: "#fca5a5",
    dangerBg: "rgba(239, 68, 68, 0.12)",
    warnBg: "rgba(245, 158, 11, 0.14)",
    good: "#4ade80",
    shadow: "#000000",
  },
};

/** The heat layer's ramp, low to high, as on the web map (LiveMap's heatmap-color). */
export const HEAT_RAMP = [
  "rgba(217, 70, 239, 0.45)",
  "rgba(16, 185, 129, 0.6)",
  "rgba(250, 204, 21, 0.75)",
  "rgba(249, 115, 22, 0.85)",
  "rgba(220, 38, 38, 0.9)",
];

/** A color with an alpha, from #rrggbb: the web's color-mix tints, in a form React Native takes. */
export function tint(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Two #rrggbb colors mixed, `share` of the first: a level's color into the text color, as on the web. */
export function mix(hex: string, other: string, share: number): string {
  const channel = (color: string, i: number) => parseInt(color.slice(i, i + 2), 16);
  const [r, g, b] = [1, 3, 5].map((i) =>
    Math.round(channel(hex, i) * share + channel(other, i) * (1 - share)),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/** Card elevation, in both themes. */
export function cardShadow(palette: Palette) {
  return {
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  } as const;
}
