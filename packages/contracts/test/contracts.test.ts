import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AssistantRequest,
  AssistantResponse,
  Camera,
  CameraReading,
  CampusMap,
  jsonSchemas,
  LiveSnapshot,
  Place,
} from "../src/index.js";

const crowd = {
  cameraId: "kutuphane-giris",
  kind: "crowd",
  count: 12,
  level: "medium",
  source: "simulated",
  measuredAt: "2026-10-27T07:00:00Z",
};

const parking = {
  cameraId: "otopark-a",
  kind: "parking",
  count: 28,
  level: "medium",
  parking: { total: 40, free: 12 },
  source: "demo-footage",
  // Python's pydantic sends microseconds.
  measuredAt: "2026-10-27T07:00:00.123456Z",
};

describe("CameraReading", () => {
  it("accepts a crowd reading", () => {
    expect(CameraReading.safeParse(crowd).success).toBe(true);
  });

  it("accepts a parking reading with microsecond time", () => {
    expect(CameraReading.safeParse(parking).success).toBe(true);
  });

  it("rejects parking data on a crowd camera", () => {
    expect(CameraReading.safeParse({ ...crowd, parking: { total: 10, free: 2 } }).success).toBe(false);
  });

  it("rejects a parking reading without parking data", () => {
    const { parking: _omitted, ...withoutParking } = parking;
    expect(CameraReading.safeParse(withoutParking).success).toBe(false);
  });

  it("rejects free > total", () => {
    expect(CameraReading.safeParse({ ...parking, parking: { total: 10, free: 11 } }).success).toBe(false);
  });

  it("rejects a negative count", () => {
    expect(CameraReading.safeParse({ ...crowd, count: -1 }).success).toBe(false);
  });

  it("rejects a non-ISO or non-UTC measuredAt", () => {
    expect(CameraReading.safeParse({ ...crowd, measuredAt: "27.10.2026 10:00" }).success).toBe(false);
    expect(CameraReading.safeParse({ ...crowd, measuredAt: "2026-10-27T10:00:00+03:00" }).success).toBe(
      false,
    );
  });
});

describe("density cells and camera pose", () => {
  const cells = [{ lat: 40.742, lng: 30.332, weight: 1.5 }];

  it("accepts cells on a crowd reading", () => {
    expect(CameraReading.safeParse({ ...crowd, cells }).success).toBe(true);
  });

  it("rejects cells on a parking reading", () => {
    expect(CameraReading.safeParse({ ...parking, cells }).success).toBe(false);
  });

  it("rejects a negative cell weight", () => {
    expect(CameraReading.safeParse({ ...crowd, cells: [{ ...cells[0], weight: -0.1 }] }).success).toBe(false);
  });

  it("rejects a heading of 360 and accepts 359.9", () => {
    const camera = {
      id: "kutuphane-onu",
      name: "Kütüphane önü",
      section: "Kütüphane",
      kind: "crowd",
      latitude: 40.7417,
      longitude: 30.3321,
      fovDeg: 70,
      rangeM: 35,
    };
    expect(Camera.safeParse({ ...camera, heading: 360 }).success).toBe(false);
    expect(Camera.safeParse({ ...camera, heading: 359.9 }).success).toBe(true);
  });
});

describe("AssistantRequest", () => {
  it("trims assistant messages and rejects empty or over-500", () => {
    expect(AssistantRequest.parse({ message: "  Otoparkta boş yer var mı?  " }).message).toBe(
      "Otoparkta boş yer var mı?",
    );
    expect(AssistantRequest.safeParse({ message: "   " }).success).toBe(false);
    expect(AssistantRequest.safeParse({ message: "a".repeat(501) }).success).toBe(false);
  });
});

describe("JSON Schema for the vision service", () => {
  it("committed JSON Schemas match the zod schemas", () => {
    for (const [name, schema] of Object.entries(jsonSchemas())) {
      const committed: unknown = JSON.parse(readFileSync(`schemas/${name}.schema.json`, "utf8"));
      expect(committed, `schemas/${name}.schema.json is stale: run npm run schemas`).toEqual(schema);
    }
  });
});

