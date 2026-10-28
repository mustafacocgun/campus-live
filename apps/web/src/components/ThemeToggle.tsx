"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, currentTheme, storedTheme, watchTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/**
 * Light or dark, one tap; remembered in this browser. Until it is used, the page follows the system,
 * and keeps following it when the system switches.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Null on the server: the button's icon waits for the theme the head script set.
  const theme = useSyncExternalStore(watchTheme, currentTheme, () => null);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_DARK);
    const follow = () => {
      if (!storedTheme()) applyTheme(null);
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => applyTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"}
      title={dark ? "Açık tema" : "Koyu tema"}
      className={`grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      {theme === null ? null : dark ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
