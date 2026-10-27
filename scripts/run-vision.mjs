// Starts the vision service with services/vision/.venv's Python, so `npm run dev` works without
// activating the venv in that terminal. Falls back to $PYTHON, and says what to do when neither exists.
//
//   node scripts/run-vision.mjs        (what `npm run dev:vision` runs)

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The Python to run the vision service with: the venv's, else $PYTHON, else null. */
export function pickPython(visionDir, platform, env) {
  const venvPython =
    platform === "win32"
      ? path.join(visionDir, ".venv", "Scripts", "python.exe")
      : path.join(visionDir, ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return env.PYTHON || null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const visionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "services", "vision");
  const python = pickPython(visionDir, process.platform, process.env);
  if (!python) {
    console.error(
      "vision: no Python found. Create its venv once:\n" +
        "  cd services/vision\n  python -m venv .venv\n" +
        "  .venv\\Scripts\\activate   (macOS/Linux: source .venv/bin/activate)\n" +
        '  pip install -e ".[dev]"\n' +
        "or set PYTHON to a Python that has the vision package installed.",
    );
    process.exit(1);
  }
  const child = spawn(python, ["-m", "vision"], { cwd: visionDir, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
