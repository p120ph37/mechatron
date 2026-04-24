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

// Bun 1.3.13 crashes on macOS when the FFI window module's dlopen symbols
// (Accessibility framework, extra CF/CG symbols) are loaded — the crash is
// in Bun's internal C++ JIT thunk cleanup, not in our code.  Force the
// window subsystem to NAPI on macOS when the primary backend is FFI so the
// problematic symbols are never loaded.  NAPI window support is complete on
// macOS, so this loses no coverage.
if (process.platform === "darwin" && _baseBackend === "ffi" && !process.env.MECHATRON_BACKEND_WINDOW) {
  process.env.MECHATRON_BACKEND_WINDOW = "napi";
}

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
        // Bun ≤ 1.3.13 crashes in bun:ffi's JIT thunk GC on macOS when
        // Bun.gc(true) runs after many dlopen'd symbols are active.
        if (needsGC && process.platform !== "darwin" && typeof (globalThis as any).Bun?.gc === "function") {
          (globalThis as any).Bun.gc(true);
        }
        if (!compatMatrix.shouldRun(entry.functions)) {
          log(`  ${displayName} (skipped: matrix)\n`);
          return;
        }
        await entry.test();
      }, timeout);
    }
  }

  // Bun ≤ 1.3.13 segfaults in bun:ffi's dlclose cleanup during process
  // shutdown on macOS.  Force a clean exit after all tests and reporter
  // output have been flushed — afterAll runs after bun:test has written
  // JUnit XML and coverage, so process.exit here bypasses the faulty
  // native teardown.
  if (process.platform === "darwin") {
    afterAll(() => {
      process.exit(process.exitCode ?? 0);
    });
  }
});