describe("places and live snapshots", () => {
  const library = {
    id: "kutuphane",
    name: "Kütüphane",
    section: "Kütüphane",
    kind: "building",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [30.3318, 40.7415],
          [30.3324, 40.7415],
          [30.3324, 40.7419],
          [30.3318, 40.7415],
        ],
      ],
    },
  };
  const live = {
    id: "kutuphane",
    count: 41,
    level: "high",
    parking: null,
    stale: false,
    ageMs: 1_200,
    demo: true,
  };

  it("accepts a live snapshot of places' states and the merged heat", () => {
    const snapshot = {
      places: [live],
      cells: [{ lat: 40.742, lng: 30.332, weight: 1 }],
      at: "2026-10-28T07:00:00Z",
    };
    expect(LiveSnapshot.safeParse(snapshot).success).toBe(true);
    // Each second carries state only: the shapes come once, with the campus map.
    expect(
      LiveSnapshot.parse({ ...snapshot, places: [{ ...library, ...live }] }).places[0],
    ).not.toHaveProperty("geometry");
  });

  it("accepts the campus map: its outline and every place", () => {
    const map = { campus: { name: "Sakarya Üniversitesi", geometry: library.geometry }, places: [library] };
    expect(CampusMap.safeParse(map).success).toBe(true);
  });

  it("rejects a place geometry that is not a known shape", () => {
    const circle = { ...library, geometry: { type: "Circle", coordinates: [30.332, 40.742] } };
    expect(Place.safeParse(circle).success).toBe(false);
  });

  it("a snapshot schema has no camera fields", () => {
    // Where cameras are never leaves the server (CLAUDE.md §0.2): not even a field for it.
    const names = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "properties" && value && typeof value === "object") {
            Object.keys(value).forEach((name) => names.add(name));
          }
          walk(value);
        }
      }
    };
    walk(z.toJSONSchema(LiveSnapshot));
    walk(z.toJSONSchema(CampusMap));
    expect(names.has("weight")).toBe(true); // the walk reaches nested objects
    for (const forbidden of [
      "cameraId",
      "camera",
      "cameras",
      "latitude",
      "longitude",
      "heading",
      "fovDeg",
      "rangeM",
    ]) {
      expect(names.has(forbidden), forbidden).toBe(false);
    }
  });

  it("a camera names the place it feeds and may be indoor", () => {
    const camera = {
      id: "muhendislik-ic-1",
      name: "Mühendislik iç 1",
      section: "Fakülteler",
      kind: "crowd",
      latitude: 40.7425,
      longitude: 30.3305,
      heading: 90,
      fovDeg: 90,
      rangeM: 15,
      place: "muhendislik",
      indoor: true,
    };
    expect(Camera.parse(camera)).toMatchObject({ place: "muhendislik", indoor: true });
    expect(Camera.safeParse({ ...camera, place: "Mühendislik" }).success).toBe(false);
  });
});

describe("the assistant and the user's location", () => {
  it("takes an optional position with a question, within the earth's ranges", () => {
    const location = { lat: 40.742, lng: 30.332 };
    expect(AssistantRequest.parse({ message: "En yakın otopark?", location }).location).toEqual(location);
    expect(AssistantRequest.parse({ message: "En yakın otopark?" }).location).toBeUndefined();
    expect(AssistantRequest.safeParse({ message: "x", location: { lat: 200, lng: 30 } }).success).toBe(false);
    expect(AssistantRequest.safeParse({ message: "x", location: { lat: 40 } }).success).toBe(false);
  });

  it("answers with the places it is about, for the screen to point at", () => {
    const answer = {
      answer: "Sana en yakın otoparklar…",
      via: "fallback",
      places: [
        { id: "a-otoparki", name: "Otopark A", metres: 130 },
        { id: "tas-kafe", name: "Taş Kafe", metres: null },
      ],
    };
    expect(AssistantResponse.parse(answer).places).toHaveLength(2);
    expect(AssistantResponse.parse({ answer: "x", via: "llm" }).places).toBeUndefined();
  });
});
