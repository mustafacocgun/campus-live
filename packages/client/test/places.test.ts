import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type CampusMap, type LiveSnapshot, SOCKET_EVENTS } from "@campus-live/contracts";
import { Server } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildingsGeoJSON,
  campusMaskGeoJSON,
  joinPlaces,
  labelsGeoJSON,
  LEVEL_COLOR,
  lotsGeoJSON,
  placeColor,
  placeValueText,
  type PlaceView,
  type PlacesState,
  roadsGeoJSON,
  startPlacesFeed,
} from "../src/index.js";

const SQUARE: [number, number][] = [
  [30.33, 40.74],
  [30.331, 40.74],
  [30.331, 40.741],
  [30.33, 40.741],
  [30.33, 40.74],
];

const MAP: CampusMap = {
  campus: {
    name: "Test kampüsü",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [30.32, 40.73],
          [30.34, 40.73],
          [30.34, 40.75],
          [30.32, 40.75],
          [30.32, 40.73],
        ],
      ],
    },
  },
  places: [
    {
      id: "kafe-alani",
      name: "Merkez kafe",
      section: "Kafeler",
      kind: "area",
      geometry: { type: "Point", coordinates: [30.332, 40.742] },
    },
    {
      id: "kutuphane",
      name: "Kütüphane",
      section: "Kütüphane",
      kind: "building",
      geometry: { type: "Polygon", coordinates: [SQUARE] },
    },
    {
      id: "a-otoparki",
      name: "Otopark A",
      section: "Otoparklar",
      kind: "parking",
      geometry: { type: "Polygon", coordinates: [SQUARE] },
    },
    {
      id: "ana-yol",
      name: "Ana yol",
      section: "Yollar",
      kind: "road",
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [30.33, 40.73],
            [30.331, 40.73],
          ],
          [
            [30.335, 40.735],
            [30.336, 40.735],
            [30.337, 40.735],
            [30.338, 40.735],
          ],
        ],
      },
    },
  ],
};

const snapshot = (at: string, count = 7): LiveSnapshot => ({
  places: [
    { id: "kafe-alani", count, level: "medium", parking: null, stale: false, ageMs: 1_000, demo: true },
    { id: "kutuphane", count: 35, level: "high", parking: null, stale: false, ageMs: 1_000, demo: true },
    {
      id: "a-otoparki",
      count: 28,
      level: "medium",
      parking: { total: 40, free: 12 },
      stale: false,
      ageMs: 1_000,
      demo: true,
    },
    { id: "ana-yol", count: null, level: null, parking: null, stale: true, ageMs: null, demo: true },
  ],
  cells: [{ lat: 40.742, lng: 30.332, weight: 1.5 }],
  at,
});

const placeOf = (places: PlaceView[], id: string) => places.find((place) => place.id === id)!;

describe("joinPlaces", () => {
  it("gives each place its live state", () => {
    const places = joinPlaces(MAP.places, snapshot("2026-10-28T09:00:00.000Z"));
    expect(placeOf(places, "a-otoparki")).toMatchObject({
      name: "Otopark A",
      kind: "parking",
      parking: { total: 40, free: 12 },
      stale: false,
    });
    expect(placeOf(places, "ana-yol")).toMatchObject({ stale: true, count: null });
  });

  it("shows a place without a state, or every place without a snapshot, as stale", () => {
    const partial = { ...snapshot("2026-10-28T09:00:00.000Z"), places: [] };
    for (const places of [joinPlaces(MAP.places, partial), joinPlaces(MAP.places, null)]) {
      expect(places).toHaveLength(4);
      expect(places.every((place) => place.stale && place.count === null && place.level === null)).toBe(true);
    }
  });
});

