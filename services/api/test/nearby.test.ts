import { describe, expect, it } from "vitest";
import { findNearby, nearbyChips, nearbyPrompt, nearbyText } from "../src/modules/assistant/nearby.js";
import type { PlaceView } from "../src/modules/assistant/places-view.js";

// A small campus laid out in metres east and north of one point, so distances are known.
const LAT0 = 40.742;
const LNG0 = 30.332;
const at = (east: number, north: number): [number, number] => [
  LNG0 + east / (111_320 * Math.cos((LAT0 * Math.PI) / 180)),
  LAT0 + north / 111_320,
];
const ME = { lat: LAT0, lng: LNG0 };

function place(
  id: string,
  name: string,
  section: string,
  kind: PlaceView["kind"],
  east: number,
  north: number,
  state: Partial<PlaceView> = {},
): PlaceView {
  const [lng, lat] = at(east, north);
  const geometry: PlaceView["geometry"] =
    kind === "area" || kind === "road"
      ? { type: "Point", coordinates: [lng, lat] }
      : {
          type: "Polygon",
          // A 20 m square around the point: its middle is the point.
          coordinates: [
            [
              at(east - 10, north - 10),
              at(east + 10, north - 10),
              at(east + 10, north + 10),
              at(east - 10, north + 10),
              at(east - 10, north - 10),
            ],
          ],
        };
  return {
    id,
    name,
    section,
    kind,
    geometry,
    count: 3,
    level: "low",
    parking: null,
    stale: false,
    ageMs: 2_000,
    demo: true,
    ...state,
  };
}
const lot = (id: string, name: string, east: number, north: number, free: number, total = 8) =>
  place(id, name, "Otoparklar", "parking", east, north, { count: total - free, parking: { total, free } });

const CAMPUS: PlaceView[] = [
  lot("a-otoparki", "Otopark A", 130, 0, 5),
  lot("b-otoparki", "Otopark B", 0, 310, 2),
  lot("c-otoparki", "Otopark C", 0, -50, 0), // the closest, but full
  lot("d-otoparki", "Otopark D", -210, 0, 6),
  lot("yemekhane-otoparki", "Yemekhane otoparkı", 520, 30, 4),
  place("tas-kafe-binasi", "Taş Kafe", "Kafeler", "building", 120, 120, { count: 9, level: "medium" }),
  place("tas-kafe-onu", "Taş Kafe önü", "Kafeler", "area", 100, 100, { count: 4 }),
  place("merkez-kantin", "Merkez Kantin", "Kafeler", "building", -400, 0),
  place("ogrenci-yemekhanesi", "Öğrenci Yemekhanesi", "Yemekhane", "building", 500, 0, {
    count: 40,
    level: "high",
  }),
  place("personel-yemekhanesi", "Personel Yemekhanesi", "Yemekhane", "building", -600, 300),
  place("muhendislik", "Mühendislik Fakültesi", "Fakülteler", "building", 160, 160),
];
const ids = (answer: ReturnType<typeof findNearby>) =>
  answer?.kind === "nearest" ? answer.items.map((item) => item.place.id) : [];

describe("findNearby", () => {
  it("finds the lots nearest to you, those with free slots first", () => {
    const answer = findNearby("Bana en yakın otopark nerede?", CAMPUS, ME);
    expect(answer).toMatchObject({ kind: "nearest", from: { you: true } });
    // C is 50 m away but full; then A (130 m), D (210 m), B (310 m).
    expect(ids(answer)).toEqual(["a-otoparki", "d-otoparki", "b-otoparki"]);
    if (answer?.kind !== "nearest") throw new Error("not a nearest answer");
    expect(answer.items[0]).toMatchObject({ metres: 130, direction: "doğu" });
    expect(answer.items[1].direction).toBe("batı");
  });

  it("measures from the place the question names, even when your location is known", () => {
    for (const location of [null, ME]) {
      const answer = findNearby(
        "Öğrenci yemekhanesine gideceğim, en yakın otopark nerede?",
        CAMPUS,
        location,
      );
      expect(answer).toMatchObject({ kind: "nearest", from: { place: { id: "ogrenci-yemekhanesi" } } });
      expect(ids(answer)[0]).toBe("yemekhane-otoparki");
    }
  });

  it("prefers the café's building over the area in front of it", () => {
    const answer = findNearby("en yakin kafe hangisi", CAMPUS, ME);
    expect(ids(answer)).toEqual(["tas-kafe-binasi", "merkez-kantin"]);
  });

  it("says where a named place is: from you, or near another building", () => {
    const fromYou = findNearby("Taş Kafe nerede?", CAMPUS, ME);
    expect(fromYou).toMatchObject({ kind: "where", place: { id: "tas-kafe-binasi" } });
    if (fromYou?.kind !== "where") throw new Error("not a where answer");
    expect(fromYou.fromYou).toMatchObject({ metres: 170, direction: "kuzeydoğu" });
    const alone = findNearby("Taş Kafe nerede?", CAMPUS, null);
    if (alone?.kind !== "where") throw new Error("not a where answer");
    expect(alone.fromYou).toBeNull();
    expect(alone.landmark?.place.id).toBe("muhendislik");
  });

  it("leaves other questions to the usual answers", () => {
    expect(findNearby("Otoparkta boş yer var mı?", CAMPUS, ME)).toBeNull();
    expect(findNearby("Kütüphane kalabalık mı?", CAMPUS, ME)).toBeNull();
    // "Nearest" with neither a location nor a named place to measure from.
    expect(findNearby("En yakın otopark nerede?", CAMPUS, null)).toBeNull();
  });
});

