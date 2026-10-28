import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiResponse, AssistantResponse } from "@campus-live/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { fallbackAnswer } from "../src/modules/assistant/fallback-answer.js";
import { buildLiveContext } from "../src/modules/assistant/live-context.js";
import { createLlmClient } from "../src/modules/assistant/llm-client.js";
import type { PlaceView } from "../src/modules/assistant/places-view.js";
import { reading, startServer } from "./helpers.js";

const API_KEY = "sk-test-secret-key";
const POINT = { type: "Point" as const, coordinates: [30.332, 40.742] as [number, number] };

function place(
  id: string,
  name: string,
  section: string,
  kind: PlaceView["kind"],
  state: Partial<PlaceView> = {},
): PlaceView {
  return {
    id,
    name,
    section,
    kind,
    geometry: POINT,
    count: 0,
    level: "low",
    parking: null,
    stale: false,
    ageMs: 4_000,
    demo: true,
    ...state,
  };
}

const places: PlaceView[] = [
  place("kutuphane-alani", "Kütüphane girişi", "Kütüphane", "area", { count: 23, level: "medium" }),
  place("kafe-alani", "Merkez kafe", "Kafeler", "area", { count: 7, level: "low" }),
  place("a-otoparki", "Otopark A", "Otoparklar", "parking", {
    count: 28,
    level: "medium",
    parking: { total: 40, free: 12 },
  }),
  place("kampus-ana-caddesi", "Kampüs ana yolu", "Yollar", "road", {
    count: null,
    level: null,
    stale: true,
    ageMs: 3_600_000,
  }),
];

describe("live context and fallback", () => {
  it("context carries exact free-slot numbers", () => {
    const context = buildLiveContext(places);
    expect(context).toContain(
      "Otopark A (Otoparklar, otopark): 12/40 boş, seviye Orta, 4 sn önce, demo verisi",
    );
    expect(context).toContain("Kütüphane girişi (Kütüphane, açık alan): 23 kişi, seviye Orta");
  });

  it("stale places are not reported as current", () => {
    expect(buildLiveContext(places)).toContain("Kampüs ana yolu (Yollar, yol): güncel veri yok");
    const answer = fallbackAnswer("Trafik nasıl?", places);
    expect(answer).toContain("güncel veri yok");
    expect(answer).not.toMatch(/\d+ araç/);
  });

  it("fallback says it has no data for unrelated questions", () => {
    const answer = fallbackAnswer("Yarınki sınav saat kaçta?", places);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("Otopark A");
  });

  it("fallback summarises every topic for a general question", () => {
    const answer = fallbackAnswer("Kampüste genel durum ne?", places);
    for (const text of ["En kalabalık yerler:", "Kütüphane girişi", "Otopark A", "En yoğun yollar:"]) {
      expect(answer).toContain(text);
    }
  });

  it("fallback says a full lot has no free slots", () => {
    const full = places.map((p) =>
      p.id === "a-otoparki"
        ? { ...p, count: 40, level: "high" as const, parking: { total: 40, free: 0 } }
        : p,
    );
    const answer = fallbackAnswer("Otopark A'da boş yer var mı?", full);
    expect(answer).toContain("Otopark A: boş yer yok (40 yerin hepsi dolu)");
    expect(answer).not.toContain("0 boş yer var");
  });

  it("answers the place the question names, before the kind of question", () => {
    const cafe = fallbackAnswer("Kafede boş yer var mı?", places);
    expect(cafe).toContain("Merkez kafe: 7 kişi");
    expect(cafe).not.toContain("Otopark A");
    const library = fallbackAnswer("Kütüphanede boş yer var mı?", places);
    expect(library).toContain("Kütüphane girişi: 23 kişi");
    expect(library).not.toContain("Otopark A");
  });

  it("says it has no data for a place it does not watch", () => {
    const answer = fallbackAnswer("Yemekhane kalabalık mı?", places);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("23 kişi");
  });

  it("fallback quotes the live numbers", () => {
    for (const question of ["Otoparkta boş yer var mı?", "otoparkta bos yer var mi"]) {
      const answer = fallbackAnswer(question, places);
      expect(answer).toContain("Otopark A: 12 boş yer var (toplam 40)");
      expect(answer).not.toContain("Kütüphane");
    }
  });
});

