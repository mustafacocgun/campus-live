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

const cameras = (await (await fetch(`${api}/api/cameras`)).json()).data;
console.log("Live data:");
for (const c of cameras) {
  const r = c.reading;
  const value =
    !r || c.stale ? "güncel veri yok" : r.parking ? `${r.parking.free}/${r.parking.total} boş` : `${r.count}`;
  console.log(`  ${c.name}: ${value}${r && !c.stale ? `, ${r.level}, ${r.source}` : ""}`);
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
