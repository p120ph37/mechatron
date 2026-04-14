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

import { describe, test } from "bun:test";

// Default backend when none specified: ffi on every supported platform.
// CI explicitly sets MECHATRON_BACKEND for each invocation; this default
// is for `npm test` / `bun test` ergonomics.
const _envBackend = (process.env.MECHATRON_BACKEND || "").toLowerCase();
const backend: "ffi" | "napi" =
  _envBackend === "ffi" || _envBackend === "napi" ? _envBackend : "ffi";
process.env.MECHATRON_BACKEND = backend;

const SKIP_PLATFORM = false;
const describeMaybe = describe;

// ── Test helpers (mirrors test/test.js) ──────────────────────────────────────

const gExpected: Record<string, Record<string, boolean>> = {
  "linux-x64":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
  "linux-arm64":  { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
  "darwin-arm64": { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
  "darwin-x64":   { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
  "win32-x64":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
  "win32-ia32":   { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
};
const gPlatformKey = process.platform + "-" + process.arch;
const gExpect: Record<string, boolean> = gExpected[gPlatformKey] || {};

const log = (msg: string) => process.stdout.write(msg);
const assert = (cond: unknown, msg?: string) => {
  if (!cond) throw new Error("Assertion Failed" + (msg ? ": " + msg : ""));
};
const expectOrSkip = (capability: string, label: string) => {
  if (gExpect[capability]) {
    assert(false, `${label} — expected to work on ${gPlatformKey} but probe failed (regression!)`);
  }
};

// ── Load mechatron + per-subsystem test modules ──────────────────────────────

// `require("..")` resolves to lib/index.ts under the "bun" exports condition,
// so coverage attribution is against the TypeScript source files directly.
// Skip when SKIP_PLATFORM is true so that requiring an unsupported subsystem
// doesn't blow up at file load time.

let typesM: any, kbM: any, mouseM: any, clipM: any, procM: any, winM: any, scrM: any, memM: any;
let waitFor: (cond: () => boolean, timeoutMs: number) => boolean;

if (!SKIP_PLATFORM) {
  // Import the TypeScript source directly (not dist/index.js).  Bun
  // executes .ts natively, so coverage is attributed to lib/**/*.ts
  // — making FFI files visible to the lcov report.  Path-based
  // `require("..")` would resolve via package.json's `main` to
  // `dist/index.js` (the `exports` field's `"bun"` condition isn't
  // consulted for path requires).
  const mechatron: any = require("../lib");
  waitFor = (condFn, timeoutMs) => {
    if (condFn()) return true;
    for (let elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
      mechatron.Timer.sleep(5);
      if (condFn()) return true;
    }
    return false;
  };
  typesM = require("./types")(mechatron, log, assert);
  kbM    = require("./keyboard")(mechatron, log, assert, waitFor, expectOrSkip);
  mouseM = require("./mouse")(mechatron, log, assert, waitFor, expectOrSkip);
  clipM  = require("./clipboard")(mechatron, log, assert, waitFor, expectOrSkip);
  procM  = require("./process")(mechatron, log, assert, waitFor, expectOrSkip);
  winM   = require("./window")(mechatron, log, assert, waitFor, expectOrSkip);
  scrM   = require("./screen")(mechatron, log, assert, waitFor, expectOrSkip);
  memM   = require("./memory")(mechatron, log, assert, waitFor, expectOrSkip);

  log(`\nMECHATRON [${backend.toUpperCase()} backend] ${gPlatformKey}\n`);
  const expected = Object.keys(gExpect).filter((k) => gExpect[k]).join(", ");
  if (expected) log(`Expected: ${expected}\n`);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describeMaybe(`mechatron [${backend}]`, () => {
  test("availability", () => {
    const mechatron: any = require("../lib");
    for (const sub of ["keyboard", "mouse", "clipboard", "screen", "window", "process", "memory"]) {
      assert(typeof mechatron.isAvailable(sub) === "boolean", `isAvailable(${sub})`);
    }
    assert(mechatron.isAvailable("keyboard"), "keyboard available");
  });
  test("types",     () => typesM.testTypes());
  test("timer",     () => typesM.testTimer());
  test("keyboard",  () => kbM.testKeyboard());
  test("mouse",     () => mouseM.testMouse());
  test("clipboard", () => clipM.testClipboard());
  test("process",   () => procM.testProcess());
  test("window",    () => winM.testWindow());
  test("screen",    () => scrM.testScreen());
  test("memory",    () => memM.testMemory());
});
