/**
 * Backend resolver — three-tier preference-list dispatch.
 *
 * Backends:
 *   - **napi**: Rust `.node` binaries from `@mechatronic/napi-<sub>`.
 *     Works in Node.js and Bun.  Fastest; full platform coverage.
 *
 *   - **ffi**: dlopen via `bun:ffi` (libX11/libXtst on Linux, user32 on
 *     Windows, CoreGraphics on macOS).  Bun only.  Fast; full coverage.
 *
 *   - **nolib**: Pure TypeScript — no native libraries.  Two variants:
 *       - **x11**: X11 wire protocol (xproto) over sockets.  Requires $DISPLAY.
 *       - **vt**: Device-level access (uinput + framebuffer).  Requires
 *         /dev/uinput and/or /dev/fb0.  Works headless.
 *     Bare `nolib` expands to `nolib[x11], nolib[vt]`.
 *
 * Selection:
 *   `MECHATRON_BACKEND` env var accepts a comma-separated preference list.
 *   Per-subsystem overrides via `MECHATRON_BACKEND_KEYBOARD`, `_SCREEN`, etc.
 *
 *   Examples:
 *     MECHATRON_BACKEND=ffi,nolib              # ffi first, then all nolib
 *     MECHATRON_BACKEND=ffi,nolib[x11]         # ffi first, then xproto only
 *     MECHATRON_BACKEND=nolib[x11],nolib[vt]   # explicit nolib fallback order
 *     MECHATRON_BACKEND_SCREEN=nolib[vt]       # screen uses framebuffer only
 *
 *   Defaults:
 *     Bun:  napi, ffi, nolib
 *     Node: napi, nolib
 */

export const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = (typeof SUBSYSTEMS)[number];
export type Backend = "napi" | "ffi" | "nolib";
export type NolibVariant = "x11" | "vt";

export interface BackendEntry {
  backend: Backend;
  variant?: NolibVariant;
}

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";

const NOLIB_VARIANTS: NolibVariant[] = ["x11", "vt"];

function parseEntries(raw: string): BackendEntry[] {
  const parts = raw.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const entries: BackendEntry[] = [];
  for (const p of parts) {
    const m = p.match(/^(napi|ffi|nolib)(?:\[([^\]]+)\])?$/);
    if (!m) continue;
    const backend = m[1] as Backend;
    const variantStr = m[2];
    if (backend === "nolib" && variantStr) {
      for (const v of variantStr.split(",").map(s => s.trim())) {
        if (v === "x11" || v === "vt") {
          entries.push({ backend, variant: v });
        }
      }
    } else if (backend === "nolib") {
      for (const v of NOLIB_VARIANTS) entries.push({ backend, variant: v });
    } else {
      entries.push({ backend });
    }
  }
  return entries;
}

function parseBackendPref(subsystem: Subsystem): BackendEntry[] | null {
  const subKey = `MECHATRON_BACKEND_${subsystem.toUpperCase()}`;
  const subVal = (process.env[subKey] || "").trim();
  if (subVal) {
    const entries = parseEntries(subVal);
    if (entries.length > 0) return entries;
  }
  const globalVal = (process.env.MECHATRON_BACKEND || "").trim();
  if (globalVal) {
    const entries = parseEntries(globalVal);
    if (entries.length > 0) return entries;
  }
  return null;
}

function defaultOrder(): BackendEntry[] {
  const base: BackendEntry[] = [{ backend: "napi" }];
  if (IS_BUN) base.push({ backend: "ffi" });
  for (const v of NOLIB_VARIANTS) base.push({ backend: "nolib", variant: v });
  return base;
}

function tryLoadNapi(subsystem: Subsystem): any | null {
  try {
    return require(`./napi/${subsystem}`);
  } catch {
    return null;
  }
}

function tryLoadFfi(subsystem: Subsystem): any | null {
  if (!IS_BUN) return null;
  try {
    return require(`./ffi/${subsystem}`);
  } catch {
    return null;
  }
}

let _nolibVariant: NolibVariant | undefined;

/** Read by nolib modules at load time to know which variant is requested. */
export function getNolibVariant(): NolibVariant | undefined {
  return _nolibVariant;
}

const _nolibCache: Partial<Record<string, any>> = {};

function tryLoadNolib(subsystem: Subsystem, variant: NolibVariant): any | null {
  const cacheKey = `${subsystem}:${variant}`;
  if (cacheKey in _nolibCache) return _nolibCache[cacheKey];

  // If the module already loaded successfully for a different variant, Node's
  // require cache returns the same object — but its USE_X11/USE_VT flags were
  // baked at first load.  Don't reuse a module loaded under a different variant.
  const modPath = require.resolve(`./nolib/${subsystem}`);
  if (require.cache[modPath]) {
    _nolibCache[cacheKey] = null;
    return null;
  }

  const prev = _nolibVariant;
  _nolibVariant = variant;
  try {
    const mod = require(`./nolib/${subsystem}`);
    _nolibCache[cacheKey] = mod;
    return mod;
  } catch {
    _nolibCache[cacheKey] = null;
    return null;
  } finally {
    _nolibVariant = prev;
  }
}

const _cache: Partial<Record<Subsystem, any>> = {};
const _backend: Partial<Record<Subsystem, string>> = {};

function tryLoad(subsystem: Subsystem): any | null {
  if (_cache[subsystem]) return _cache[subsystem];

  const order = parseBackendPref(subsystem) || defaultOrder();

  for (const entry of order) {
    let mod: any | null = null;
    if (entry.backend === "napi") mod = tryLoadNapi(subsystem);
    else if (entry.backend === "ffi") mod = tryLoadFfi(subsystem);
    else if (entry.backend === "nolib") mod = tryLoadNolib(subsystem, entry.variant!);
    if (mod) {
      _cache[subsystem] = mod;
      _backend[subsystem] = entry.variant
        ? `${entry.backend}[${entry.variant}]`
        : entry.backend;
      return mod;
    }
  }

  return null;
}

/** Load the backend module for a subsystem, throwing if unavailable. */
export function getNative(subsystem: Subsystem): any {
  const mod = tryLoad(subsystem);
  if (mod) return mod;
  const order = parseBackendPref(subsystem) || defaultOrder();
  const tried = order.map(e => e.variant ? `${e.backend}[${e.variant}]` : e.backend);
  throw new Error(
    `mechatron: no backend available for "${subsystem}". ` +
    `Tried: ${tried.join(", ")}. ` +
    `Install @mechatronic/napi-${subsystem}, or use a Bun runtime for FFI, ` +
    `or ensure protocol prerequisites are met for nolib (e.g. $DISPLAY for x11, /dev/uinput for vt).`
  );
}

/** Check whether a subsystem has any available backend. */
export function isAvailable(subsystem: Subsystem): boolean {
  return tryLoad(subsystem) !== null;
}

/** Identify which backend is active for a loaded subsystem (e.g. "nolib[x11]"). */
export function getBackend(subsystem: Subsystem): string | null {
  tryLoad(subsystem);
  return _backend[subsystem] || null;
}

/** Force-clear cached backend for a subsystem (for testing). */
export function _resetBackend(subsystem: Subsystem): void {
  delete _cache[subsystem];
  delete _backend[subsystem];
  // Also clear nolib variant caches for this subsystem
  for (const v of NOLIB_VARIANTS) {
    delete _nolibCache[`${subsystem}:${v}`];
  }
}
