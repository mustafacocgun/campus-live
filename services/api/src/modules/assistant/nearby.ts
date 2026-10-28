/**
 * "Where is the nearest…?" and "where is…?" questions, answered from the map: the server measures
 * from the user's position, or from the place the question names. What leaves the server is limited
 * (the team's choice, 2026-10-28): the AI gets only the top three places, with distances from the
 * user rounded to 50 m; the user's coordinates never leave the server and are never stored or logged.
 */
import { fold } from "./fallback-answer.js";
import { LEVEL_TR } from "./live-context.js";
import type { PlaceView } from "./places-view.js";

type LngLat = [number, number];

/** A position on the map, from the device or picked on the map. */
export interface Spot {
  lat: number;
  lng: number;
}

/** A place and how far it is from where we measure, straight-line. */
export interface Item {
  place: PlaceView;
  metres: number;
  direction: string;
}

export type Nearby =
  | { kind: "nearest"; from: { you: true } | { place: PlaceView }; label: string; items: Item[] }
  | { kind: "where"; place: PlaceView; fromYou: Item | null; landmark: Item | null };

/** A place the screen can point at: the answer's places, nearest first. */
export interface Chip {
  id: string;
  name: string;
  metres: number | null;
}

const M_PER_DEG = 111_320;
const TOP = 3;
// A steady walk, about 4.8 km/h.
const WALK_M_PER_MIN = 80;
const DIRECTIONS = ["kuzey", "kuzeydoğu", "doğu", "güneydoğu", "güney", "güneybatı", "batı", "kuzeybatı"];

interface Topic {
  pattern: RegExp;
  label: string;
  matches: (place: PlaceView) => boolean;
}

// What a "nearest" question can ask for, by its words (folded: no Turkish letters).
const TOPICS: Topic[] = [
  {
    pattern: /otopark|park yeri|park edebil|aracimi|arabami/,
    label: "otoparklar",
    matches: (p) => p.kind === "parking",
  },
  { pattern: /kafe|kafeterya|kantin|kahve/, label: "kafeler", matches: (p) => p.section === "Kafeler" },
  { pattern: /yemekhane/, label: "yemekhaneler", matches: (p) => p.section === "Yemekhane" },
  { pattern: /kutuphane/, label: "kütüphaneler", matches: (p) => p.section === "Kütüphane" },
  { pattern: /fakulte/, label: "fakülteler", matches: (p) => p.section === "Fakülteler" },
];
const NEAR = /yakin|nerede|nerde|nereye|en kisa/;

/** Where a place is, for distances: its point, the middle of its footprint, or of its longest road part. */
function anchorOf(place: PlaceView): LngLat {
  const geometry = place.geometry;
  if (geometry.type === "Point") return geometry.coordinates as LngLat;
  if (geometry.type === "Polygon") {
    const corners = geometry.coordinates[0].slice(0, -1);
    return [
      corners.reduce((sum, [lng]) => sum + lng, 0) / corners.length,
      corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length,
    ];
  }
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const longest = parts.reduce((best, part) => (part.length > best.length ? part : best));
  return longest[Math.floor((longest.length - 1) / 2)] as LngLat;
}

