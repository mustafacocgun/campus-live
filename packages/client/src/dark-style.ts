/**
 * A dark version of a light map style (OpenFreeMap Liberty, D24) that keeps its colors: parks stay
 * green and water blue, only darker, so the dark map is as colorful as the light one. Plain JSON in and
 * out, so the web and the phones can both use it.
 */

/** A color as hue (degrees), saturation, lightness (0 to 1) and alpha. */
export interface Hsla {
  h: number;
  s: number;
  l: number;
  a: number;
}

const NUMBERS = /^(rgba?|hsla?)\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*([\d.]+)\s*)?\)$/;

function fromRgb(r: number, g: number, b: number, a: number): Hsla {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l, a };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l, a };
}

/** A style's color string (#rgb, #rrggbb, rgb(), rgba(), hsl(), hsla()), or null for anything else. */
export function parseColor(text: string): Hsla | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c) : hex[1].match(/../g)!;
    const [r, g, b] = digits.map((pair) => parseInt(pair, 16) / 255);
    return fromRgb(r, g, b, 1);
  }
  const match = NUMBERS.exec(text.trim());
  if (!match) return null;
  const [, fn, x, y, z, alpha] = match;
  const a = alpha === undefined ? 1 : Number(alpha);
  if (fn.startsWith("rgb")) return fromRgb(Number(x) / 255, Number(y) / 255, Number(z) / 255, a);
  return { h: Number(x), s: Number(y) / 100, l: Number(z) / 100, a };
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const format = ({ h, s, l, a }: Hsla) =>
  `hsla(${round(h, 1)}, ${round(s * 100, 1)}%, ${round(l * 100, 1)}%, ${round(a, 3)})`;

// New lightness per role. Ground (land, water, buildings) goes dark in the same order it had; lines
// (roads, rivers) stay lighter than the ground; text turns light and its halo dark.
const SHADES = {
  ground: (l: number) => 0.07 + (1 - l) * 0.75,
  line: (l: number) => 0.16 + l * 0.28,
  text: (l: number) => 0.92 - l * 0.45,
  halo: (l: number) => 0.06 + (1 - l) * 0.3,
};
type Role = keyof typeof SHADES;

const ROLES: Record<string, Role> = {
  "background-color": "ground",
  "fill-color": "ground",
  "fill-outline-color": "ground",
  "fill-extrusion-color": "ground",
  "circle-color": "ground",
  "line-color": "line",
  "circle-stroke-color": "line",
  "text-color": "text",
  "icon-color": "text",
  "text-halo-color": "halo",
  "icon-halo-color": "halo",
};

/** Every color in a paint value, including inside expressions, in its dark shade. */
function shade(value: unknown, role: Role): unknown {
  if (Array.isArray(value)) return value.map((item) => shade(item, role));
  if (typeof value !== "string") return value;
  const color = parseColor(value);
  return color ? format({ ...color, l: SHADES[role](color.l) }) : value;
}

/** A dark copy of a map style; the style given is left as it is. */
export function darkStyle<T extends { layers: { paint?: object }[] }>(style: T): T {
  const copy = JSON.parse(JSON.stringify(style)) as T;
  for (const layer of copy.layers) {
    const paint = layer.paint as Record<string, unknown> | undefined;
    if (!paint) continue;
    for (const [property, value] of Object.entries(paint)) {
      const role = ROLES[property];
      if (role) paint[property] = shade(value, role);
    }
  }
  return copy;
}
