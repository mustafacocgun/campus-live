import { describe, expect, it } from "vitest";
import { darkStyle, parseColor } from "../src/index.js";

const lightness = (color: string) => parseColor(color)!.l;
const hue = (color: string) => parseColor(color)!.h;

describe("parseColor", () => {
  it("reads the color notations of a map style", () => {
    expect(parseColor("#fff")).toEqual({ h: 0, s: 0, l: 1, a: 1 });
    expect(parseColor("#f8f4f0")?.l).toBeCloseTo(0.957, 3);
    expect(parseColor("rgba(95, 208, 100, 0.5)")?.a).toBe(0.5);
    expect(parseColor("hsl(75,37%,81%)")).toEqual({ h: 75, s: 0.37, l: 0.81, a: 1 });
    expect(parseColor("hsla(0,3%,85%,0.84)")?.a).toBe(0.84);
    expect(parseColor("rgb(158,189,255)")?.h).toBeCloseTo(221, 0);
  });

  it("leaves anything else alone", () => {
    for (const text of ["interpolate", "zoom", "Noto Sans Regular", "#ggg", ""])
      expect(parseColor(text)).toBeNull();
  });
});

describe("darkStyle", () => {
  const style = {
    version: 8,
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
      { id: "water", type: "fill", paint: { "fill-color": "rgb(158,189,255)" } },
      {
        id: "park",
        type: "fill",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["zoom"], 9, "hsla(98,61%,72%,0.7)", 12, "#d8e8c8"],
          "fill-opacity": 0.7,
        },
      },
      { id: "road", type: "line", paint: { "line-color": "#fff" } },
      { id: "casing", type: "line", paint: { "line-color": "#cfcdca" } },
      {
        id: "label",
        type: "symbol",
        layout: { "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#333", "text-halo-color": "#fff" },
      },
    ],
  };
  const dark = darkStyle(style);
  const paint = (id: string) =>
    dark.layers.find((layer) => layer.id === id)!.paint as Record<string, unknown>;

  it("turns the ground dark and keeps each color's hue", () => {
    expect(lightness(paint("background")["background-color"] as string)).toBeLessThan(0.15);
    const water = paint("water")["fill-color"] as string;
    expect(lightness(water)).toBeLessThan(0.3);
    expect(hue(water)).toBeCloseTo(221, 0);
  });

  it("keeps roads lighter than the ground and casings darker than roads", () => {
    const road = lightness(paint("road")["line-color"] as string);
    expect(road).toBeGreaterThan(lightness(paint("background")["background-color"] as string) + 0.2);
    expect(lightness(paint("casing")["line-color"] as string)).toBeLessThan(road);
  });

  it("turns dark text light and light halos dark", () => {
    expect(lightness(paint("label")["text-color"] as string)).toBeGreaterThan(0.75);
    expect(lightness(paint("label")["text-halo-color"] as string)).toBeLessThan(0.15);
  });

  it("changes colors inside expressions and nothing else", () => {
    const [op, curve, zoom, z1, low, z2, high] = paint("park")["fill-color"] as unknown[];
    expect([op, curve, zoom, z1, z2]).toEqual(["interpolate", ["linear"], ["zoom"], 9, 12]);
    expect(lightness(low as string)).toBeLessThan(0.35);
    expect(parseColor(low as string)?.a).toBeCloseTo(0.7);
    expect(lightness(high as string)).toBeLessThan(0.35);
    expect(paint("park")["fill-opacity"]).toBe(0.7);
    expect(dark.layers.at(-1)!.layout).toEqual({ "text-font": ["Noto Sans Regular"] });
  });

  it("leaves the style it was given untouched", () => {
    expect(style.layers[0].paint["background-color"]).toBe("#f8f4f0");
  });
});
