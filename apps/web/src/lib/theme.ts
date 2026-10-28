/**
 * The page theme: light or dark, chosen by the user and remembered in this browser, or the system's
 * while nothing is chosen. It lives on <html data-theme>, which the inline script in layout.tsx sets
 * before the first paint, so the page never flashes the other theme.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "campus-live-theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** The remembered choice, or null to follow the system. Storage can be blocked: then null. */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Shows a theme: the chosen one (remembered), or the system's when `choice` is null. */
export function applyTheme(choice: Theme | null): void {
  try {
    if (choice) localStorage.setItem(THEME_KEY, choice);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Not remembered; still shown.
  }
  const theme = choice ?? (window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
}

/** Calls `onChange` whenever the shown theme changes; returns the unsubscribe function. */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * The shown theme as the map reads it, shaped like the MediaQueryList it used before: `matches` is
 * true in dark, and "change" fires when the theme switches.
 */
export function darkThemeQuery(): Pick<
  MediaQueryList,
  "matches" | "addEventListener" | "removeEventListener"
> {
  const target = new EventTarget();
  let stop: (() => void) | null = null;
  return {
    get matches() {
      return currentTheme() === "dark";
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      target.addEventListener(type, listener);
      stop ??= watchTheme(() => target.dispatchEvent(new Event("change")));
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      target.removeEventListener(type, listener);
      stop?.();
      stop = null;
    },
  } as Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;
}

/** Inline in <head>: the theme before the first paint. Kept tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("${SYSTEM_DARK}").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;
