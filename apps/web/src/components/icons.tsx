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

/** A crosshair: "use my location". */
export function LocateIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <StrokeIcon d="M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" className={className} />
  );
}

/** A map pin: a place an answer points at. */
export function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <StrokeIcon
      d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
      className={className}
    />
  );
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

/** Campus buildings: the Campus Live mark in the top bar. */
export function CampusIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <StrokeIcon
      d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-4h6v4M9 10h.01M12 10h.01M15 10h.01M9 13.5h.01M12 13.5h.01M15 13.5h.01"
      className={className}
    />
  );
}

export function UserIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <StrokeIcon d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4.5 20a7.5 7.5 0 0 1 15 0" className={className} />;
}

export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0M20 20l-4.5-4.5" className={className} />;
}

export function ShieldIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4" className={className} />;
}

export function InfoIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v5M12 8h.01" className={className} />;
}

export function ArrowLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M19 12H5M11 6l-6 6 6 6" className={className} />;
}

export function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M5 12h14M13 6l6 6-6 6" className={className} />;
}

/** The light theme. */
export function SunIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <StrokeIcon
      d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      className={className}
    />
  );
}

/** The dark theme. */
export function MoonIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <StrokeIcon d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" className={className} />;
}

/** Make a panel larger: arrows out to the corners. */
export function ExpandIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" className={className} />;
}

/** Back to its usual size: arrows in from the corners. */
export function CollapseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7" className={className} />;
}

/** Fold a panel down to its header. */
export function MinusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M5 12h14" className={className} />;
}

/** Open a folded panel again. */
export function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <StrokeIcon d="M12 5v14M5 12h14" className={className} />;
}

/** Start over: a pencil on a page. */
export function NewChatIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <StrokeIcon
      d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M17.5 3.5l3 3L12 15H9v-3z"
      className={className}
    />
  );
}

/** Settings: a gear. */
export function GearIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <StrokeIcon
      d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 2.5l1.6 2.3 2.8-.5.9 2.7 2.6 1.1-.6 2.8 1.8 2.2-1.8 2.2.6 2.8-2.6 1.1-.9 2.7-2.8-.5L12 21.5l-1.6-2.3-2.8.5-.9-2.7-2.6-1.1.6-2.8L2.9 12l1.8-2.2-.6-2.8 2.6-1.1.9-2.7 2.8.5z"
      className={className}
    />
  );
}
