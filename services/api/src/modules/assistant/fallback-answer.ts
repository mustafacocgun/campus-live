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
  const kind = INTENTS.find(([, pattern]) => pattern.test(q))?.[0];
  const isNamed = (camera: LiveCamera) => [camera.name, camera.section].some((n) => q.includes(fold(n)));
  let matches = kind ? cameras.filter((camera) => camera.kind === kind) : cameras;
  const named = matches.filter(isNamed);
  if (named.length) matches = named;
  // A question about none of our cameras gets no camera data: never a guess (CLAUDE.md §4.7).
  else if (!kind && !GENERAL.test(q)) return NO_DATA;
  if (!matches.length) return NO_DATA;
  const demo = matches.some((camera) => camera.reading && camera.reading.source !== "camera");
  return [
    "Canlı verilere göre:",
    ...matches.map((camera) => line(camera, now)),
    ...(demo ? ["(Bu veriler demo videolarından.)"] : []),
  ].join("\n");
}
