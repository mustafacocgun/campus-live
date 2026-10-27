import type { DensityCell, LiveCamera } from "@campus-live/contracts";
import { describe, expect, it } from "vitest";
import {
  cameraCone,
  camerasGeoJSON,
  conesGeoJSON,
  heatGeoJSON,
  LEVEL_COLOR,
  lerpCells,
  mergeCells,
} from "../src/index.js";

const M_PER_DEG = 111_320;

function camera(id: string, cells: DensityCell[] | null, stale = false): LiveCamera {
  return {
    id,
    name: id,
    section: "s",
    kind: "crowd",
    latitude: 40.742,
    longitude: 30.332,
    heading: 0,
    fovDeg: 60,
    rangeM: 40,
    stale,
    ageMs: stale ? 60_000 : 1_000,
    reading:
      cells === null
        ? null
        : {
            cameraId: id,
            kind: "crowd",
            count: cells.length,
            level: "low",
            cells,
            source: "demo-footage",
            measuredAt: "2026-10-27T07:00:00Z",
          },
  };
}

describe("mergeCells", () => {
  it("merges overlapping cells by max weight", () => {
    // Two views of one plaza see the same people: the busier view wins, the counts never add up.
    const a = camera("a", [
      { lat: 40.7421, lng: 30.3321, weight: 1.5 },
      { lat: 40.7422, lng: 30.3321, weight: 0.4 },
    ]);
    const b = camera("b", [{ lat: 40.7421, lng: 30.3321, weight: 2 }]);
    const merged = mergeCells([a, b]);
    expect(merged).toHaveLength(2);
    expect(merged).toContainEqual({ lat: 40.7421, lng: 30.3321, weight: 2 });
    expect(merged).toContainEqual({ lat: 40.7422, lng: 30.3321, weight: 0.4 });
  });

  it("excludes cells from stale cameras", () => {
    const silent = camera("a", [{ lat: 40.7421, lng: 30.3321, weight: 3 }], true);
    const live = camera("b", [{ lat: 40.7425, lng: 30.3321, weight: 1 }]);
    expect(mergeCells([silent, live])).toEqual([{ lat: 40.7425, lng: 30.3321, weight: 1 }]);
  });
});

describe("cameraCone", () => {
  const offset = ([lng, lat]: [number, number]) => ({
    east: (lng - 30.332) * M_PER_DEG * Math.cos((40.742 * Math.PI) / 180),
    north: (lat - 40.742) * M_PER_DEG,
  });

  it("cone of a north-facing camera opens northwards", () => {
    const ring = cameraCone(camera("a", null), 12);
    expect(ring[0]).toEqual([30.332, 40.742]); // starts at the camera ...
    expect(ring.at(-1)).toEqual(ring[0]); // ... and closes there
    const arc = ring.slice(1, -1).map(offset);
    expect(arc).toHaveLength(13);
    for (const point of arc) expect(Math.hypot(point.east, point.north)).toBeCloseTo(40, 6);
    expect(arc[0].east).toBeCloseTo(-20, 6); // the left edge: heading - 30 degrees
    expect(arc[6]).toEqual({ east: expect.closeTo(0, 6), north: expect.closeTo(40, 6) });
    expect(arc[12].east).toBeCloseTo(20, 6);
  });

  it("turns with the heading", () => {
    const arc = cameraCone({ ...camera("a", null), heading: 90 }, 12)
      .slice(1, -1)
      .map(offset);
    expect(arc[6]).toEqual({ east: expect.closeTo(40, 6), north: expect.closeTo(0, 6) });
  });
});

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

  it("draws each camera in its level's color, grey without a fresh reading", () => {
    const [live, silent] = camerasGeoJSON([camera("a", []), camera("b", [], true)]).features;
    expect(live.geometry.coordinates).toEqual([30.332, 40.742]);
    expect(live.properties).toEqual({ id: "a", name: "a", color: LEVEL_COLOR.low, stale: false });
    expect(silent.properties).toMatchObject({ color: LEVEL_COLOR.stale, stale: true });
  });

  it("gives every camera its cone, colored like its dot", () => {
    const [cone] = conesGeoJSON([camera("a", [])]).features;
    expect(cone.geometry).toEqual({ type: "Polygon", coordinates: [cameraCone(camera("a", []))] });
    expect(cone.properties).toEqual({ id: "a", color: LEVEL_COLOR.low });
  });
});
