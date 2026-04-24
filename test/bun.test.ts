/**
 * bun:test entrypoint for mechatron.
 *
 * Runs the existing per-subsystem test factories (test/{keyboard,mouse,...}.js)
 * inside `bun:test` `describe`/`test` blocks so that:
 *
 *   - bun's `--coverage` flag observes both the napi loader (`lib/napi.ts`)
 *     and the pure-FFI implementations (`lib/ffi/*.ts`) — c8 (V8 protocol)
 *     can't see Bun's JavaScriptCore execution at all, which is why the
 *     legacy `test/test.js` runner produced no FFI coverage.
 *   - JUnit XML output is produced via `bun test --reporter=junit`.
 *
 * Backend selection: required via `MECHATRON_BACKEND=ffi|napi`.  Each backend
 * is a separate `bun test` invocation in CI (because the loader caches the
 * choice on first access).
 *
 * The legacy `test/test.js` runner is retained for the Windows ia32 cell
 * (Bun has no 32-bit Windows build) and for any direct `node` invocations.
 */

import { describe, test, afterAll } from "bun:test";

// Default backend when none specified: ffi on every supported platform.
// CI explicitly sets MECHATRON_BACKEND for each invocation; this default
// is for `npm test` / `bun test` ergonomics.
const _envBackend = (process.env.MECHATRON_BACKEND || "").toLowerCase();
const _baseBackend = _envBackend.replace(/\[.*$/, "").split(",")[0];
const backend: string =
  _baseBackend === "ffi" || _baseBackend === "napi" || _baseBackend === "nolib"
    ? _envBackend
    : "ffi";
process.env.MECHATRON_BACKEND = backend;

// ── Test helpers (mirrors test/test.js) ──────────────────────────────────────

const log = (msg: string) => process.stdout.write(msg);
const assert = (cond: unknown, msg?: string) => {
  if (!cond) throw new Error("Assertion Failed" + (msg ? ": " + msg : ""));
};

// ── Load mechatron + per-subsystem test modules ──────────────────────────────

const mechatron: any = require("../lib");
const waitFor = (condFn: () => boolean, timeoutMs: number) => {
  if (condFn()) return true;
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
    mechatron.Timer.sleep(5);
    if (condFn()) return true;
  }
  return false;
};

const waitForAsync = async (condFn: () => Promise<boolean>, timeoutMs: number) => {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
    if (await condFn()) return true;
    await new Promise(r => setTimeout(r, 5));
  }
  return false;
};

const compatMatrix = require("./matrix").create(mechatron);

type TestEntry = { name: string; functions: string[]; test: () => any };

// Each entry declares the COMPATIBILITY.md functions it touches; matrix.js
// derives the column per-function from platform + getBackend(subsystem).
const allModules: Array<{ prefix: string; entries: TestEntry[] }> = [
  { prefix: "types",     entries: require("./types")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "keyboard",  entries: require("./keyboard")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "mouse",     entries: require("./mouse")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "clipboard", entries: require("./clipboard")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "process",   entries: require("./process")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "window",    entries: require("./window")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "screen",    entries: require("./screen")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "memory",    entries: require("./memory")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "uinput",    entries: require("./uinput")(mechatron, log, assert, waitFor, waitForAsync) },
  { prefix: "xproto",    entries: require("./xproto")(mechatron, log, assert, waitFor, waitForAsync) },
];

log(`\nMECHATRON [${backend.toUpperCase()} backend] ${process.platform}-${process.arch}\n`);
if (compatMatrix.available) {
  log(`Matrix: loaded\n`);
}

// ── Suite ────────────────────────────────────────────────────────────────────

const exercisedFunctions = new Set<string>();

describe(`mechatron [${backend}]`, () => {
  test("availability", () => {
    for (const sub of ["keyboard", "mouse", "clipboard", "screen", "window", "process", "memory"]) {
      assert(typeof mechatron.isAvailable(sub) === "boolean", `isAvailable(${sub})`);
    }
  });

  let _prevPrefix = "";
  for (const mod of allModules) {
    for (const entry of mod.entries) {
      const displayName = `${mod.prefix}: ${entry.name}`;
      const timeout = mod.prefix === "window" ? 15000 : undefined;
      const needsGC = mod.prefix !== _prevPrefix;
      _prevPrefix = mod.prefix;
      test(displayName, async () => {
        if (needsGC && typeof (globalThis as any).Bun?.gc === "function") {
          (globalThis as any).Bun.gc(true);
        }
        if (!compatMatrix.shouldRun(entry.functions)) {
          log(`  ${displayName} (skipped: matrix)\n`);
          return;
        }
        for (const fn of entry.functions) exercisedFunctions.add(fn);
        await entry.test();
      }, timeout);
    }
  }

  afterAll(() => {
    if (!compatMatrix.available) return;
    const okCells: string[] = compatMatrix.getOkCells();
    const unexercised = okCells.filter((fn: string) => !exercisedFunctions.has(fn));
    log(`\nMatrix cross-check: ${exercisedFunctions.size}/${okCells.length} ok cells exercised.`);
    if (unexercised.length > 0) log(` Missing: ${unexercised.join(", ")}`);
    log("\n");

    const outDir = process.env.RUNNER_TEMP;
    if (outDir) {
      const fs = require("fs");
      const path = require("path");
      const exDir = path.join(outDir, "exercised");
      fs.mkdirSync(exDir, { recursive: true });
      const safeBackend = backend.replace(/[\[\]]/g, "_");
      const fname = `${process.platform}-${process.arch}-${safeBackend}.json`;
      fs.writeFileSync(
        path.join(exDir, fname),
        JSON.stringify({ platform: process.platform, arch: process.arch,
          backend, exercised: [...exercisedFunctions], okCells }) + "\n",
      );
    }
  });

});
