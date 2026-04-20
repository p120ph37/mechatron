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
 *   - **nolib**: Pure TypeScript — no native libraries.  Uses direct
 *     protocols: X11 wire protocol (xproto) over sockets, /proc filesystem,
 *     subprocess bridges.  Works in any runtime.  Partial coverage (some
 *     subsystems/platforms can't be implemented without native calls).
 *
 * Selection: `MECHATRON_BACKEND` env var accepts a comma-separated preference
 * list (e.g. `ffi,nolib,napi`).  The resolver tries each in order per
 * subsystem, picking the first that loads successfully.  Defaults:
 *   - Bun:  napi, ffi, nolib
 *   - Node: napi, nolib
 */

export const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = (typeof SUBSYSTEMS)[number];
export type Backend = "napi" | "ffi" | "nolib";

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";

function parseBackendPref(): Backend[] | null {
  const v = (process.env.MECHATRON_BACKEND || "").toLowerCase().trim();
  if (!v) return null;
  const parts = v.split(",").map(s => s.trim()).filter(Boolean);
  const valid: Backend[] = [];
  for (const p of parts) {
    if (p === "napi" || p === "ffi" || p === "nolib") valid.push(p);
  }
  return valid.length > 0 ? valid : null;
}

function defaultOrder(): Backend[] {
  return IS_BUN ? ["napi", "ffi", "nolib"] : ["napi", "nolib"];
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

function tryLoadNolib(subsystem: Subsystem): any | null {
  try {
    return require(`./nolib/${subsystem}`);
  } catch {
    return null;
  }
}

const _cache: Partial<Record<Subsystem, any>> = {};
const _backend: Partial<Record<Subsystem, Backend>> = {};

function tryLoad(subsystem: Subsystem): any | null {
  if (_cache[subsystem]) return _cache[subsystem];

  const order = parseBackendPref() || defaultOrder();

  for (const be of order) {
    let mod: any | null = null;
    if (be === "napi") mod = tryLoadNapi(subsystem);
    else if (be === "ffi") mod = tryLoadFfi(subsystem);
    else if (be === "nolib") mod = tryLoadNolib(subsystem);
    if (mod) {
      _cache[subsystem] = mod;
      _backend[subsystem] = be;
      return mod;
    }
  }

  return null;
}

/** Load the backend module for a subsystem, throwing if unavailable. */
export function getNative(subsystem: Subsystem): any {
  const mod = tryLoad(subsystem);
  if (mod) return mod;
  const order = parseBackendPref() || defaultOrder();
  throw new Error(
    `mechatron: no backend available for "${subsystem}". ` +
    `Tried: ${order.join(", ")}. ` +
    `Install @mechatronic/napi-${subsystem}, or use a Bun runtime for FFI, ` +
    `or ensure protocol prerequisites are met for nolib (e.g. $DISPLAY for X11).`
  );
}

/** Check whether a subsystem has any available backend. */
export function isAvailable(subsystem: Subsystem): boolean {
  return tryLoad(subsystem) !== null;
}

/** Identify which backend is active for a loaded subsystem. */
export function getBackend(subsystem: Subsystem): Backend | null {
  tryLoad(subsystem);
  return _backend[subsystem] || null;
}

/** Force-clear cached backend for a subsystem (for testing). */
export function _resetBackend(subsystem: Subsystem): void {
  delete _cache[subsystem];
  delete _backend[subsystem];
}
