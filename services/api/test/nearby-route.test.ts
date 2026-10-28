import type { ApiResponse, AssistantResponse } from "@campus-live/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerQuestion } from "../src/modules/assistant/assistant.service.js";
import type { LlmClient } from "../src/modules/assistant/llm-client.js";
import { placeViews } from "../src/modules/assistant/places-view.js";
import { loadPlaces } from "../src/modules/places/place-registry.js";
import { env, ingest, reading, startServer } from "./helpers.js";

// Next to the fixture's "Otopark A" (around 30.3297, 40.7431), with enough decimals to spot in a prompt.
const LOCATION = { lat: 40.742913, lng: 30.329437 };

describe("nearest places through the assistant", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  const chat = async (body: unknown) => {
    const response = await fetch(`${server.url}/api/assistant/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as ApiResponse<AssistantResponse> };
  };

  it("answers from the user's position, without an LLM, and names the places", async () => {
    await ingest(server.url, { readings: [reading()] });
    const { status, body } = await chat({ message: "Bana en yakın otopark nerede?", location: LOCATION });
    expect(status).toBe(200);
    if (!body.success) throw new Error(body.error.message);
    expect(body.data.via).toBe("fallback");
    expect(body.data.answer.split("\n")[0]).toBe("Sana en yakın otoparklar (kuş uçuşu):");
    expect(body.data.answer).toContain("Otopark A:");
    expect(body.data.answer).toContain("12/40 boş yer");
    expect(body.data.places?.[0]).toMatchObject({ id: "a-otoparki", name: "Otopark A" });
  });

  it("refuses a position off the earth", async () => {
    const { status } = await chat({ message: "En yakın otopark?", location: { lat: 200, lng: 30 } });
    expect(status).toBe(400);
  });

  it("leaves questions without a nearby intent as they were", async () => {
    const { body } = await chat({ message: "Otoparkta boş yer var mı?", location: LOCATION });
    if (!body.success) throw new Error(body.error.message);
    expect(body.data.places).toBeUndefined();
  });
});

describe("what the LLM is told", () => {
  it("gets the nearest places with rounded distances, never the user's coordinates", async () => {
    const places = placeViews(loadPlaces(env.PLACES_FILE).list(), {
      places: [
        {
          id: "a-otoparki",
          count: 28,
          level: "medium",
          parking: { total: 40, free: 12 },
          stale: false,
          ageMs: 1_000,
          demo: true,
        },
      ],
      cells: [],
      at: new Date().toISOString(),
    });
    let sent = "";
    const llm: LlmClient = {
      async complete(messages) {
        sent = messages.map((message) => message.content).join("\n");
        return "Otopark A size en yakın otopark.";
      },
    };
    const answer = await answerQuestion("Bana en yakın otopark nerede?", {
      llm,
      places,
      now: new Date(),
      location: LOCATION,
    });
    expect(answer).toMatchObject({ via: "llm", places: [{ id: "a-otoparki" }] });
    expect(sent).toContain("YAKINDAKİ YERLER");
    expect(sent).toMatch(/Kullanıcıya en yakın otoparklar:\n- Otopark A: \d+0 m/);
    for (const digits of [String(LOCATION.lat), String(LOCATION.lng), "40.7429", "30.3294"]) {
      expect(sent).not.toContain(digits);
    }
  });
});
