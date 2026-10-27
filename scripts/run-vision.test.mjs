import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pickPython } from "./run-vision.mjs";

function visionDirWith(...pythonPath) {
  const dir = mkdtempSync(path.join(tmpdir(), "vision-"));
  if (pythonPath.length) {
    mkdirSync(path.join(dir, ...pythonPath.slice(0, -1)), { recursive: true });
    writeFileSync(path.join(dir, ...pythonPath), "");
  }
  return dir;
}

test("uses the venv's python on Linux and macOS", () => {
  const dir = visionDirWith(".venv", "bin", "python");
  assert.equal(pickPython(dir, "linux", {}), path.join(dir, ".venv", "bin", "python"));
});

test("uses the venv's python.exe on Windows", () => {
  const dir = visionDirWith(".venv", "Scripts", "python.exe");
  assert.equal(pickPython(dir, "win32", {}), path.join(dir, ".venv", "Scripts", "python.exe"));
});

test("falls back to $PYTHON without a venv", () => {
  assert.equal(
    pickPython(visionDirWith(), "linux", { PYTHON: "/opt/py/bin/python3" }),
    "/opt/py/bin/python3",
  );
});

test("finds nothing without a venv or $PYTHON", () => {
  assert.equal(pickPython(visionDirWith(), "linux", {}), null);
});
