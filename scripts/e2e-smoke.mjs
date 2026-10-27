// End-to-end smoke test: the real API and the real vision service (simulated mode) on spare ports.
// Passes when every camera has a fresh reading in the API and the assistant quotes a crowd camera's
// live count. Needs `npm run build:packages` and the vision package in services/vision/.venv (or $PYTHON).
//
//   node scripts/e2e-smoke.mjs

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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

const services = [];
try {
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
      VISION_DETECTOR: "simulated",
      VISION_CAMERAS_FILE: "configs/cameras.example.yaml",
      VISION_PUBLISH_INTERVAL_S: "1",
      VISION_PORT: "8101",
    }),
  );
  await until(
    async () => (await cameras()).every((camera) => !camera.stale),
    30_000,
    "fresh readings for every camera",
  );
  console.log(`ok: ${(await cameras()).length} cameras have fresh readings in the API`);

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
}
