/**
 * Unified native module loader.
 *
 * Two backends are supported:
 *
 *   - **NAPI**: per-subsystem `.node` binary loaded from
 *     `@mechatronic/napi-<sub>`.  Standard for Node.js.  Also works in Bun.
 *
 *   - **FFI** (Bun only): per-subsystem shared library (`.so`/`.dll`/`.dylib`)
 *     loaded from `@mechatronic/ffi-<sub>` via `bun:ffi`.  Avoids the napi-rs
 *     dependency, allowing Bun installations to skip the heavier napi binaries.
 *
 * Backend selection: when running in Bun and the matching `@mechatronic/ffi-*`
 * package is installed, FFI is preferred.  Otherwise NAPI is used.  The
 * choice can be forced via the `MECHATRON_BACKEND` environment variable
 * (`napi` or `ffi`).
 *
 * Regardless of backend, callers see a uniform object whose method names
 * match the napi `js_name` exports (e.g. `keyboard_getKeyState`).  The FFI
 * layer exports the same names as `#[no_mangle]` C symbols.
 */

const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = typeof SUBSYSTEMS[number];
export type Backend = "napi" | "ffi";

declare const Bun: any;
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

function ffiLibFile(subsystem: string): string {
  const p = process.platform;
  const a = process.arch;
  const map: Record<string, string> = {
    "linux-x64":    `mechatron-ffi-${subsystem}.linux-x64-gnu.so`,
    "linux-arm64":  `mechatron-ffi-${subsystem}.linux-arm64-gnu.so`,
    "darwin-x64":   `mechatron-ffi-${subsystem}.darwin-x64.dylib`,
    "darwin-arm64": `mechatron-ffi-${subsystem}.darwin-arm64.dylib`,
    "win32-x64":    `mechatron-ffi-${subsystem}.win32-x64-msvc.dll`,
    "win32-ia32":   `mechatron-ffi-${subsystem}.win32-ia32-msvc.dll`,
  };
  return map[`${p}-${a}`] || `mechatron-ffi-${subsystem}.${p}-${a}`;
}

// FFI symbol tables.  `ptr` slots receive a pointer (e.g. typed-array address).
// Keep names matching the napi `js_name`s so backends are interchangeable.
type FFIArg = "i32" | "u32" | "u64" | "i64" | "bool" | "ptr" | "void";
interface FFISym { args: FFIArg[]; returns: FFIArg }

const FFI_SYMBOLS: Record<Subsystem, Record<string, FFISym>> = {
  keyboard: {
    keyboard_press:        { args: ["i32"], returns: "void" },
    keyboard_release:      { args: ["i32"], returns: "void" },
    keyboard_getKeyState:  { args: ["i32"], returns: "bool" },
  },
  mouse: {
    mouse_press:           { args: ["i32"], returns: "void" },
    mouse_release:         { args: ["i32"], returns: "void" },
    mouse_scrollH:         { args: ["i32"], returns: "void" },
    mouse_scrollV:         { args: ["i32"], returns: "void" },
    // `out` is a pointer to an i32[2]: [x, y].
    mouse_getPos:          { args: ["ptr"], returns: "void" },
    mouse_setPos:          { args: ["i32", "i32"], returns: "void" },
    mouse_getButtonState:  { args: ["i32"], returns: "bool" },
  },
  clipboard: {
    clipboard_clear:        { args: [], returns: "void" },
    clipboard_hasText:      { args: [], returns: "bool" },
    clipboard_hasImage:     { args: [], returns: "bool" },
    clipboard_getSequence:  { args: [], returns: "u32" },
  },
  screen: {
    screen_synchronize:    { args: [], returns: "void" },
    screen_isCompositing:  { args: [], returns: "bool" },
  },
  window: {
    window_isValid:        { args: ["u64"], returns: "bool" },
  },
  process: {
    process_getCurrent:    { args: [], returns: "u32" },
  },
  memory: {
    memory_getPageSize:    { args: [], returns: "u32" },
  },
};

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
  try {
    const path = require("path");
    const pkgDir = path.dirname(
      require.resolve(`@mechatronic/ffi-${subsystem}/package.json`)
    );
    const libPath = path.join(pkgDir, ffiLibFile(subsystem));
    // Lazy-import bun:ffi to avoid Node.js parsing this branch.
    const ffi = (0, eval)('require("bun:ffi")');
    const FFIType = ffi.FFIType;
    const symMap = FFI_SYMBOLS[subsystem];
    const symbolsArg: any = {};
    for (const name of Object.keys(symMap)) {
      const sig = symMap[name];
      symbolsArg[name] = {
        args: sig.args.map((a) => ffiTypeFor(FFIType, a)),
        returns: ffiTypeFor(FFIType, sig.returns),
      };
    }
    const lib = ffi.dlopen(libPath, symbolsArg);
    return wrapFfi(subsystem, lib.symbols);
  } catch (_) {
    return null;
  }
}

function ffiTypeFor(FFIType: any, kind: FFIArg): any {
  switch (kind) {
    case "i32":  return FFIType.i32;
    case "u32":  return FFIType.u32;
    case "i64":  return FFIType.i64;
    case "u64":  return FFIType.u64;
    case "bool": return FFIType.bool;
    case "ptr":  return FFIType.ptr;
    case "void": return FFIType.void;
  }
}

/**
 * Wrap raw FFI symbols to match the napi-style call shape.
 *
 * Most exports are direct passthrough.  A few (`mouse_getPos`) accept caller
 * buffers and need to be reshaped into napi's "return an object" idiom.
 */
function wrapFfi(subsystem: Subsystem, symbols: any): any {
  const out: any = { ...symbols };
  if (subsystem === "mouse") {
    const getPos = symbols.mouse_getPos;
    out.mouse_getPos = function () {
      const buf = new Int32Array(2);
      // bun:ffi accepts TypedArray for `ptr` args.
      getPos(buf);
      return { x: buf[0], y: buf[1] };
    };
  }
  return out;
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
    `Install @mechatronic/napi-${subsystem}` +
    (IS_BUN ? ` or @mechatronic/ffi-${subsystem}` : "") +
    ` or build from source.`
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
