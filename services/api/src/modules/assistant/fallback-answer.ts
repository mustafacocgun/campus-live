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
const NO_DATA = "Bu konuda verim yok. Otopark, kalabalık ve trafik hakkında sorabilirsin.";
// Campus places we have no camera for: a question about one gets no data, not another place's numbers.
const UNCOVERED_PLACES = /yemekhane|kantin|spor|salon|havuz|fakulte|derslik|amfi|laboratuvar|yurt|rektorluk/;
// Words in camera names too generic to identify a place ("Kampüs ana yolu" is not "the campus").
const GENERIC_WORDS = new Set(["kampus"]);

/** The folded words of a camera's name and section that identify it, e.g. "kafe", "kutuphane". */
function placeWords(camera: LiveCamera): string[] {
  return fold(`${camera.name} ${camera.section}`)
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
}

/** True when a word of the question starts with one of the camera's place words ("kafede" → "kafe"). */
function isNamed(camera: LiveCamera, questionWords: string[]): boolean {
  const words = placeWords(camera);
  return questionWords.some((q) => words.some((word) => q.startsWith(word)));
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
  if (named.length) {
    const namedOfKind = named.filter((camera) => camera.kind === kind);
    matches = namedOfKind.length ? namedOfKind : named;
  } else if (UNCOVERED_PLACES.test(q) || (!kind && !GENERAL.test(q))) {
    // A question about none of our cameras gets no camera data: never a guess (CLAUDE.md §4.7).
    return NO_DATA;
  } else {
    matches = kind ? cameras.filter((camera) => camera.kind === kind) : cameras;
  }
  if (!matches.length) return NO_DATA;
  const demo = matches.some((camera) => camera.reading && camera.reading.source !== "camera");
  return [
    "Canlı verilere göre:",
    ...matches.map((camera) => line(camera, now)),
    ...(demo ? ["(Bu veriler demo videolarından.)"] : []),
  ].join("\n");
}
