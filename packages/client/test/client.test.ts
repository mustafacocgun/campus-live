import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrlProblem, askAssistant, isStaleSince, LEVEL_LABEL_TR } from "../src/index.js";

describe("isStaleSince", () => {
  it("is stale when the last reading arrived more than staleAfterMs ago, by this device's clock", () => {
    const received = Date.parse("2026-10-27T07:00:00.000Z");
    expect(isStaleSince(received, received + 14_999, 15_000)).toBe(false);
    expect(isStaleSince(received, received + 15_001, 15_000)).toBe(true);
    expect(isStaleSince(null, received, 15_000)).toBe(true);
  });
});

describe("presentation", () => {
  it("labels levels in Turkish", () => {
    expect(LEVEL_LABEL_TR).toEqual({ low: "Az", medium: "Orta", high: "Yoğun" });
  });
});

describe("apiUrlProblem", () => {
  it("apiUrlProblem flags localhost on a phone", () => {
    expect(apiUrlProblem("http://localhost:4000", "android")).toMatch(/localhost/);
    expect(apiUrlProblem("http://127.0.0.1:4000", "ios")).toMatch(/localhost/);
    expect(apiUrlProblem("http://192.168.1.20:4000", "android")).toBeNull();
    expect(apiUrlProblem("http://localhost:4000", "web")).toBeNull();
    expect(apiUrlProblem("", "ios")).toMatch(/EXPO_PUBLIC_API_URL/);
  });
});

describe("askAssistant errors (#11)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, status: number, contentType: string) =>
    vi.stubGlobal(
      "fetch",
      async () => new Response(body, { status, headers: { "content-type": contentType } }),
    );

  it("turns an HTML error page into a Turkish message, not a JSON parse error", async () => {
    respond("<html><body>502 Bad Gateway</body></html>", 502, "text/html");
    await expect(askAssistant("http://api", "soru")).rejects.toThrow(
      "API beklenmeyen bir yanıt verdi (HTTP 502).",
    );
  });

  it("turns an unreachable API into a Turkish message", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(askAssistant("http://api", "soru")).rejects.toThrow("API'ye ulaşılamadı.");
  });

  it("keeps the API's own error message", async () => {
    respond(
      JSON.stringify({ success: false, error: { message: "Çok fazla istek." } }),
      429,
      "application/json",
    );
    await expect(askAssistant("http://api", "soru")).rejects.toThrow("Çok fazla istek.");
  });

  it("returns the data of a successful response", async () => {
    const data = { answer: "Otopark A: 12 boş yer.", via: "fallback" };
    respond(JSON.stringify({ success: true, data }), 200, "application/json; charset=utf-8");
    await expect(askAssistant("http://api", "soru")).resolves.toEqual(data);
  });
});
