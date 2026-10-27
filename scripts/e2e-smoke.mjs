// End-to-end smoke test: the real API and the real vision service on spare ports, counting synthetic
// test clips with the test-boxes detector (no footage or GPU needed). Passes when every camera has a
// fresh reading with density cells inside its own view cone, and the assistant quotes a crowd camera's
// live count. Needs `npm run build:packages` and the vision package in services/vision/.venv (or $PYTHON).
//
//   node scripts/e2e-smoke.mjs

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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

const cameras = async () => (await (await fetch(`${API}/api/cameras`)).json()).data;

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
  // Every camera reports; outdoor crowd cameras also say where people are (indoor ones count only).
  const outdoorCrowd = (camera) => camera.kind === "crowd" && !camera.indoor;
  await until(
    async () =>
      (await cameras()).every(
        (camera) => !camera.stale && (!outdoorCrowd(camera) || camera.reading.cells?.length),
      ),
    60_000,
    "fresh readings from every camera, with density cells outdoors",
  );
  const all = await cameras();
  const live = all.filter(outdoorCrowd);
  console.log(
    `ok: ${all.length} cameras have fresh readings; ${live.length} outdoor ones send density cells`,
  );
  const lots = all.filter((camera) => camera.kind === "parking");
  if (!lots.every((camera) => camera.reading.parking?.total > 0))
    throw new Error("a parking camera has no slots");
  if (all.some((camera) => camera.indoor && camera.reading.cells))
    throw new Error("an indoor camera sent cells");
  console.log(`ok: ${lots.length} parking cameras report free/total; indoor cameras send counts only`);
  // The heat must land where each camera looks: the service's pose wiring and map offsets are checked
  // here. The projection's own geometry is not (the test clips are drawn through it, so a wrong
  // homography cancels out): test_projection.py pins that with hand-derived values.
  const strays = live.flatMap((camera) =>
    camera.reading.cells
      .map((cell) => outsideCone(camera, cell))
      .filter(Boolean)
      .map((why) => `${camera.id}: a cell ${why}`),
  );
  if (strays.length) throw new Error(`cells outside their camera's cone:\n${strays.slice(0, 10).join("\n")}`);
  const total = live.reduce((sum, camera) => sum + camera.reading.cells.length, 0);
  console.log(`ok: all ${total} cells lie inside their camera's view cone`);

  const tasKafe = async () => (await cameras()).find((camera) => camera.id === "tas-kafe");
  const before = await tasKafe();
  const response = await fetch(`${API}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Taş Kafe kalabalık mı?" }),
  });
  const { answer, via } = (await response.json()).data;
  const after = await tasKafe();
  const phrase = (camera) => `Taş Kafe: ${camera.reading.count} kişi`;
  // Readings change every second, so the answer may match the state just before or just after it.
  if (via !== "fallback" || ![before, after].some((camera) => answer.includes(phrase(camera)))) {
    throw new Error(`the assistant did not quote Taş Kafe's live count:\n${answer}`);
  }
  console.log(`ok: the assistant quoted Taş Kafe's live count (${phrase(before)})`);
  console.log("E2E SMOKE PASSED");
} catch (error) {
  console.error(`E2E SMOKE FAILED: ${error.message}`);
  for (const service of services) console.error(`--- ${service.name} log ---\n${service.log().slice(-2000)}`);
  process.exitCode = 1;
} finally {
  services.forEach(stop);
  rmSync(clips, { recursive: true, force: true });
}
