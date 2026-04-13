/**
 * Unified native module loader.
 *
 * Two backends are supported:
 *
 *   - **NAPI**: per-subsystem `.node` binary loaded from
 *     `@mechatronic/napi-<sub>`.  Standard for Node.js.  Also works in Bun.
 *
 *   - **FFI** (Bun only): pure-TypeScript wrapper around `bun:ffi` that
 *     dlopens the platform's system libraries directly (libX11/libXtst on
 *     Linux, user32.dll on Windows).  No native build step on the consumer
 *     end and no `.node` / `.so` / `.dll` shipped — Bun loads our raw
 *     TypeScript via the `"bun"` exports condition in package.json.
 *
 * Backend selection: when running in Bun, FFI is preferred and falls back
 * to NAPI if a particular subsystem is not yet implemented in pure FFI.
 * In Node.js, NAPI is the only option.  The `MECHATRON_BACKEND`
 * environment variable can force a specific choice (`napi` or `ffi`).
 *
 * Regardless of backend, callers see a uniform object whose method names
 * match the napi `js_name` exports (e.g. `keyboard_getKeyState`).
 */

const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = typeof SUBSYSTEMS[number];
export type Backend = "napi" | "ffi";

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";

function envBackend(): Backend | null {
  const v = (process.env.MECHATRON_BACKEND || "").toLowerCase();
  return v === "napi" || v === "ffi" ? v : null;
}

function napiNodeFile(subsystem: string): string {
  const p = process.platform;
  const a = process.arch;
  const map: Record<string, string> = {
    "linux-x64":    `mechatron-${subsystem}.linux-x64-gnu.node`,
    "linux-arm64":  `mechatron-${subsystem}.linux-arm64-gnu.node`,
    "darwin-x64":   `mechatron-${subsystem}.darwin-x64.node`,
    "darwin-arm64": `mechatron-${subsystem}.darwin-arm64.node`,
    "win32-x64":    `mechatron-${subsystem}.win32-x64-msvc.node`,
    "win32-ia32":   `mechatron-${subsystem}.win32-ia32-msvc.node`,
  };
  return map[`${p}-${a}`] || `mechatron-${subsystem}.${p}-${a}.node`;
}

const _cache: Partial<Record<Subsystem, any>> = {};
const _backend: Partial<Record<Subsystem, Backend>> = {};
const _errors: Partial<Record<Subsystem, Error>> = {};

function tryLoadNapi(subsystem: Subsystem): any | null {
  try {
    const path = require("path");
    const pkgDir = path.dirname(
      require.resolve(`@mechatronic/napi-${subsystem}/package.json`)
    );
    return require(path.join(pkgDir, napiNodeFile(subsystem)));
  } catch (_) {
    return null;
  }
}

function tryLoadFfi(subsystem: Subsystem): any | null {
  if (!IS_BUN) return null;
  // Each FFI module is a sibling .ts file under ./ffi/.  We try to require
  // it by name; any subsystem that hasn't been ported yet simply doesn't
  // exist as a module and we return null so the caller can fall back.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(`./ffi/${subsystem}`);
    // Sanity-check that the module exported at least one symbol — empty
    // modules are treated as "not implemented".
    for (const k in mod) {
      if (typeof mod[k] === "function") return mod;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function tryLoad(subsystem: Subsystem): any | null {
  if (_cache[subsystem]) return _cache[subsystem];
  if (_errors[subsystem]) return null;

  const forced = envBackend();
  const order: Backend[] =
    forced === "ffi"  ? ["ffi"]  :
    forced === "napi" ? ["napi"] :
    IS_BUN            ? ["ffi", "napi"] :
                        ["napi"];

  for (const be of order) {
    const mod = be === "ffi" ? tryLoadFfi(subsystem) : tryLoadNapi(subsystem);
    if (mod) {
      _cache[subsystem] = mod;
      _backend[subsystem] = be;
      return mod;
    }
  }

  _errors[subsystem] = new Error(
    `mechatron: native module for "${subsystem}" is not available. ` +
    `Install @mechatronic/napi-${subsystem} or build from source` +
    (IS_BUN ? `, or use a Bun runtime with the FFI backend implemented for this subsystem` : "") +
    "."
  );
  return null;
}

/** Load the native module for a subsystem, throwing if unavailable. */
export function getNative(subsystem: Subsystem): any {
  const mod = tryLoad(subsystem);
  if (!mod) throw _errors[subsystem]!;
  return mod;
}

/** Check whether a subsystem's native module can be loaded. */
export function isAvailable(subsystem: Subsystem): boolean {
  return tryLoad(subsystem) !== null;
}

/** Identify which backend is in use for a loaded subsystem (or null). */
export function getBackend(subsystem: Subsystem): Backend | null {
  tryLoad(subsystem);
  return _backend[subsystem] || null;
}
