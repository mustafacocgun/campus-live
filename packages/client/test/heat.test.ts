import type { DensityCell } from "@campus-live/contracts";
import { describe, expect, it } from "vitest";
import { heatGeoJSON, lerpCells } from "../src/index.js";

describe("lerpCells", () => {
  const cell = (lat: number, weight: number): DensityCell => ({ lat, lng: 30.3321, weight });

  it("lerp halfway averages weights and fades new cells in", () => {
    const halfway = lerpCells([cell(40.7421, 2)], [cell(40.7421, 4), cell(40.7425, 2)], 0.5);
    expect(halfway).toHaveLength(2);
    expect(halfway).toContainEqual(cell(40.7421, 3));
    expect(halfway).toContainEqual(cell(40.7425, 1));
  });

  it("drops cells that have faded to nothing visible", () => {
    // Glides restart with every reading, often before they end: faded cells must not pile up.
    expect(lerpCells([cell(40.7421, 1)], [], 0.995)).toEqual([]);
    expect(lerpCells([cell(40.7421, 0.009)], [cell(40.7421, 0.009)], 0.5)).toEqual([]);
  });

  it("fades vanishing cells out and drops them at the end", () => {
    expect(lerpCells([cell(40.7421, 2)], [], 0.5)).toEqual([cell(40.7421, 1)]);
    expect(lerpCells([cell(40.7421, 2)], [], 1)).toEqual([]);
  });
});

describe("map layers", () => {
  it("turns cells into weighted points", () => {
    expect(heatGeoJSON([{ lat: 40.7421, lng: 30.3321, weight: 2 }])).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [30.3321, 40.7421] },
          properties: { weight: 2 },
        },
      ],
    });
  });
});
