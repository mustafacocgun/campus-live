import type { CameraKind } from "@campus-live/contracts";
import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";

// The web app's hand-drawn 24×24 stroke icons (apps/web/src/components/icons.tsx): keep the two in step.
export const KIND_ICON_PATH: Record<CameraKind, string> = {
  crowd:
    "M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.2A6 6 0 0 1 21 20",
  parking: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 17V7h4a3 3 0 0 1 0 6H9",
  traffic:
    "M5.5 17H3v-5l2-5h14l2 5v5h-2.5M9.5 17h5M3 12h18M9.5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0M18.5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
};

export const KIND_LABEL_TR: Record<CameraKind, string> = {
  crowd: "Kalabalık",
  parking: "Otopark",
  traffic: "Trafik",
};

const PATHS = {
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  send: "M5 12h14M13 6l6 6-6 6",
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  logOut: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  campus:
    "M3 21h18M5 21V8l7-4 7 4v13M9 21v-4h6v4M9 10h.01M12 10h.01M15 10h.01M9 13.5h.01M12 13.5h.01M15 13.5h.01",
  user: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4.5 20a7.5 7.5 0 0 1 15 0",
  search: "M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0M20 20l-4.5-4.5",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v5M12 8h.01",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z",
  newChat: "M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M17.5 3.5l3 3L12 15H9v-3z",
  gear: "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 2.5l1.6 2.3 2.8-.5.9 2.7 2.6 1.1-.6 2.8 1.8 2.2-1.8 2.2.6 2.8-2.6 1.1-.9 2.7-2.8-.5L12 21.5l-1.6-2.3-2.8.5-.9-2.7-2.6-1.1.6-2.8L2.9 12l1.8-2.2-.6-2.8 2.6-1.1.9-2.7 2.8.5z",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
} as const;

export type IconName = keyof typeof PATHS;

/** A stroke icon in `color`; decorative unless given a label by its control. */
export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <StrokeIcon d={PATHS[name]} size={size} color={color} />;
}

function StrokeIcon({ d, size, color }: { d: string; size: number; color: ColorValue }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      <Path d={d} />
    </Svg>
  );
}

export function KindIcon({ kind, size = 18, color }: { kind: CameraKind; size?: number; color: string }) {
  return <StrokeIcon d={KIND_ICON_PATH[kind]} size={size} color={color} />;
}

export function SparkleIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} accessible={false}>
      <Path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" />
      <Path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </Svg>
  );
}