describe("place text and layers", () => {
  const places = joinPlaces(MAP.places, snapshot("2026-10-28T09:00:00.000Z"));

  it("says free slots for a lot, vehicles for a road and people otherwise", () => {
    expect(placeValueText(placeOf(places, "a-otoparki"))).toBe("12/40 boş");
    expect(placeValueText(placeOf(places, "kafe-alani"))).toBe("7 kişi");
    expect(placeValueText({ ...placeOf(places, "ana-yol"), stale: false, count: 6, level: "high" })).toBe(
      "6 araç",
    );
    expect(placeValueText(placeOf(places, "ana-yol"))).toBe("Görüntü yok");
    // Stale wins over any number or level a stale state might still carry.
    const stale = { ...placeOf(places, "kafe-alani"), stale: true };
    expect(placeValueText(stale)).toBe("Görüntü yok");
    expect(placeColor(stale)).toBe(LEVEL_COLOR.stale);
  });

  it("draws buildings, lots and roads in their level's color, grey when stale", () => {
    const [building] = buildingsGeoJSON(places).features;
    expect(building.properties).toMatchObject({ id: "kutuphane", color: LEVEL_COLOR.high });
    expect(building.geometry.type).toBe("Polygon");
    const [lot] = lotsGeoJSON(places).features;
    expect(lot.properties).toMatchObject({ id: "a-otoparki", color: LEVEL_COLOR.medium });
    const [road] = roadsGeoJSON(places).features;
    expect(road.properties).toMatchObject({ id: "ana-yol", color: LEVEL_COLOR.stale, stale: true });
    expect(road.geometry.type).toBe("MultiLineString");
  });

  it("stands a building's walls just outside its footprint, at the height it is given", () => {
    const [building] = buildingsGeoJSON(places, new Map([["kutuphane", 18]])).features;
    expect(building.properties.height).toBe(18);
    const ring = building.geometry.coordinates[0];
    // Every corner moves away from the middle, by well under a metre (1e-5° ≈ 1 m).
    for (const [i, [lng, lat]] of ring.entries()) {
      const [x, y] = SQUARE[i];
      expect(Math.abs(lng - 30.3305)).toBeGreaterThan(Math.abs(x - 30.3305));
      expect(Math.abs(lat - 40.7405)).toBeGreaterThan(Math.abs(y - 40.7405));
      expect(Math.abs(lng - x) + Math.abs(lat - y)).toBeLessThan(2e-5);
    }
    expect(buildingsGeoJSON(places).features[0].properties.height).toBeGreaterThan(0);
  });

  it("labels every place once, with its name and value", () => {
    const labels = labelsGeoJSON(places).features;
    expect(labels.map((label) => label.properties.id)).toEqual([
      "kafe-alani",
      "kutuphane",
      "a-otoparki",
      "ana-yol",
    ]);
    expect(placeOf(labels.map((label) => label.properties) as never, "a-otoparki")).toMatchObject({
      name: "Otopark A",
      value: "12/40 boş",
    });
    expect(labels[0].geometry.coordinates).toEqual([30.332, 40.742]); // an area: its own point
    expect(labels[1].geometry.coordinates[0]).toBeCloseTo(30.3305, 6); // a footprint: its middle
    expect(labels[3].geometry.coordinates).toEqual([30.336, 40.735]); // a road: its longest part
  });

  it("masks everything but the campus", () => {
    const mask = campusMaskGeoJSON(MAP.campus);
    expect(mask.geometry.coordinates).toHaveLength(2);
    expect(mask.geometry.coordinates[1]).toEqual(MAP.campus.geometry.coordinates[0]);
  });
});

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((stop) => stop()));

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** A stand-in API: GET /api/places, GET /api/live and Socket.IO, on a given port. */
async function startApi(port: number, live: () => LiveSnapshot = () => snapshot(new Date().toISOString())) {
  const server = createServer((req, res) => {
    const data = req.url === "/api/places" ? MAP : req.url === "/api/live" ? live() : null;
    res
      .writeHead(data ? 200 : 404, { "content-type": "application/json" })
      .end(
        JSON.stringify(
          data ? { success: true, data } : { success: false, error: { code: "x", message: "x" } },
        ),
      );
  });
  const io = new Server(server);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  cleanup.push(() => {
    io.close();
    server.close();
  });
  return io;
}

