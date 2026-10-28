import type { ApiResponse, Camera, CameraReading, Region } from "@campus-live/contracts";
import { describe, expect, it } from "vitest";
import { alertMessage, REARM_MARGIN_PCT, step } from "../src/modules/alerts/alert-engine.js";
import { hashPassword, verifyPassword } from "../src/modules/accounts/passwords.js";
import { isSchoolEmail } from "../src/modules/accounts/school-email.js";
import { readCookie } from "../src/modules/accounts/sessions.js";
import { loadRegistry } from "../src/modules/cameras/camera-registry.js";
import { loadPlaces } from "../src/modules/places/place-registry.js";
import { computeRegions, monitoredPlaces } from "../src/modules/regions/regions.js";
import { capacity, env, ingest, reading, startServer } from "./helpers.js";

const registry = loadRegistry(env.CAMERAS_FILE);
const places = loadPlaces(env.PLACES_FILE).list();
const camera = (id: string) => registry.get(id) as Camera;

type Fresh = Map<string, { camera: Camera; reading: CameraReading }[]>;

/** Fresh readings by place, as LiveStore.freshByPlace gives them: `counts[id]` for each camera given. */
function fresh(counts: Record<string, number>, extra: Camera[] = []): Fresh {
  const byPlace: Fresh = new Map();
  for (const [id, count] of Object.entries(counts)) {
    const each = registry.get(id) ?? (extra.find((cam) => cam.id === id) as Camera);
    const read = reading({
      cameraId: id,
      kind: each.kind,
      count,
      parking: each.kind === "parking" ? { total: 40, free: 40 - count } : undefined,
    });
    const place = each.place as string;
    byPlace.set(place, [...(byPlace.get(place) ?? []), { camera: each, reading: read }]);
  }
  return byPlace;
}

const regions = (counts: Record<string, number>, extra: Camera[] = []) =>
  computeRegions(places, monitoredPlaces(registry), fresh(counts, extra), capacity);
const percentOf = (list: Region[], id: string) => list.find((region) => region.id === id)?.percent;

describe("computeRegions", () => {
  it("makes one region per place a camera feeds, in places.json order, with its kind", () => {
    expect(regions({}).map((region) => [region.id, region.kind])).toEqual([
      ["kutuphane-alani", "area"],
      ["kafe-alani", "area"],
      ["kutuphane-binasi", "building"],
      ["a-otoparki", "parking"],
      ["kampus-ana-caddesi", "road"],
    ]);
  });

  it("leaves out a place that no camera feeds", () => {
    const fed = new Set(["kafe-alani"]);
    expect(computeRegions(places, fed, new Map(), capacity).map((region) => region.id)).toEqual([
      "kafe-alani",
    ]);
  });

  it("divides by the placeholder capacity: the listed one, else the kind's default", () => {
    const list = regions({ "kutuphane-giris": 6, "kafe-merkez": 5, "ana-yol": 4 });
    // kutuphane-giris: crowd default (10); kafe-merkez: listed at 20; ana-yol: traffic default (5).
    expect(percentOf(list, "kutuphane-alani")).toBe(60);
    expect(percentOf(list, "kafe-alani")).toBe(25);
    expect(percentOf(list, "kampus-ana-caddesi")).toBe(80);
  });

  it("uses a parking lot's reported slots", () => {
    expect(percentOf(regions({ "otopark-a": 30 }), "a-otoparki")).toBe(75);
  });

  it("adds a building's cameras up, and a silent one changes nothing", () => {
    const second: Camera = { ...camera("kutuphane-ic"), id: "kutuphane-ic-2" };
    expect(percentOf(regions({ "kutuphane-ic": 5, "kutuphane-ic-2": 3 }, [second]), "kutuphane-binasi")).toBe(
      40,
    );
    // kutuphane-ic-2 falls silent: its people and its capacity both leave the sum.
    expect(percentOf(regions({ "kutuphane-ic": 4 }), "kutuphane-binasi")).toBe(40);
  });

  it("takes an area's fullest camera, since views of an area overlap", () => {
    const wide: Camera = { ...camera("kutuphane-giris"), id: "kutuphane-giris-2" };
    expect(
      percentOf(regions({ "kutuphane-giris": 3, "kutuphane-giris-2": 8 }, [wide]), "kutuphane-alani"),
    ).toBe(80);
  });

  it("has no percent while every camera of the place is silent, and says demo when a reading is", () => {
    expect(regions({}).find((region) => region.id === "kafe-alani")).toMatchObject({
      percent: null,
      demo: false,
    });
    expect(regions({ "kafe-merkez": 2 }).find((region) => region.id === "kafe-alani")?.demo).toBe(true);
  });
});