describe("fallback on the campus map", () => {
  const crowd = (id: string, name: string, section: string, count: number, stale = false) =>
    place(id, name, section, "area", { count, level: count >= 10 ? "high" : "medium", stale });
  const campus = [
    crowd("kutuphane-bati-alani", "Kütüphane batı", "Kütüphane", 4),
    crowd("kutuphane-yolu-alani", "Kütüphane yolu", "Kütüphane", 5),
    crowd("tas-kafe-onu", "Taş Kafe önü", "Kafeler", 11),
    place("ogrenci-yemekhanesi", "Öğrenci Yemekhanesi", "Yemekhane", "building", {
      count: 8,
      level: "medium",
    }),
    place("bilisim", "Bilişim Fakültesi", "Fakülteler", "building", { count: 6, level: "medium" }),
    place("fen-edebiyat", "Fen-Edebiyat Fakültesi", "Fakülteler", "building", { count: 2, level: "low" }),
    crowd("rektorluk-onu", "Rektörlük önü", "Kampüs binaları", 30, true),
    place("kantin-otoparki", "Kantin otoparkı", "Otoparklar", "parking", {
      count: 10,
      level: "low",
      parking: { total: 30, free: 20 },
    }),
    place("t4-otoparki", "T4 otoparkı", "Otoparklar", "parking", {
      count: 9,
      level: "high",
      parking: { total: 10, free: 1 },
    }),
    place("kampus-ici-yolu", "Kampüs İçi Yolu", "Yollar", "road", { count: 6, level: "high" }),
  ];

  it("the fallback names the busiest places for a general crowd question", () => {
    const answer = fallbackAnswer("Kampüs şu an kalabalık mı?", campus);
    const [header, title, first] = answer.split("\n");
    expect([header, title]).toEqual(["Canlı verilere göre:", "En kalabalık yerler:"]);
    expect(first).toContain("Taş Kafe önü: 11 kişi");
    expect(answer).toContain("Öğrenci Yemekhanesi: 8 kişi");
    expect(answer).not.toContain("Fen-Edebiyat"); // the busiest three only
    expect(answer).not.toContain("Rektörlük"); // no fresh reading: never "the busiest"
  });

  it("lists the lots with the most free slots for a general parking question", () => {
    const answer = fallbackAnswer("Otoparkta boş yer var mı?", campus);
    const lines = answer.split("\n");
    expect(lines[1]).toBe("En çok boş yeri olan otoparklar:");
    expect(lines[2]).toBe("Kantin otoparkı: 20 boş yer var (toplam 30).");
    expect(lines[3]).toBe("T4 otoparkı: 1 boş yer var (toplam 10).");
  });

  it("answers traffic per road", () => {
    expect(fallbackAnswer("Yolda trafik var mı?", campus)).toContain(
      "Kampüs İçi Yolu: trafik Yoğun (6 araç).",
    );
  });

  it("says so when no crowd place has a fresh reading", () => {
    const allStale = campus.map((p) => ({ ...p, stale: true }));
    const answer = fallbackAnswer("Kampüs şu an kalabalık mı?", allStale);
    expect(answer).toContain("Şu an güncel veri yok.");
    expect(answer).not.toMatch(/\d+ kişi/);
  });

  it("never lists one section's places as several busy places", () => {
    const plaza = [crowd("meydan", "Kütüphane meydanı", "Kütüphane", 20), ...campus];
    const answer = fallbackAnswer("Kampüs şu an kalabalık mı?", plaza);
    expect(answer).toContain("Kütüphane meydanı: 20 kişi");
    expect(answer).not.toContain("Kütüphane yolu");
    expect(answer).toContain("Taş Kafe önü: 11 kişi");
  });

  it("does not take students for the student dining hall", () => {
    const answer = fallbackAnswer("Öğrenciler en çok nerede kalabalık?", campus);
    expect(answer.split("\n")[1]).toBe("En kalabalık yerler:");
  });

  it("finds a place named with or without a suffix", () => {
    const faculty = fallbackAnswer("Fakülte kalabalık mı?", campus);
    expect(faculty).toContain("Bilişim Fakültesi: 6 kişi");
    expect(faculty).toContain("Fen-Edebiyat Fakültesi: 2 kişi");
    expect(fallbackAnswer("Fen Edebiyat kalabalık mı?", campus)).toContain("Fen-Edebiyat Fakültesi: 2 kişi");
  });

  it("does not take a short word for a place", () => {
    // "yol" asks about traffic, not about the area "Kütüphane yolu".
    const answer = fallbackAnswer("Yol trafiği nasıl?", campus);
    expect(answer).not.toContain("Kütüphane yolu");
    expect(answer).toContain("Kampüs İçi Yolu");
  });

  it("offers only what the places cover when it has no data", () => {
    const crowdOnly = campus.filter((p) => p.kind === "area" || p.kind === "building");
    const answer = fallbackAnswer("Otoparkta boş yer var mı?", crowdOnly);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("otopark");
    expect(answer).toContain("kalabalık");
  });
});