function waitFor(
  states: PlacesState[],
  check: (state: PlacesState) => boolean,
  ms: number,
): Promise<PlacesState> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const poll = setInterval(() => {
      const hit = states.find(check);
      if (hit || Date.now() > deadline) {
        clearInterval(poll);
        if (hit) resolve(hit);
        else reject(new Error(`no matching state in ${ms} ms; last: ${JSON.stringify(states.at(-1))}`));
      }
    }, 50);
  });
}

const kafe = (state: PlacesState) => state.places.find((place) => place.id === "kafe-alani");

describe("startPlacesFeed", () => {
  it("loads the map and the live state, then applies pushed snapshots", async () => {
    const port = await freePort();
    const io = await startApi(port);
    const states: PlacesState[] = [];
    cleanup.push(startPlacesFeed(`http://127.0.0.1:${port}`, (state) => states.push(state)));
    const loaded = await waitFor(states, (state) => state.connected && kafe(state)?.count === 7, 5_000);
    expect(loaded.campus?.name).toBe("Test kampüsü");
    expect(loaded.cells).toHaveLength(1);
    io.emit(SOCKET_EVENTS.live, snapshot(new Date(Date.now() + 1_000).toISOString(), 9));
    await waitFor(states, (state) => kafe(state)?.count === 9, 3_000);
  }, 15_000);

  it("re-syncs when the API comes up after the first fetch failed", async () => {
    const port = await freePort();
    const states: PlacesState[] = [];
    cleanup.push(startPlacesFeed(`http://127.0.0.1:${port}`, (state) => states.push(state)));
    await waitFor(states, (state) => state.error !== null, 3_000); // nothing listens yet
    await startApi(port);
    const synced = await waitFor(states, (state) => state.places.length === 4, 8_000);
    expect(synced.error).toBeNull();
  }, 15_000);

  it("never lets an older snapshot replace a newer one", async () => {
    const port = await freePort();
    const io = await startApi(port, () => snapshot("2026-10-28T09:00:00.000Z"));
    const states: PlacesState[] = [];
    cleanup.push(startPlacesFeed(`http://127.0.0.1:${port}`, (state) => states.push(state)));
    await waitFor(states, (state) => state.connected && kafe(state)?.count === 7, 5_000);
    io.emit(SOCKET_EVENTS.live, snapshot("2026-10-28T09:00:05.000Z", 9));
    await waitFor(states, (state) => kafe(state)?.count === 9, 3_000);
    io.emit(SOCKET_EVENTS.live, snapshot("2026-10-28T09:00:03.000Z", 4));
    io.emit(SOCKET_EVENTS.live, snapshot("2026-10-28T09:00:06.000Z", 11));
    await waitFor(states, (state) => kafe(state)?.count === 11, 3_000);
    expect(states.some((state) => kafe(state)?.count === 4)).toBe(false);
  }, 15_000);

  it("greys every place out and drops the heat when snapshots stop arriving", async () => {
    const port = await freePort();
    await startApi(port);
    const states: PlacesState[] = [];
    // A 300 ms limit instead of 15 s, checked every 100 ms; the stand-in API never pushes.
    cleanup.push(startPlacesFeed(`http://127.0.0.1:${port}`, (state) => states.push(state), 100, 300));
    const live = await waitFor(states, (state) => kafe(state)?.count === 7, 5_000);
    // Only after the live state: before the first snapshot every place is stale anyway.
    const silent = await waitFor(
      states,
      (state) =>
        states.indexOf(state) > states.indexOf(live) && state.places.length === 4 && kafe(state)!.stale,
      3_000,
    );
    expect(silent.places.every((place) => place.stale)).toBe(true);
    expect(silent.cells).toEqual([]);
  }, 15_000);
});
