import type { PlaceView } from "./places-view.js";
import { age, LEVEL_TR } from "./live-context.js";

type Topic = "crowd" | "parking" | "traffic";

/** Lowercase without Turkish letters, so "otoparkta bos yer" matches "Otoparkta boş yer". */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

const INTENTS: [Topic, RegExp][] = [
  ["parking", /otopark|park yeri|park|bos yer|araba/],
  ["traffic", /trafik|yol|arac/],
  ["crowd", /kalabalik|yogun|kisi|insan|oturacak|yer var/],
];
const GENERAL = /durum|genel|ozet|her yer/;
const TOPIC: Record<Topic, string> = { parking: "otopark", crowd: "kalabalık", traffic: "trafik" };
const HEADERS: Record<Topic, string> = {
  crowd: "En kalabalık yerler:",
  parking: "En çok boş yeri olan otoparklar:",
  traffic: "En yoğun yollar:",
};
// Campus places a question may name. When no place matches, there is no data: never another
// place's numbers.
const PLACE_WORDS = /yemekhane|kantin|spor|salon|havuz|fakulte|derslik|amfi|laboratuvar|yurt|rektorluk/;
// Words in place names too generic to identify one ("Kampüs yolu 1" is not "the campus",
// "Öğrenciler" are not "Öğrenci Yemekhanesi").
const GENERIC_WORDS = new Set(["kampus", "ogrenci"]);
// A question about the whole campus gets the top few places, not a line per place.
const TOP = 3;

const topicOf = (place: PlaceView): Topic =>
  place.kind === "parking" ? "parking" : place.kind === "road" ? "traffic" : "crowd";

/** "Bu konuda verim yok", offering only the topics the places cover. */
function noData(places: PlaceView[]): string {
  const topics = (["parking", "crowd", "traffic"] as const)
    .filter((topic) => places.some((place) => topicOf(place) === topic))
    .map((topic) => TOPIC[topic]);
  const list = topics.length > 1 ? `${topics.slice(0, -1).join(", ")} ve ${topics.at(-1)}` : topics[0];
  return list ? `Bu konuda verim yok. Kampüsteki ${list} hakkında sorabilirsin.` : "Bu konuda verim yok.";
}

/** The folded words of a place's name and section that identify it, e.g. "kafe", "kutuphane". */
function placeWords(place: PlaceView): string[] {
  return fold(`${place.name} ${place.section}`)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
}

/**
 * True when a word of the question and a place word share a stem: the question's word carries a
 * suffix ("kafede" → "kafe"), or the name's does ("fakülte" → "Fakültesi").
 */
function isNamed(place: PlaceView, questionWords: string[]): boolean {
  const words = placeWords(place);
  return questionWords.some((q) =>
    words.some((word) => q.startsWith(word) || (q.length >= 5 && word.startsWith(q))),
  );
}

/**
 * The top fresh places of a topic: most people (one per section: an area's views and its building
 * can be one crowd), most free slots, or the busiest roads.
 */
function top(places: PlaceView[], topic: Topic): PlaceView[] {
  const score = (place: PlaceView) => (topic === "parking" ? (place.parking?.free ?? 0) : (place.count ?? 0));
  const sections = new Set<string>();
  return places
    .filter((place) => topicOf(place) === topic && !place.stale)
    .sort((a, b) => score(b) - score(a))
    .filter((place) => topic !== "crowd" || (!sections.has(place.section) && sections.add(place.section)))
    .slice(0, TOP);
}

function line(place: PlaceView): string {
  if (place.stale || place.count === null || place.level === null) return `${place.name}: güncel veri yok.`;
  if (place.kind === "parking" && place.parking) {
    const { free, total } = place.parking;
    return free === 0
      ? `${place.name}: boş yer yok (${total} yerin hepsi dolu).`
      : `${place.name}: ${free} boş yer var (toplam ${total}).`;
  }
  if (place.kind === "road") return `${place.name}: trafik ${LEVEL_TR[place.level]} (${place.count} araç).`;
  return `${place.name}: ${place.count} kişi, seviye ${LEVEL_TR[place.level]}, ${age(place.ageMs ?? 0)}.`;
}

/** The answer without an LLM: the matching places' live numbers, picked by keywords. */
export function fallbackAnswer(question: string, places: PlaceView[]): string {
  const q = fold(question);
  const questionWords = q.split(/[^a-z0-9]+/).filter(Boolean);
  const topic = INTENTS.find(([, pattern]) => pattern.test(q))?.[0];
  // The place the question names wins over the kind of question: "Kafede boş yer var mı?" is about
  // the café, not the parking lots, even though "boş yer" also suggests parking.
  const named = places.filter((place) => isNamed(place, questionWords));
  let shown: PlaceView[];
  let lines: string[];
  if (named.length) {
    const namedOfTopic = named.filter((place) => topicOf(place) === topic);
    shown = namedOfTopic.length ? namedOfTopic : named;
    lines = shown.map(line);
  } else if (PLACE_WORDS.test(q) || (!topic && !GENERAL.test(q))) {
    // A question about none of our places gets no data: never a guess (CLAUDE.md §4.7).
    return noData(places);
  } else {
    const topics = topic ? [topic] : (["crowd", "parking", "traffic"] as const);
    shown = [];
    lines = [];
    for (const each of topics) {
      if (!places.some((place) => topicOf(place) === each)) continue;
      const best = top(places, each);
      shown.push(...best);
      lines.push(HEADERS[each], ...(best.length ? best.map(line) : ["Şu an güncel veri yok."]));
    }
  }
  if (!lines.length) return noData(places);
  const demo = shown.some((place) => !place.stale && place.demo);
  return ["Canlı verilere göre:", ...lines, ...(demo ? ["(Bu veriler demo videolarından.)"] : [])].join("\n");
}
