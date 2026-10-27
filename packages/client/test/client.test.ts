import type { CameraReading, LiveCamera } from "@campus-live/contracts";
import { describe, expect, it } from "vitest";
import { apiUrlProblem, isDemo, isStale, LEVEL_LABEL_TR, mergeReading, valueText } from "../src/index.js";

const reading = (overrides: Partial<CameraReading> = {}): CameraReading => ({
  cameraId: "otopark-a",
  kind: "parking",
  count: 28,
  level: "medium",
  parking: { total: 40, free: 12 },
  source: "simulated",
  measuredAt: "2026-10-27T07:00:00.000Z",
  ...overrides,
});

const camera = (id: string, kind: LiveCamera["kind"]): LiveCamera => ({
  id,
  name: id,
  section: "s",
  kind,
  latitude: 40.74,
  longitude: 30.33,
  reading: null,
  stale: true,
});

describe("mergeReading", () => {
  it("mergeReading replaces only the matching camera and marks it fresh", () => {
    const cameras = [camera("kutuphane-giris", "crowd"), camera("otopark-a", "parking")];
    const merged = mergeReading(cameras, reading());
    expect(merged[1]).toMatchObject({ id: "otopark-a", stale: false, reading: reading() });
    expect(merged[0]).toBe(cameras[0]);
  });

  it("ignores a reading for an unknown camera", () => {
    const cameras = [camera("kutuphane-giris", "crowd")];
    expect(mergeReading(cameras, reading())).toEqual(cameras);
  });
});

describe("isStale", () => {
  it("isStale after staleAfterMs", () => {
    const r = reading();
    expect(isStale(r, new Date("2026-10-27T07:00:14.999Z"), 15_000)).toBe(false);
    expect(isStale(r, new Date("2026-10-27T07:00:15.001Z"), 15_000)).toBe(true);
    expect(isStale(null, new Date(), 15_000)).toBe(true);
  });
});

describe("presentation", () => {
  it("labels levels in Turkish", () => {
    expect(LEVEL_LABEL_TR).toEqual({ low: "Az", medium: "Orta", high: "Yoğun" });
  });

  it("isDemo for every source but camera", () => {
    expect(isDemo(reading({ source: "simulated" }))).toBe(true);
    expect(isDemo(reading({ source: "demo-footage" }))).toBe(true);
    expect(isDemo(reading({ source: "camera" }))).toBe(false);
  });

  it("shows free slots for parking and a count otherwise", () => {
    expect(valueText(reading())).toBe("12/40 boş");
    expect(valueText(reading({ kind: "crowd", parking: undefined, count: 7 }))).toBe("7 kişi");
    expect(valueText(reading({ kind: "traffic", parking: undefined, count: 9 }))).toBe("9 araç");
  });
});

describe("apiUrlProblem", () => {
  it("apiUrlProblem flags localhost on a phone", () => {
    expect(apiUrlProblem("http://localhost:4000", "android")).toMatch(/localhost/);
    expect(apiUrlProblem("http://127.0.0.1:4000", "ios")).toMatch(/localhost/);
    expect(apiUrlProblem("http://192.168.1.20:4000", "android")).toBeNull();
    expect(apiUrlProblem("http://localhost:4000", "web")).toBeNull();
    expect(apiUrlProblem("", "ios")).toMatch(/EXPO_PUBLIC_API_URL/);
  });
});
