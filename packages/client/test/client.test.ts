import type { CameraReading, LiveCamera } from "@campus-live/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiUrlProblem,
  askAssistant,
  isDemo,
  isStaleSince,
  LEVEL_LABEL_TR,
  mergeReading,
  valueText,
} from "../src/index.js";

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
  ageMs: null,
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

describe("isStaleSince", () => {
  it("is stale when the last reading arrived more than staleAfterMs ago, by this device's clock", () => {
    const received = Date.parse("2026-10-27T07:00:00.000Z");
    expect(isStaleSince(received, received + 14_999, 15_000)).toBe(false);
    expect(isStaleSince(received, received + 15_001, 15_000)).toBe(true);
    expect(isStaleSince(null, received, 15_000)).toBe(true);
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

describe("askAssistant errors (#11)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, status: number, contentType: string) =>
    vi.stubGlobal("fetch", async () => new Response(body, { status, headers: { "content-type": contentType } }));

  it("turns an HTML error page into a Turkish message, not a JSON parse error", async () => {
    respond("<html><body>502 Bad Gateway</body></html>", 502, "text/html");
    await expect(askAssistant("http://api", "soru")).rejects.toThrow("API beklenmeyen bir yanıt verdi (HTTP 502).");
  });

  it("turns an unreachable API into a Turkish message", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(askAssistant("http://api", "soru")).rejects.toThrow("API'ye ulaşılamadı.");
  });

  it("keeps the API's own error message", async () => {
    respond(JSON.stringify({ success: false, error: { message: "Çok fazla istek." } }), 429, "application/json");
    await expect(askAssistant("http://api", "soru")).rejects.toThrow("Çok fazla istek.");
  });

  it("returns the data of a successful response", async () => {
    const data = { answer: "Otopark A: 12 boş yer.", via: "fallback" };
    respond(JSON.stringify({ success: true, data }), 200, "application/json; charset=utf-8");
    await expect(askAssistant("http://api", "soru")).resolves.toEqual(data);
  });
});
