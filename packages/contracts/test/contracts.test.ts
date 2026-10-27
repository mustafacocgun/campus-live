import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AssistantRequest, CameraReading, jsonSchemas } from "../src/index.js";

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
