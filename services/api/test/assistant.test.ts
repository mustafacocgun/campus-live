import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiResponse, AssistantResponse, LiveCamera } from "@campus-live/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { fallbackAnswer } from "../src/modules/assistant/fallback-answer.js";
import { buildLiveContext } from "../src/modules/assistant/live-context.js";
import { createLlmClient } from "../src/modules/assistant/llm-client.js";
import { reading, startServer } from "./helpers.js";

const NOW = new Date("2026-10-27T07:00:10.000Z");
const FOUR_SECONDS_AGO = "2026-10-27T07:00:06.000Z";
const API_KEY = "sk-test-secret-key";

const cameras: LiveCamera[] = [
  {
    id: "kutuphane-giris",
    name: "Kütüphane girişi",
    section: "Kütüphane",
    kind: "crowd",
    latitude: 40.7412,
    longitude: 30.3306,
    heading: 0,
    fovDeg: 70,
    rangeM: 30,
    stale: false,
    ageMs: 4_000,
    reading: {
      cameraId: "kutuphane-giris",
      kind: "crowd",
      count: 23,
      level: "medium",
      source: "simulated",
      measuredAt: FOUR_SECONDS_AGO,
    },
  },
  {
    id: "kafe-merkez",
    name: "Merkez kafe",
    section: "Kafeler",
    kind: "crowd",
    latitude: 40.7419,
    longitude: 30.3318,
    heading: 0,
    fovDeg: 70,
    rangeM: 30,
    stale: false,
    ageMs: 4_000,
    reading: {
      cameraId: "kafe-merkez",
      kind: "crowd",
      count: 7,
      level: "low",
      source: "simulated",
      measuredAt: FOUR_SECONDS_AGO,
    },
  },
  {
    id: "otopark-a",
    name: "Otopark A",
    section: "Otoparklar",
    kind: "parking",
    latitude: 40.7431,
    longitude: 30.3297,
    heading: 0,
    fovDeg: 70,
    rangeM: 30,
    stale: false,
    ageMs: 4_000,
    reading: reading({ measuredAt: FOUR_SECONDS_AGO }),
  },
  {
    id: "ana-yol",
    name: "Kampüs ana yolu",
    section: "Yollar",
    kind: "traffic",
    latitude: 40.7405,
    longitude: 30.333,
    heading: 0,
    fovDeg: 70,
    rangeM: 30,
    stale: true,
    ageMs: 3_600_000,
    reading: {
      cameraId: "ana-yol",
      kind: "traffic",
      count: 9,
      level: "medium",
      source: "simulated",
      measuredAt: "2026-10-27T06:00:00.000Z",
    },
  },
];

describe("live context and fallback", () => {
  it("context carries exact free-slot numbers", () => {
    const context = buildLiveContext(cameras, NOW);
    expect(context).toContain(
      "Otopark A (Otoparklar, otopark): 12/40 boş, seviye Orta, 4 sn önce, demo verisi",
    );
    expect(context).toContain("Kütüphane girişi (Kütüphane, kalabalık): 23 kişi, seviye Orta");
  });

  it("stale cameras are not reported as current", () => {
    expect(buildLiveContext(cameras, NOW)).toContain("Kampüs ana yolu (Yollar, trafik): güncel veri yok");
    const answer = fallbackAnswer("Trafik nasıl?", cameras, NOW);
    expect(answer).toContain("güncel veri yok");
    expect(answer).not.toContain("9 araç");
  });

  it("fallback says it has no data for unrelated questions", () => {
    const answer = fallbackAnswer("Yarınki sınav saat kaçta?", cameras, NOW);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("Otopark A");
  });

  it("fallback summarises everything for a general question", () => {
    const answer = fallbackAnswer("Kampüste genel durum ne?", cameras, NOW);
    for (const name of ["Kütüphane girişi", "Otopark A", "Kampüs ana yolu"]) expect(answer).toContain(name);
  });

  it("fallback says a full lot has no free slots", () => {
    const full = cameras.map((camera) =>
      camera.id === "otopark-a"
        ? {
            ...camera,
            reading: reading({
              count: 40,
              level: "high",
              parking: { total: 40, free: 0 },
              measuredAt: FOUR_SECONDS_AGO,
            }),
          }
        : camera,
    );
    const answer = fallbackAnswer("Otoparkta boş yer var mı?", full, NOW);
    expect(answer).toContain("Otopark A: boş yer yok (40 yerin hepsi dolu)");
    expect(answer).not.toContain("0 boş yer var");
  });

  it("answers the place the question names, before the kind of question", () => {
    const cafe = fallbackAnswer("Kafede boş yer var mı?", cameras, NOW);
    expect(cafe).toContain("Merkez kafe: 7 kişi");
    expect(cafe).not.toContain("Otopark A");
    const library = fallbackAnswer("Kütüphanede boş yer var mı?", cameras, NOW);
    expect(library).toContain("Kütüphane girişi: 23 kişi");
    expect(library).not.toContain("Otopark A");
  });

  it("answers only the named camera of a kind", () => {
    const answer = fallbackAnswer("Kafe kalabalık mı?", cameras, NOW);
    expect(answer).toContain("Merkez kafe");
    expect(answer).not.toContain("Kütüphane girişi");
  });

  it("says it has no data for a place without a camera", () => {
    const answer = fallbackAnswer("Yemekhane kalabalık mı?", cameras, NOW);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("23 kişi");
  });

  it("fallback quotes the live numbers", () => {
    for (const question of ["Otoparkta boş yer var mı?", "otoparkta bos yer var mi"]) {
      const answer = fallbackAnswer(question, cameras, NOW);
      expect(answer).toContain("Otopark A: 12 boş yer var (toplam 40)");
      expect(answer).not.toContain("Kütüphane");
    }
  });
});

