import type { LiveCamera } from "@campus-live/contracts";
import type { ReactNode } from "react";
import { CameraIcon, GridIcon } from "./icons";

/** "Tümü" plus one chip per section the registry actually has; nothing invented (CLAUDE.md §0.5). */
export function FilterChips({
  cameras,
  value,
  onChange,
}: {
  cameras: LiveCamera[];
  value: string | null;
  onChange: (section: string | null) => void;
}) {
  const sections = [...new Map(cameras.map((camera) => [camera.section, camera])).values()];
  if (!sections.length) return null;
  const chip = (key: string, label: string, icon: ReactNode, section: string | null) => {
    const active = value === section;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(section)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
          active
            ? "border-accent bg-accent text-accent-foreground shadow-lg shadow-accent/25"
            : "border-line bg-surface hover:border-accent/60"
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };
  return (
    <nav aria-label="Bölüme göre süz" className="flex flex-wrap gap-2">
      {chip("all", "Tümü", <GridIcon />, null)}
      {sections.map((camera) =>
        chip(
          camera.section,
          camera.section,
          <CameraIcon camera={camera} className="h-4 w-4" />,
          camera.section,
        ),
      )}
    </nav>
  );
}
