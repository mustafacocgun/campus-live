// Asks the assistant 5 real Turkish questions against a running stack and prints each answer next to
// the live data, so a person can check every number (CLAUDE.md §4.8). Run it with the real LLM key
// set in services/api/.env before building more UI around the assistant.
//
//   node scripts/assistant-eval.mjs [api-url]      (default http://localhost:4000)

const api = process.argv[2] ?? "http://localhost:4000";
const QUESTIONS = [
  "Otoparkta boş yer var mı?",
  "Kütüphane şu an kalabalık mı?",
  "Kampüsün ana yolunda trafik nasıl?",
  "Merkez kafede oturacak yer bulur muyum?",
  "Yarınki sınav saat kaçta?", // not in the data: the right answer is "Bu konuda verim yok."
];

const { places } = (await (await fetch(`${api}/api/places`)).json()).data;
const live = (await (await fetch(`${api}/api/live`)).json()).data;
const states = new Map(live.places.map((state) => [state.id, state]));
console.log("Live data:");
for (const place of places) {
  const state = states.get(place.id);
  const fresh = state && !state.stale;
  const value = !fresh
    ? "güncel veri yok"
    : state.parking
      ? `${state.parking.free}/${state.parking.total} boş`
      : `${state.count}`;
  console.log(
    `  ${place.name} (${place.kind}): ${value}${fresh ? `, ${state.level}${state.demo ? ", demo" : ""}` : ""}`,
  );
}
for (const message of QUESTIONS) {
  const response = await fetch(`${api}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const body = await response.json();
  console.log(`\nS: ${message}`);
  console.log(
    body.success
      ? `C (${body.data.via}): ${body.data.answer}`
      : `HATA ${response.status}: ${body.error.message}`,
  );
}