describe("fallback on the campus map", () => {
  const crowdCamera = (
    id: string,
    name: string,
    section: string,
    count: number,
    stale = false,
  ): LiveCamera => ({
    id,
    name,
    section,
    kind: "crowd",
    latitude: 40.742,
    longitude: 30.332,
    heading: 0,
    fovDeg: 70,
    rangeM: 30,
    stale,
    ageMs: stale ? 3_600_000 : 4_000,
    reading: {
      cameraId: id,
      kind: "crowd",
      count,
      level: count >= 10 ? "high" : "medium",
      source: "demo-footage",
      measuredAt: FOUR_SECONDS_AGO,
    },
  });
  const campus = [
    crowdCamera("kutuphane-bati", "Kütüphane batı", "Kütüphane", 4),
    crowdCamera("kutuphane-yolu", "Kütüphane yolu", "Kütüphane", 5),
    crowdCamera("tas-kafe", "Taş Kafe", "Kafeler", 11),
    crowdCamera("yemekhane", "Öğrenci Yemekhanesi", "Yemekhane", 8),
    crowdCamera("bilisim", "Bilişim Fakültesi", "Fakülteler", 6),
    crowdCamera("fen-edebiyat", "Fen-Edebiyat Fakültesi", "Fakülteler", 2),
    crowdCamera("rektorluk", "Rektörlük", "Kampüs binaları", 30, true),
  ];

  it("the fallback names the busiest crowd camera for a general crowd question", () => {
    const answer = fallbackAnswer("Kampüs şu an kalabalık mı?", campus, NOW);
    const [header, first] = answer.split("\n");
    expect(header).toBe("Canlı verilere göre en kalabalık yerler:");
    expect(first).toContain("Taş Kafe: 11 kişi");
    expect(answer).toContain("Öğrenci Yemekhanesi: 8 kişi");
    expect(answer).not.toContain("Fen-Edebiyat"); // the busiest three only
    expect(answer).not.toContain("Rektörlük"); // no fresh reading: never "the busiest"
  });

  it("says so when no crowd camera has a fresh reading", () => {
    const allStale = campus.map((camera) => ({ ...camera, stale: true }));
    const answer = fallbackAnswer("Kampüs şu an kalabalık mı?", allStale, NOW);
    expect(answer).toContain("Kalabalık: şu an hiçbir kameradan güncel veri yok.");
    expect(answer).not.toMatch(/\d+ kişi/);
  });

  it("finds a place named with or without a suffix", () => {
    const faculty = fallbackAnswer("Fakülte kalabalık mı?", campus, NOW);
    expect(faculty).toContain("Bilişim Fakültesi: 6 kişi");
    expect(faculty).toContain("Fen-Edebiyat Fakültesi: 2 kişi");
    expect(fallbackAnswer("Fen Edebiyat kalabalık mı?", campus, NOW)).toContain(
      "Fen-Edebiyat Fakültesi: 2 kişi",
    );
  });

  it("does not take a short word for a place", () => {
    // "yol" asks about traffic, not about the walkway camera "Kütüphane yolu".
    const answer = fallbackAnswer("Yol trafiği nasıl?", campus, NOW);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("Kütüphane yolu");
  });

  it("offers only what the cameras count when it has no data", () => {
    const answer = fallbackAnswer("Otoparkta boş yer var mı?", campus, NOW);
    expect(answer).toContain("Bu konuda verim yok");
    expect(answer).not.toContain("Otopark");
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