/** How far a place is from a point, and which way: flat-earth metres, fine across a campus. */
function measure(from: LngLat, place: PlaceView): Item {
  const [lng, lat] = anchorOf(place);
  const east = (lng - from[0]) * M_PER_DEG * Math.cos((from[1] * Math.PI) / 180);
  const north = (lat - from[1]) * M_PER_DEG;
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return {
    place,
    metres: Math.round(Math.hypot(east, north)),
    direction: DIRECTIONS[Math.round(bearing / 45) % 8],
  };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The place the question names, by its whole name ("öğrenci yemekhanesine" names Öğrenci Yemekhanesi),
 * the longest such name first. A name that is only a category word ("Otopark 2") names nothing: "en
 * yakın otopark" asks for any lot, not the one called "Otopark".
 */
function namedIn(question: string, places: PlaceView[]): PlaceView | null {
  const found = places
    .map((place) => ({ place, name: fold(place.name) }))
    .filter(({ name }) => {
      const own = TOPICS.reduce((rest, topic) => rest.replace(new RegExp(topic.pattern, "g"), ""), name);
      return (
        (own.match(/[a-z]/g)?.length ?? 0) >= 3 && new RegExp(`(^|[^a-z0-9])${escape(name)}`).test(question)
      );
    })
    .sort(
      (a, b) =>
        b.name.length - a.name.length ||
        Number(b.place.kind === "building") - Number(a.place.kind === "building"),
    );
  return found[0]?.place ?? null;
}

/** A lot is of use to a driver only with a fresh reading and a free slot. */
const usable = (place: PlaceView) =>
  place.kind !== "parking" || (!place.stale && (place.parking?.free ?? 0) > 0);

/** The places a "nearest" or "where" question is about, or null for any other question. */
export function findNearby(question: string, places: PlaceView[], location: Spot | null): Nearby | null {
  const q = fold(question);
  if (!NEAR.test(q)) return null;
  const topic = TOPICS.find((each) => each.pattern.test(q)) ?? null;
  const named = namedIn(q, places);
  const you: LngLat | null = location ? [location.lng, location.lat] : null;

  // "Taş Kafe nerede?": the place itself, from the user and next to the nearest other building.
  if (named && (!topic || topic.matches(named))) {
    const here = anchorOf(named);
    const landmark =
      places
        .filter((place) => place.kind === "building" && place.id !== named.id)
        .map((place) => measure(here, place))
        .sort((a, b) => a.metres - b.metres)[0] ?? null;
    return { kind: "where", place: named, fromYou: you ? measure(you, named) : null, landmark };
  }
  if (!topic) return null;

  // "Yemekhaneye gideceğim, en yakın otopark?": from the place named; otherwise from the user.
  const from = named ? { place: named } : you ? { you: true as const } : null;
  if (!from) return null;
  const origin = named ? anchorOf(named) : (you as LngLat);
  let candidates = places.filter((place) => topic.matches(place) && place.id !== named?.id);
  // A café is its building; the area in front of it counts only where there is no building.
  if (candidates.some((place) => place.kind === "building")) {
    candidates = candidates.filter((place) => place.kind !== "area");
  }
  const items = candidates
    .map((place) => measure(origin, place))
    .sort((a, b) => Number(usable(b.place)) - Number(usable(a.place)) || a.metres - b.metres)
    .slice(0, TOP);
  return { kind: "nearest", from, label: topic.label, items };
}

const rounded = (metres: number, step: number) => Math.max(step, Math.round(metres / step) * step);
/** Distances from the user are rounded to 50 m everywhere, so the text, the AI and the screen agree. */
const FROM_YOU = 50;
const FROM_PLACE = 10;
const stepOf = (nearby: Nearby) =>
  nearby.kind === "nearest" && "place" in nearby.from ? FROM_PLACE : FROM_YOU;
const minutes = (metres: number) => Math.max(1, Math.ceil(metres / WALK_M_PER_MIN));
const way = (metres: number, direction: string) =>
  `${metres} m, ${direction} yönünde, yürüyerek yaklaşık ${minutes(metres)} dk`;

/** A place's live state in a few words. */
function state(place: PlaceView): string {
  if (place.stale || place.count === null || !place.level) return "güncel veri yok";
  if (place.kind === "parking" && place.parking) {
    return place.parking.free ? `${place.parking.free}/${place.parking.total} boş yer` : "boş yer yok";
  }
  return `${place.count} ${place.kind === "road" ? "araç" : "kişi"}, seviye ${LEVEL_TR[place.level]}`;
}

/**
 * The block the AI gets: the top places only, distances from the user rounded to 50 m (from a named
 * place, a public spot, to 10 m), and never a coordinate.
 */
export function nearbyPrompt(nearby: Nearby): string {
  const head = "YAKINDAKİ YERLER (sunucu hesapladı; kuş uçuşu, yaklaşık):";
  if (nearby.kind === "where") {
    return [
      head,
      `Sorulan yer: ${nearby.place.name} (${state(nearby.place)}).`,
      ...(nearby.fromYou
        ? [
            `- Kullanıcıya uzaklık: ${way(rounded(nearby.fromYou.metres, FROM_YOU), nearby.fromYou.direction)}`,
          ]
        : []),
      ...(nearby.landmark
        ? [`- Yakınındaki bina: ${nearby.landmark.place.name} (${rounded(nearby.landmark.metres, 10)} m)`]
        : []),
    ].join("\n");
  }
  const fromPlace = "place" in nearby.from ? nearby.from.place : null;
  const fromYou = !fromPlace;
  const title = fromPlace
    ? `${fromPlace.name} yakınındaki ${nearby.label}:`
    : `Kullanıcıya en yakın ${nearby.label}:`;
  return [
    head,
    title,
    ...nearby.items.map(
      (item) =>
        `- ${item.place.name}: ${way(rounded(item.metres, fromYou ? FROM_YOU : FROM_PLACE), item.direction)}; ${state(item.place)}`,
    ),
  ].join("\n");
}

/** The answer without an AI: the same places, from the server alone. */
export function nearbyText(nearby: Nearby): string {
  const shown = nearby.kind === "where" ? [nearby.place] : nearby.items.map((item) => item.place);
  const demo = shown.some((place) => !place.stale && place.demo) ? ["(Bu veriler demo videolarından.)"] : [];
  if (nearby.kind === "where") {
    return [
      `${nearby.place.name}: ${state(nearby.place)}.`,
      ...(nearby.fromYou
        ? [`Sana ${way(rounded(nearby.fromYou.metres, FROM_YOU), nearby.fromYou.direction)} (kuş uçuşu).`]
        : []),
      ...(nearby.landmark
        ? [`Yakınındaki bina: ${nearby.landmark.place.name} (${rounded(nearby.landmark.metres, 10)} m).`]
        : []),
      "Haritada göstermek için aşağıdaki yere dokun.",
      ...demo,
    ].join("\n");
  }
  if (!nearby.items.length) return `Yakında ${nearby.label} bulamadım.`;
  const title =
    "you" in nearby.from
      ? `Sana en yakın ${nearby.label} (kuş uçuşu):`
      : `${nearby.from.place.name} yakınındaki ${nearby.label} (kuş uçuşu):`;
  return [
    title,
    ...nearby.items.map(
      (item) =>
        `${item.place.name}: ${way(rounded(item.metres, stepOf(nearby)), item.direction)}; ${state(item.place)}.`,
    ),
    ...demo,
  ].join("\n");
}

/** The places the screen can point at, nearest first, with the distances the answer gives. */
export function nearbyChips(nearby: Nearby): Chip[] {
  if (nearby.kind === "where") {
    const { place, fromYou } = nearby;
    return [{ id: place.id, name: place.name, metres: fromYou ? rounded(fromYou.metres, FROM_YOU) : null }];
  }
  return nearby.items.map(({ place, metres }) => ({
    id: place.id,
    name: place.name,
    metres: rounded(metres, stepOf(nearby)),
  }));
}
