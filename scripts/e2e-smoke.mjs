// End-to-end smoke test: the real API and the real vision service on spare ports, counting synthetic
// test clips with the test-boxes detector (no footage or GPU needed). Passes when every camera has a
// reading, every place is live in the snapshot, the heat lies inside the outdoor cameras' view cones,
// the assistant quotes a place's live count, and no public payload holds a camera id or position.
// Needs `npm run build:packages` and the vision package in services/vision/.venv (or $PYTHON).
//
//   node scripts/e2e-smoke.mjs

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPython } from "./run-vision.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The vision venv's Python, else $PYTHON, else the system Python.
const python =
  pickPython(path.join(root, "services", "vision"), process.platform, process.env) ??
  (process.platform === "win32" ? "python" : "python3");
const token = randomBytes(24).toString("base64url");
const API = "http://127.0.0.1:4100";

function start(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd: path.join(root, cwd),
    env: { ...process.env, ...env },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  return { name, child, log: () => log };
}

function stop({ child }) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else process.kill(-child.pid, "SIGTERM");
}

async function until(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const VISION = "http://127.0.0.1:8101";
const get = async (route) => (await (await fetch(`${API}${route}`)).json()).data;
// The private camera registry. A test may read the file; no public route or event serves it.
const registry = JSON.parse(readFileSync(path.join(root, "config", "cameras.json"), "utf8")).cameras;
const spot = (lng, lat) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

/** Every camera id or camera position anywhere in a public payload (CLAUDE.md §0.2). */
function leaks(payload) {
  const ids = new Set(registry.map((camera) => camera.id));
  const spots = new Set(registry.map((camera) => spot(camera.longitude, camera.latitude)));
  const found = [];
  const walk = (value, where) => {
    if (typeof value === "string" && ids.has(value)) found.push(`${where}: camera id ${value}`);
    if (Array.isArray(value)) {
      const [a, b] = value;
      if (value.length === 2 && typeof a === "number" && typeof b === "number" && spots.has(spot(a, b)))
        found.push(`${where}: a camera position`);
      value.forEach((item, i) => walk(item, `${where}[${i}]`));
    } else if (value && typeof value === "object") {
      if (
        typeof value.lat === "number" &&
        typeof value.lng === "number" &&
        spots.has(spot(value.lng, value.lat))
      )
        found.push(`${where}: a camera position`);
      for (const [key, item] of Object.entries(value)) {
        if (ids.has(key)) found.push(`${where}.${key}: camera id`);
        walk(item, `${where}.${key}`);
      }
    }
  };
  walk(payload, "$");
  return found;
}

// Half the diagonal of a 3 m cell: a cell's centre may sit this far from the feet binned into it.
const CELL_SLACK_M = 2.2;

/** Why a cell cannot come from this camera's view, or null when it can. */
function outsideCone(camera, cell) {
  const north = (cell.lat - camera.latitude) * 111_320;
  const east = (cell.lng - camera.longitude) * 111_320 * Math.cos((camera.latitude * Math.PI) / 180);
  const distance = Math.hypot(east, north);
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  const off = Math.abs(((bearing - camera.heading + 540) % 360) - 180);
  const slack = (Math.atan2(CELL_SLACK_M, Math.max(distance, 1)) * 180) / Math.PI;
  if (distance > camera.rangeM + CELL_SLACK_M)
    return `${distance.toFixed(1)} m away, range ${camera.rangeM} m`;
  if (off > camera.fovDeg / 2 + slack)
    return `${off.toFixed(0)}° off its heading, view ±${camera.fovDeg / 2}°`;
  return null;
}

const clips = mkdtempSync(path.join(tmpdir(), "campus-live-clips-"));
const services = [];
try {
  execFileSync(python, ["tools/make_test_clips.py", "--out", clips, "--seconds", "10"], {
    cwd: path.join(root, "services", "vision"),
    stdio: "inherit",
  });

  services.push(
    start("api", process.execPath, ["--import", "tsx", "src/index.ts"], "services/api", {
      PORT: "4100",
      VISION_INGEST_TOKEN: token,
      LLM_API_KEY: "", // the rule-based assistant, so the answer is deterministic
    }),
  );
  await until(async () => (await fetch(`${API}/api/health`)).ok, 20_000, "the API");

  services.push(
    start("vision", python, ["-m", "vision"], "services/vision", {
      VISION_API_URL: API,
      VISION_INGEST_TOKEN: token,
      VISION_DETECTOR: "test-boxes",
      VISION_CAMERAS_FILE: path.join(clips, "cameras.yaml"),
      VISION_PUBLISH_INTERVAL_S: "0.5",
      VISION_PORT: "8101",
    }),
  );
  // Every camera makes readings, by the vision service's own status (private, like the registry).
  await until(
    async () => {
      const { cameras } = await (await fetch(`${VISION}/status`)).json();
      return (
        cameras.length === registry.length && cameras.every((camera) => camera.lastReadingAt && !camera.error)
      );
    },
    60_000,
    "a reading from every camera",
  );
  console.log(`ok: all ${registry.length} cameras make readings`);
  // The apps' view: every place has a camera, so with every camera reporting every place is live.
  await until(
    async () => {
      const live = await get("/api/live");
      return live.places.every((place) => !place.stale) && live.cells.length > 0;
    },
    30_000,
    "every place live in /api/live, with heat",
  );
  const map = await get("/api/places");
  const { places } = map;
  const snapshot = await get("/api/live");
  if (snapshot.places.length !== places.length) throw new Error("a place is missing from /api/live");
  console.log(
    `ok: all ${places.length} places are live in /api/live, with ${snapshot.cells.length} heat cells`,
  );
  const kindOf = new Map(places.map((place) => [place.id, place.kind]));
  const lots = snapshot.places.filter((place) => kindOf.get(place.id) === "parking");
  if (!lots.length || !lots.every((place) => place.parking?.total > 0))
    throw new Error("a parking lot has no slots");
  // The test clips park yellow cars in slots and drive them along roads: zero everywhere would mean
  // the vehicle detection or the analyzers see nothing.
  const taken = lots.reduce((sum, place) => sum + place.parking.total - place.parking.free, 0);
  const roads = snapshot.places.filter((place) => kindOf.get(place.id) === "road");
  const vehicles = roads.reduce((sum, place) => sum + (place.count ?? 0), 0);
  if (!taken || !vehicles)
    throw new Error(`no cars seen: ${taken} slots taken, ${vehicles} vehicles on roads`);
  console.log(
    `ok: ${lots.length} parking lots report free/total, ${taken} slots taken; ${roads.length} roads count ${vehicles} vehicles`,
  );
  // The heat must land where outdoor cameras look: the service's pose wiring and map offsets are checked
  // here. The heat no longer says which camera a cell came from, so each cell must lie in the cone of
  // some outdoor camera; indoor cameras send none. The projection's own geometry is not checked (the
  // test clips are drawn through it, so a wrong homography cancels out): test_projection.py pins it.
  const outdoor = registry.filter((camera) => camera.kind === "crowd" && !camera.indoor);
  const strays = snapshot.cells.filter((cell) => outdoor.every((camera) => outsideCone(camera, cell)));
  if (strays.length) {
    throw new Error(`heat cells outside every outdoor camera's cone: ${JSON.stringify(strays.slice(0, 5))}`);
  }
  console.log(`ok: all ${snapshot.cells.length} heat cells lie inside an outdoor camera's view cone`);

  const area = places.find((place) => place.name === "Taş Kafe önü");
  const state = async () => (await get("/api/live")).places.find((place) => place.id === area.id);
  const before = await state();
  const response = await fetch(`${API}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Taş Kafe kalabalık mı?" }),
  });
  const { answer, via } = (await response.json()).data;
  const after = await state();
  const phrase = (place) => `Taş Kafe önü: ${place.count} kişi`;
  // Readings change every second, so the answer may match the state just before or just after it.
  if (via !== "fallback" || ![before, after].some((place) => answer.includes(phrase(place)))) {
    throw new Error(`the assistant did not quote Taş Kafe önü's live count:\n${answer}`);
  }
  console.log(`ok: the assistant quoted Taş Kafe önü's live count (${phrase(before)})`);

  // Nothing public names or locates a camera: the map, the live state, the assistant's answer.
  const found = [map, snapshot, await get("/api/live"), { answer }].flatMap(leaks);
  const named = registry.filter((camera) => answer.includes(camera.id)).map((camera) => camera.id);
  if (found.length || named.length)
    throw new Error(`camera data in a public payload: ${[...found, ...named].slice(0, 5)}`);
  console.log("ok: no public payload holds a camera id or position");
  console.log("E2E SMOKE PASSED");
} catch (error) {
  console.error(`E2E SMOKE FAILED: ${error.message}`);
  for (const service of services) console.error(`--- ${service.name} log ---\n${service.log().slice(-2000)}`);
  process.exitCode = 1;
} finally {
  services.forEach(stop);
  rmSync(clips, { recursive: true, force: true });
}