/** A stand-in OpenAI-compatible provider. */
async function startStubLlm(
  respond: (req: IncomingMessage, body: string) => { status: number; body: string; delayMs?: number },
) {
  const calls: { headers: IncomingMessage["headers"]; body: unknown }[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      calls.push({ headers: req.headers, body: JSON.parse(body) });
      const reply = respond(req, body);
      setTimeout(
        () => res.writeHead(reply.status, { "content-type": "application/json" }).end(reply.body),
        reply.delayMs ?? 0,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return { url, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const completion = (content: string) =>
  JSON.stringify({ choices: [{ message: { role: "assistant", content } }] });

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup) await close();
  cleanup = [];
});

async function setup(llm: Awaited<ReturnType<typeof startStubLlm>> | null, timeoutMs = 2000) {
  const client = llm
    ? createLlmClient({ baseUrl: llm.url, apiKey: API_KEY, model: "test-model", timeoutMs })
    : null;
  const server = await startServer(client);
  server.store.upsert(reading());
  cleanup.push(server.close, ...(llm ? [llm.close] : []));
  return server;
}

async function ask(url: string, message: string) {
  const response = await fetch(`${url}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return { status: response.status, text: await response.text() };
}

const data = (text: string) => (JSON.parse(text) as ApiResponse<AssistantResponse> & { success: true }).data;

describe("POST /api/assistant/chat", () => {
  it("uses the LLM answer when it responds", async () => {
    const llm = await startStubLlm(() => ({ status: 200, body: completion("Otopark A'da 12 boş yer var.") }));
    const server = await setup(llm);
    const { text } = await ask(server.url, "Otoparkta boş yer var mı?");
    expect(data(text)).toEqual({ answer: "Otopark A'da 12 boş yer var.", via: "llm" });
    const [call] = llm.calls as {
      headers: Record<string, string>;
      body: { model: string; messages: { role: string; content: string }[] };
    }[];
    expect(call.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(call.body.model).toBe("test-model");
    expect(call.body.messages[0]).toMatchObject({ role: "system" });
    expect(call.body.messages[0].content).toContain("12/40 boş");
    expect(call.body.messages[1]).toEqual({ role: "user", content: "Otoparkta boş yer var mı?" });
  });

  it("falls back when the LLM returns 500", async () => {
    const llm = await startStubLlm(() => ({ status: 500, body: "{}" }));
    const server = await setup(llm);
    const answer = data((await ask(server.url, "Otoparkta boş yer var mı?")).text);
    expect(answer.via).toBe("fallback");
    expect(answer.answer).toContain("Otopark A: 12 boş yer var (toplam 40)");
  });

  it("falls back when the LLM times out", async () => {
    const llm = await startStubLlm(() => ({ status: 200, body: completion("too late"), delayMs: 1500 }));
    const server = await setup(llm, 200);
    const started = Date.now();
    const answer = data((await ask(server.url, "Otoparkta boş yer var mı?")).text);
    expect(answer.via).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(1200);
  });

  it("never calls the LLM without a key", async () => {
    const llm = await startStubLlm(() => ({ status: 200, body: completion("should not be called") }));
    cleanup.push(llm.close);
    const server = await setup(null);
    expect(data((await ask(server.url, "Otoparkta boş yer var mı?")).text).via).toBe("fallback");
    expect(llm.calls).toHaveLength(0);
  });

  it("assistant never returns the API key", async () => {
    // A provider error that echoes the request headers, as some do.
    const llm = await startStubLlm((req) => ({
      status: 401,
      body: JSON.stringify({ error: `bad key: ${req.headers.authorization}` }),
    }));
    const server = await setup(llm);
    const { text } = await ask(server.url, "Otoparkta boş yer var mı?");
    expect(text).not.toContain(API_KEY);
    expect(data(text).via).toBe("fallback");
  });

  it("limits a client to 10 questions per minute", async () => {
    const server = await setup(null);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await ask(server.url, "Otopark?")).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
