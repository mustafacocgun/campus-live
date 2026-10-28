import { PLACE_TOPIC } from "@campus-live/client";
import type { CameraKind, Place } from "@campus-live/contracts";

/** Hand-drawn 24×24 stroke icons. */
export const KIND_ICON_PATH: Record<CameraKind, string> = {
  crowd:
    "M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.2A6 6 0 0 1 21 20",
  parking: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 17V7h4a3 3 0 0 1 0 6H9",
  traffic:
    "M5.5 17H3v-5l2-5h14l2 5v5h-2.5M9.5 17h5M3 12h18M9.5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0M18.5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
};

// The registry has no icon field: the sections we know get their own icon, any other its kind's.
const SECTION_ICON_PATH: Record<string, string> = {
  Kütüphane: "M3 5.5c2.5-1 5.5-1 9 1v13c-3.5-2-6.5-2-9-1zM21 5.5c-2.5-1-5.5-1-9 1v13c3.5-2 6.5-2 9-1z",
  Kafeler: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M12 3.5v2",
};

function iconPathFor(place: Pick<Place, "kind" | "section">): string {
  return SECTION_ICON_PATH[place.section] ?? KIND_ICON_PATH[PLACE_TOPIC[place.kind]];
}

export const KIND_LABEL_TR: Record<CameraKind, string> = {
  crowd: "Kalabalık",
  parking: "Otopark",
  traffic: "Trafik",
};

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function StrokeIcon({ d, className }: { d: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...STROKE}>
      <path d={d} />
    </svg>
  );
}

export function KindIcon({ kind, className = "h-5 w-5" }: { kind: CameraKind; className?: string }) {
  return <StrokeIcon d={KIND_ICON_PATH[kind]} className={className} />;
}

export function PlaceIcon({
  place,
  className = "h-5 w-5",
}: {
  place: Pick<Place, "kind" | "section">;
  className?: string;
}) {
  return <StrokeIcon d={iconPathFor(place)} className={className} />;
}

/** A map pin with a live dot: the Campus Live mark. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...STROKE}>
      <path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </svg>
  );
}

export function SendIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M5 12h14M13 6l6 6-6 6" className={className} />;
}

export function ChevronIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M9 6l6 6-6 6" className={className} />;
}

export function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M6 6l12 12M18 6L6 18" className={className} />;
}

/** All cameras: a 2×2 grid. */
export function GridIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" className={className} />;
}

/** The inbox of region alerts. */
export function BellIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <StrokeIcon d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" className={className} />;
}

/** Alert settings: two sliders, the threshold being one. */
export function SlidersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <StrokeIcon d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" className={className} />;
}

export function LogOutIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <StrokeIcon d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" className={className} />
  );
}

export function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" className={className} />;
}

export function MailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M4 6h16v12H4zM4 7l8 6 8-6" className={className} />;
}
