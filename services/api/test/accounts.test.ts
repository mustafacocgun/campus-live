// Accounts and alerts against a real Postgres: DATABASE_URL_TEST (CI starts one; locally it comes from
// services/api/.env). Without it these tests are skipped, and the run says so.
import "dotenv/config";
import type { AlertNotification, AlertRule, ApiResponse, User } from "@campus-live/contracts";
import { SOCKET_EVENTS } from "@campus-live/contracts";
import { io as connect } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/database.js";
import { fakeMailer, ingest, reading, resetDb, startServer } from "./helpers.js";

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn("accounts.test.ts skipped: set DATABASE_URL_TEST to run it against Postgres.");

describe.skipIf(!url)("accounts and alerts (Postgres)", () => {
  let db: Db;
  let mailer: ReturnType<typeof fakeMailer>;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  beforeAll(() => {
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.end();
  });
  beforeEach(async () => {
    await resetDb(db);
    mailer = fakeMailer();
    server = await startServer(null, { db, mailer });
  });
  afterEach(async () => {
    // Undefined when beforeEach failed (the database is down): its error is the one to read.
    await server?.close();
    server = undefined;
  });

  /** The server of the running test (beforeEach started it). */
  const api = () => server!;

  async function call<T>(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
    const response = await fetch(`${api().url}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const body = (await response.json()) as ApiResponse<T>;
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .find((pair) => pair.startsWith("cl_session=") && pair !== "cl_session=");
    return { status: response.status, body, cookie };
  }

  const codeFrom = () => mailer.sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? "";

  /** A verified account and its session cookie. */
  async function signedIn(email = "ali@ogr.okul.edu.tr"): Promise<string> {
    await call("/api/auth/signup", { body: { email, password: "gizli-sifre-1" } });
    const { cookie } = await call<User>("/api/auth/verify", { body: { email, code: codeFrom() } });
    return cookie!;
  }

  describe("sign-up and sessions", () => {
    it("refuses an e-mail outside the school domains", async () => {
      const { status, body } = await call("/api/auth/signup", {
        body: { email: "ali@gmail.com", password: "gizli-sifre-1" },
      });
      expect(status).toBe(400);
      expect(!body.success && body.error.code).toBe("EMAIL_NOT_ALLOWED");
      expect(mailer.sent).toHaveLength(0);
    });

    it("mails a code, refuses login until it is entered, then signs in with a session cookie", async () => {
      const email = "Ali@OGR.okul.edu.tr";
      expect((await call("/api/auth/signup", { body: { email, password: "gizli-sifre-1" } })).status).toBe(
        202,
      );
      expect(mailer.sent[0].to).toBe("ali@ogr.okul.edu.tr");

      const early = await call("/api/auth/login", { body: { email, password: "gizli-sifre-1" } });
      expect(early.status).toBe(403);

      const wrong = codeFrom() === "000000" ? "000001" : "000000";
      expect((await call("/api/auth/verify", { body: { email, code: wrong } })).status).toBe(400);

      const verified = await call<User>("/api/auth/verify", { body: { email, code: codeFrom() } });
      expect(verified.status).toBe(200);
      expect(verified.cookie).toBeDefined();

      const me = await call<User>("/api/auth/me", { cookie: verified.cookie });
      expect(me.body.success && me.body.data.email).toBe("ali@ogr.okul.edu.tr");
    });

    it("locks the code after five wrong guesses", async () => {
      const email = "veli@okul.edu.tr";
      await call("/api/auth/signup", { body: { email, password: "gizli-sifre-1" } });
      const wrong = codeFrom() === "000000" ? "000001" : "000000";
      for (let i = 0; i < 5; i++) await call("/api/auth/verify", { body: { email, code: wrong } });
      expect((await call("/api/auth/verify", { body: { email, code: codeFrom() } })).status).toBe(429);
    });

    it("refuses a second sign-up for a verified e-mail and never replaces its password", async () => {
      await signedIn("ayse@okul.edu.tr");
      const again = await call("/api/auth/signup", {
        body: { email: "ayse@okul.edu.tr", password: "baska-sifre-9" },
      });
      expect(again.status).toBe(409);
      expect(
        (await call("/api/auth/login", { body: { email: "ayse@okul.edu.tr", password: "gizli-sifre-1" } }))
          .status,
      ).toBe(200);
    });

    it("logs in with the password, and logs out for good", async () => {
      await signedIn();
      const login = await call<User>("/api/auth/login", {
        body: { email: "ali@ogr.okul.edu.tr", password: "gizli-sifre-1" },
      });
      expect(login.status).toBe(200);
      expect(
        (await call("/api/auth/login", { body: { email: "ali@ogr.okul.edu.tr", password: "yanlis" } }))
          .status,
      ).toBe(401);
      await call("/api/auth/logout", { body: {}, cookie: login.cookie });
      expect((await call("/api/auth/me", { cookie: login.cookie })).status).toBe(401);
    });

    it("refuses a state-changing request from a site that is not allowed", async () => {
      const response = await fetch(`${api().url}/api/auth/logout`, {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(403);
    });
  });

  describe("alert rules", () => {
    it("needs a session", async () => {
      expect((await call("/api/alerts/rules")).status).toBe(401);
    });

    it("creates, lists, changes and deletes a rule for a place a camera feeds only", async () => {
      const cookie = await signedIn();
      const unknown = await call("/api/alerts/rules", {
        cookie,
        body: { place: "yok-boyle", direction: "below", thresholdPct: 60, email: false },
      });
      expect(unknown.status).toBe(400);

      const created = await call<AlertRule>("/api/alerts/rules", {
        cookie,
        body: { place: "kutuphane-alani", direction: "below", thresholdPct: 60, email: true },
      });
      expect(created.status).toBe(201);
      expect(created.body.success && created.body.data.placeName).toBe("Kütüphane girişi");
      const id = created.body.success ? created.body.data.id : "";

      const changed = await call<AlertRule>(`/api/alerts/rules/${id}`, {
        method: "PATCH",
        cookie,
        body: { thresholdPct: 40, enabled: false },
      });
      expect(changed.body.success && changed.body.data).toMatchObject({
        thresholdPct: 40,
        enabled: false,
        email: true,
      });

      const listed = await call<AlertRule[]>("/api/alerts/rules", { cookie });
      expect(listed.body.success && listed.body.data).toHaveLength(1);

      expect((await call(`/api/alerts/rules/${id}`, { method: "DELETE", cookie })).status).toBe(200);
      expect((await call(`/api/alerts/rules/${id}`, { method: "DELETE", cookie })).status).toBe(404);
    });

    it("never shows or changes another user's rule", async () => {
      const owner = await signedIn("sahip@okul.edu.tr");
      const created = await call<AlertRule>("/api/alerts/rules", {
        cookie: owner,
        body: { place: "kafe-alani", direction: "above", thresholdPct: 80, email: false },
      });
      const id = created.body.success ? created.body.data.id : "";
      const other = await signedIn("baska@okul.edu.tr");
      expect(
        (
          await call(`/api/alerts/rules/${id}`, {
            method: "PATCH",
            cookie: other,
            body: { thresholdPct: 10 },
          })
        ).status,
      ).toBe(404);
      const theirs = await call<AlertRule[]>("/api/alerts/rules", { cookie: other });
      expect(theirs.body.success && theirs.body.data).toEqual([]);
    });
  });

  describe("alerts", () => {
    const library = (count: number) =>
      reading({ cameraId: "kutuphane-giris", kind: "crowd", count, parking: undefined });

    async function notifications(cookie: string): Promise<AlertNotification[]> {
      const { body } = await call<AlertNotification[]>("/api/alerts/notifications", { cookie });
      return body.success ? body.data : [];
    }

    async function until(check: () => Promise<boolean>, what: string): Promise<void> {
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`timed out waiting for ${what}`);
    }

    it("notifies in the app and by e-mail once, when the region drops below the threshold", async () => {
      const cookie = await signedIn();
      await call("/api/alerts/rules", {
        cookie,
        body: { place: "kutuphane-alani", direction: "below", thresholdPct: 60, email: true },
      });
      const socket = connect(api().url, { transports: ["websocket"], extraHeaders: { cookie } });
      const received: AlertNotification[] = [];
      socket.on(SOCKET_EVENTS.notification, (notification: AlertNotification) => received.push(notification));
      await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
      // Joining the user's room waits for a database lookup.
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const mailsBefore = mailer.sent.length;
        await ingest(api().url, { readings: [library(8)] }); // 80%: seen, armed
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(await notifications(cookie)).toEqual([]);

        await ingest(api().url, { readings: [library(5)] }); // 50%: crossed
        await until(async () => received.length === 1, "the socket notification");
        expect(received[0]).toMatchObject({
          place: "kutuphane-alani",
          placeName: "Kütüphane girişi",
          percent: 50,
          thresholdPct: 60,
          demo: true,
        });
        expect(received[0].message).toBe("Kütüphane girişi doluluğu %50: %60 eşiğinin altına indi.");
        await until(async () => mailer.sent.length === mailsBefore + 1, "the alert e-mail");
        expect(mailer.sent.at(-1)).toMatchObject({ to: "ali@ogr.okul.edu.tr" });
        expect(mailer.sent.at(-1)?.text).toContain("Demo verisi");

        await ingest(api().url, { readings: [library(4)] }); // still below: no second alert
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(await notifications(cookie)).toHaveLength(1);
      } finally {
        socket.close();
      }
    });

    it("sends nothing while the region's cameras are silent", async () => {
      const cookie = await signedIn();
      await call("/api/alerts/rules", {
        cookie,
        body: { place: "kafe-alani", direction: "below", thresholdPct: 90, email: false },
      });
      await ingest(api().url, { readings: [library(1)] }); // another region only
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(await notifications(cookie)).toEqual([]);
    });

    it("marks notifications read", async () => {
      const cookie = await signedIn();
      await call("/api/alerts/rules", {
        cookie,
        body: { place: "kutuphane-alani", direction: "above", thresholdPct: 50, email: false },
      });
      await ingest(api().url, { readings: [library(2)] });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await ingest(api().url, { readings: [library(9)] });
      await until(async () => (await notifications(cookie)).length === 1, "the notification");
      const read = await call<{ updated: number }>("/api/alerts/notifications/read", { cookie, body: {} });
      expect(read.body.success && read.body.data.updated).toBe(1);
      expect((await notifications(cookie))[0].readAt).not.toBeNull();
    });
  });
});
