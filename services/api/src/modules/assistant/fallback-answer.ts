import type { CameraKind, LiveCamera } from "@campus-live/contracts";
import { describeCamera } from "./live-context.js";

/** Lowercase without Turkish letters, so "otoparkta bos yer" matches "Otoparkta boş yer". */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

const INTENTS: [CameraKind, RegExp][] = [
  ["parking", /otopark|park yeri|park|bos yer|araba/],
  ["traffic", /trafik|yol|arac/],
  ["crowd", /kalabalik|yogun|kisi|insan|oturacak|yer var/],
];
const GENERAL = /durum|genel|ozet|her yer/;
const TOPIC: Record<CameraKind, string> = { parking: "otopark", crowd: "kalabalık", traffic: "trafik" };
// Campus places a question may name. When no camera matches the place, there is no data: never
// another place's numbers.
const PLACE_WORDS = /yemekhane|kantin|spor|salon|havuz|fakulte|derslik|amfi|laboratuvar|yurt|rektorluk/;
// Words in camera names too generic to identify a place ("Kampüs ana yolu" is not "the campus").
const GENERIC_WORDS = new Set(["kampus"]);
// A crowd question about the whole campus gets the busiest few places, not a line per camera.
const BUSIEST = 3;

/** "Bu konuda verim yok", offering only the topics the cameras cover. */
function noData(cameras: LiveCamera[]): string {
  const topics = (["parking", "crowd", "traffic"] as const)
    .filter((kind) => cameras.some((camera) => camera.kind === kind))
    .map((kind) => TOPIC[kind]);
  const list = topics.length > 1 ? `${topics.slice(0, -1).join(", ")} ve ${topics.at(-1)}` : topics[0];
  return list ? `Bu konuda verim yok. Kampüsteki ${list} hakkında sorabilirsin.` : "Bu konuda verim yok.";
}

/** The folded words of a camera's name and section that identify it, e.g. "kafe", "kutuphane". */
function placeWords(camera: LiveCamera): string[] {
  return fold(`${camera.name} ${camera.section}`)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
}

/**
 * True when a word of the question and a place word share a stem: the question's word carries a
 * suffix ("kafede" → "kafe"), or the name's does ("fakülte" → "Fakültesi").
 */
function isNamed(camera: LiveCamera, questionWords: string[]): boolean {
  const words = placeWords(camera);
  return questionWords.some((q) =>
    words.some((word) => q.startsWith(word) || (q.length >= 5 && word.startsWith(q))),
  );
}

/** The fresh crowd cameras with the most people, busiest first. */
function busiest(cameras: LiveCamera[]): LiveCamera[] {
  return cameras
    .filter((camera) => camera.kind === "crowd" && !camera.stale && camera.reading)
    .sort((a, b) => (b.reading?.count ?? 0) - (a.reading?.count ?? 0))
    .slice(0, BUSIEST);
}

function line(camera: LiveCamera, now: Date): string {
  const reading = camera.reading;
  if (camera.stale || !reading) return `${camera.name}: güncel veri yok.`;
  if (reading.kind === "parking" && reading.parking) {
    const { free, total } = reading.parking;
    return free === 0
      ? `${camera.name}: boş yer yok (${total} yerin hepsi dolu).`
      : `${camera.name}: ${free} boş yer var (toplam ${total}).`;
  }
  // The footer already says the data is demo footage.
  return `${describeCamera(camera, now)
    .replace(/ \(.*?\)/, "")
    .replace(", demo verisi", "")}.`;
}

/** The answer without an LLM: the matching cameras' live numbers, picked by keywords. */
export function fallbackAnswer(question: string, cameras: LiveCamera[], now: Date): string {
  const q = fold(question);
  const questionWords = q.split(/[^a-z0-9]+/).filter(Boolean);
  const kind = INTENTS.find(([, pattern]) => pattern.test(q))?.[0];
  // The place the question names wins over the kind of question: "Kafede boş yer var mı?" is about
  // the café, not the parking lot, even though "boş yer" also suggests parking.
  const named = cameras.filter((camera) => isNamed(camera, questionWords));
  let matches: LiveCamera[];
  let lines: string[];
  let header = "Canlı verilere göre:";
  if (named.length) {
    const namedOfKind = named.filter((camera) => camera.kind === kind);
    matches = namedOfKind.length ? namedOfKind : named;
    lines = matches.map((camera) => line(camera, now));
  } else if (PLACE_WORDS.test(q) || (!kind && !GENERAL.test(q))) {
    // A question about none of our cameras gets no camera data: never a guess (CLAUDE.md §4.7).
    return noData(cameras);
  } else {
    const wanted = kind ? cameras.filter((camera) => camera.kind === kind) : cameras;
    const hasCrowd = wanted.some((camera) => camera.kind === "crowd");
    // The whole campus: the busiest crowd cameras stand for the crowd, other kinds stay listed.
    matches = [...busiest(wanted), ...wanted.filter((camera) => camera.kind !== "crowd")];
    lines = matches.map((camera) => line(camera, now));
    if (hasCrowd && !matches.some((camera) => camera.kind === "crowd")) {
      lines.unshift("Kalabalık: şu an hiçbir kameradan güncel veri yok.");
    } else if (matches.every((camera) => camera.kind === "crowd")) {
      header = "Canlı verilere göre en kalabalık yerler:";
    }
  }
  if (!lines.length) return noData(cameras);
  const demo = matches.some((camera) => camera.reading && camera.reading.source !== "camera");
  return [
    header,
    ...lines,
    ...(demo && !matches.every((camera) => camera.stale) ? ["(Bu veriler demo videolarından.)"] : []),
  ].join("\n");
}