describe("what leaves the server", () => {
  it("tells the AI only the top places, rounded to 50 m from you, never the coordinates", () => {
    const answer = findNearby("Bana en yakın otopark nerede?", CAMPUS, ME)!;
    const prompt = nearbyPrompt(answer);
    expect(prompt).toContain("Otopark A: 150 m"); // 130 m, rounded to 50 m
    expect(prompt).toContain("Otopark D: 200 m");
    expect(prompt).not.toMatch(/40\.74|30\.33/);
    expect(prompt.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(3);
  });

  it("gives distances from a named place to the nearest 10 m", () => {
    const answer = findNearby("Öğrenci yemekhanesine gideceğim, en yakın otopark nerede?", CAMPUS, null)!;
    expect(nearbyPrompt(answer)).toContain("Yemekhane otoparkı: 40 m"); // √(20² + 30²) ≈ 36 m
  });

  it("answers by itself when there is no AI, with the live numbers", () => {
    const text = nearbyText(findNearby("Bana en yakın otopark nerede?", CAMPUS, ME)!);
    expect(text.split("\n")[0]).toBe("Sana en yakın otoparklar (kuş uçuşu):");
    expect(text).toContain("Otopark A: 150 m, doğu yönünde, yürüyerek yaklaşık 2 dk; 5/8 boş yer.");
    expect(text).toContain("(Bu veriler demo videolarından.)");
  });

  it("gives the screen the places to point at, nearest first, with the same distances the AI saw", () => {
    const chips = nearbyChips(findNearby("Bana en yakın otopark nerede?", CAMPUS, ME)!);
    expect(chips).toEqual([
      { id: "a-otoparki", name: "Otopark A", metres: 150 },
      { id: "d-otoparki", name: "Otopark D", metres: 200 },
      { id: "b-otoparki", name: "Otopark B", metres: 300 },
    ]);
    const where = nearbyChips(findNearby("Taş Kafe nerede?", CAMPUS, null)!);
    expect(where).toEqual([{ id: "tas-kafe-binasi", name: "Taş Kafe", metres: null }]);
  });
});

describe("names that are only a category word", () => {
  it("takes 'en yakın otopark' for any lot, not the lot called Otopark", () => {
    const campus = [
      ...CAMPUS,
      lot("otopark", "Otopark", 900, 900, 3),
      lot("otopark-2", "Otopark 2", -900, 900, 3),
    ];
    const answer = findNearby("En yakın otopark nerede?", campus, ME);
    expect(answer?.kind).toBe("nearest");
    expect(ids(answer)[0]).toBe("a-otoparki");
  });
});

describe("one distance per place", () => {
  it("shows the screen the distance the answer text gives", () => {
    const fromYou = findNearby("Bana en yakın otopark nerede?", CAMPUS, ME)!;
    const chip = nearbyChips(fromYou)[0];
    expect(nearbyPrompt(fromYou)).toContain(`Otopark A: ${chip.metres} m`);
    const fromPlace = findNearby("Öğrenci yemekhanesine gideceğim, en yakın otopark nerede?", CAMPUS, null)!;
    expect(nearbyText(fromPlace)).toContain(`Yemekhane otoparkı: ${nearbyChips(fromPlace)[0].metres} m`);
    const where = findNearby("Taş Kafe nerede?", CAMPUS, ME)!;
    expect(nearbyPrompt(where)).toContain(`${nearbyChips(where)[0].metres} m, kuzeydoğu`);
  });
});
