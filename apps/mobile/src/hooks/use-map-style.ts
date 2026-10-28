import { darkStyle } from "@campus-live/client";
import { useEffect, useState } from "react";

/** A MapLibre style: the style JSON, or its URL. */
export type MapStyle = object | string;

// OpenFreeMap Liberty (D24), as on the web: free, no key; MapLibre shows the attribution its terms
// require. Dark mode is the same style darkened by darkStyle, so it keeps its colors.
export const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * The map style for the theme, or null until it is known. Liberty's JSON is fetched once so the dark
 * copy can be made; if that fails, the light style by URL, so the map still opens.
 */
export function useMapStyle(dark: boolean): MapStyle | null {
  const [styles, setStyles] = useState<{ light: MapStyle; dark: MapStyle } | "url" | null>(null);
  useEffect(() => {
    let live = true;
    fetch(STYLE_URL)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
      )
      .then((light: { layers: { paint?: object }[] }) => {
        if (live) setStyles({ light, dark: darkStyle(light) });
      })
      .catch(() => live && setStyles("url"));
    return () => {
      live = false;
    };
  }, []);
  if (styles === "url") return STYLE_URL;
  return styles && (dark ? styles.dark : styles.light);
}