describe("GET /api/regions", () => {
  it("serves the live percent without an account, and no camera id or capacity", async () => {
    const server = await startServer();
    try {
      await ingest(server.url, {
        readings: [reading({ cameraId: "kutuphane-giris", kind: "crowd", count: 7, parking: undefined })],
      });
      const text = await (await fetch(`${server.url}/api/regions`)).text();
      const body = JSON.parse(text) as ApiResponse<Region[]>;
      expect(body.success && body.data[0]).toEqual({
        id: "kutuphane-alani",
        name: "Kütüphane girişi",
        kind: "area",
        section: "Kütüphane",
        percent: 70,
        demo: true,
      });
      for (const each of registry.list()) expect(text).not.toContain(`"${each.id}"`);
      expect(text).not.toContain("capacity");
    } finally {
      await server.close();
    }
  });

  it("answers the account routes with 503 when there is no database", async () => {
    const server = await startServer();
    try {
      const response = await fetch(`${server.url}/api/auth/me`);
      expect(response.status).toBe(503);
    } finally {
      await server.close();
    }
  });
});

describe("alert engine", () => {
  const below60 = { direction: "below", thresholdPct: 60 } as const;
  const above80 = { direction: "above", thresholdPct: 80 } as const;

  /** Feeds percents through `step` from an unobserved rule; returns the indexes that fired. */
  function fires(rule: typeof below60 | typeof above80, percents: number[]): number[] {
    let armed: boolean | undefined;
    const fired: number[] = [];
    percents.forEach((percent, i) => {
      const result = step(rule, armed, percent);
      armed = result.armed;
      if (result.fire) fired.push(i);
    });
    return fired;
  }

  it("fires once when the place drops below the threshold", () => {
    expect(fires(below60, [70, 65, 59, 50, 40])).toEqual([2]);
  });

  it("never fires on the first look, even when the place is already past the threshold", () => {
    expect(fires(below60, [40, 30, 20])).toEqual([]);
  });

  it("fires again only after coming back past the margin", () => {
    const back = 60 + REARM_MARGIN_PCT;
    // Wobbling between 59 and 61 fires once; climbing to the margin re-arms it.
    expect(fires(below60, [70, 59, 61, 59, 61, 58, back, 55])).toEqual([1, 7]);
  });

  it("works the other way for 'above'", () => {
    expect(fires(above80, [50, 79, 81, 90, 70, 85])).toEqual([2, 5]);
  });

  it("writes the crossing without a suffix after the number", () => {
    expect(alertMessage("Kütüphane", below60, 58)).toBe("Kütüphane doluluğu %58: %60 eşiğinin altına indi.");
    expect(alertMessage("Kafeler", above80, 91)).toBe("Kafeler doluluğu %91: %80 eşiğinin üstüne çıktı.");
  });
});

describe("school e-mail", () => {
  const domains = ["okul.edu.tr", "ogr.okul.edu.tr"];

  it("accepts exactly the listed domains", () => {
    expect(isSchoolEmail("ali@okul.edu.tr", domains)).toBe(true);
    expect(isSchoolEmail("ali@ogr.okul.edu.tr", domains)).toBe(true);
  });

  it("refuses look-alikes and other subdomains", () => {
    for (const email of [
      "ali@evil-okul.edu.tr",
      "ali@okul.edu.tr.evil.com",
      "ali@x.okul.edu.tr",
      "okul.edu.tr",
    ]) {
      expect(isSchoolEmail(email, domains)).toBe(false);
    }
  });
});

describe("passwords", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const stored = await hashPassword("doğru-şifre-123");
    expect(stored).toMatch(/^scrypt\$/);
    expect(await verifyPassword("doğru-şifre-123", stored)).toBe(true);
    expect(await verifyPassword("yanlış-şifre-123", stored)).toBe(false);
  });

  it("refuses when there is no account, after doing the same work", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("a=1; cl_session=abc%3D; b=2", "cl_session")).toBe("abc=");
    expect(readCookie("a=1", "cl_session")).toBeNull();
    expect(readCookie(undefined, "cl_session")).toBeNull();
  });
});
