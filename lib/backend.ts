/**
 * Backend resolver — three-tier preference-list dispatch with variant support.
 *
 * Backends:
 *   - **napi**: Rust `.node` binaries from `@mechatronic/napi-<sub>`.
 *     Works in Node.js and Bun.  Fastest; full platform coverage.
 *
 *   - **ffi**: dlopen via `bun:ffi` (libX11/libXtst on Linux, user32 on
 *     Windows, CoreGraphics on macOS).  Bun only.  Fast; full coverage.
 *
 *   - **nolib**: Pure TypeScript — no native libraries.  Uses direct
 *     protocols, subprocess bridges, or device access.
 *
 * Variants (apply to all backends on Linux):
 *   - **x11**:    X11-based (napi: libX11/libXtst, ffi: dlopen, nolib: xproto).
 *   - **portal**: Wayland portal (napi: libei, ffi: dlopen libei,
 *                 nolib: D-Bus RemoteDesktop + ScreenCast).
 *   - **vt**:     Device-level (nolib only: uinput + framebuffer).
 *
 * On non-Linux, variants are ignored — napi/ffi use native OS APIs directly.
 *
 * Selection:
 *   `MECHATRON_BACKEND` env var accepts a comma-separated preference list.
 *   Per-subsystem overrides via `MECHATRON_BACKEND_KEYBOARD`, `_SCREEN`, etc.
 *
 *   Examples:
 *     MECHATRON_BACKEND=ffi,nolib               # all defaults per backend
 *     MECHATRON_BACKEND=ffi[x11],nolib[portal]  # explicit variant selection
 *     MECHATRON_BACKEND=napi[x11],napi[portal]  # x11 napi first, portal napi fallback
 *     MECHATRON_BACKEND_SCREEN=nolib[vt]        # framebuffer for screen only
 *
 *   Defaults (Linux, Bun):
 *     napi[x11], napi[portal], ffi[x11], ffi[portal],
 *     nolib[x11], nolib[portal], nolib[vt]
 *
 *   Defaults (Linux, Node):
 *     napi[x11], napi[portal], nolib[x11], nolib[portal], nolib[vt]
 *
 *   Defaults (non-Linux):
 *     napi, ffi (Bun) or napi (Node)
 */

export const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = (typeof SUBSYSTEMS)[number];
export type Backend = "napi" | "ffi" | "nolib";
export type Variant = "x11" | "portal" | "vt";

export interface BackendEntry {
  backend: Backend;
  variant?: Variant;
}

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";
const IS_LINUX = process.platform === "linux";

const VALID_VARIANTS: readonly Variant[] = ["x11", "portal", "vt"];

const NAPI_VARIANTS: readonly Variant[] = ["x11", "portal"];
const FFI_VARIANTS: readonly Variant[] = ["x11", "portal"];
const NOLIB_VARIANTS: readonly Variant[] = ["x11", "portal", "vt"];

function variantsFor(backend: Backend): readonly Variant[] {
  switch (backend) {
    case "napi": return NAPI_VARIANTS;
    case "ffi": return FFI_VARIANTS;
    case "nolib": return NOLIB_VARIANTS;
  }
}

function parseEntries(raw: string): BackendEntry[] {
  const parts = raw.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const entries: BackendEntry[] = [];
  for (const p of parts) {
    const m = p.match(/^(napi|ffi|nolib)(?:\[([^\]]+)\])?$/);
    if (!m) continue;
    const backend = m[1] as Backend;
    const variantStr = m[2];
    if (variantStr) {
      const allowed = variantsFor(backend);
      for (const v of variantStr.split(",").map(s => s.trim())) {
        if (allowed.includes(v as Variant)) {
          entries.push({ backend, variant: v as Variant });
        }
      }
    } else if (IS_LINUX) {
      for (const v of variantsFor(backend)) entries.push({ backend, variant: v });
    } else if (process.env.DISPLAY && backend === "nolib") {
      entries.push({ backend, variant: "x11" });
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
  if (!IS_LINUX) {
    const base: BackendEntry[] = [{ backend: "napi" }];
    if (IS_BUN) base.push({ backend: "ffi" });
    return base;
  }
  const entries: BackendEntry[] = [];
  // napi[x11], napi[portal]
  for (const v of NAPI_VARIANTS) entries.push({ backend: "napi", variant: v });
  // ffi[x11], ffi[portal]  (Bun only)
  if (IS_BUN) {
    for (const v of FFI_VARIANTS) entries.push({ backend: "ffi", variant: v });
  }
  // nolib[x11], nolib[portal], nolib[vt]
  for (const v of NOLIB_VARIANTS) entries.push({ backend: "nolib", variant: v });
  return entries;
}

// ─── Variant state ──────────────────────────────────────────────────

let _currentVariant: Variant | undefined;

/** Read by backend modules at load time to know which variant is requested. */
export function getRequestedVariant(): Variant | undefined {
  return _currentVariant;
}

// Keep the old name as an alias for nolib modules that already import it.
export { getRequestedVariant as getNolibVariant };

// ─── Backend loaders ────────────────────────────────────────────────

const _variantCache: Partial<Record<string, { mod: any; usesVariant: boolean } | null>> = {};

function cacheKey(backend: Backend, subsystem: Subsystem, variant?: Variant): string {
  return variant ? `${backend}:${subsystem}:${variant}` : `${backend}:${subsystem}`;
}

function tryLoadVariant(
  backend: Backend, subsystem: Subsystem, variant?: Variant,
): { mod: any; usesVariant: boolean } | null {
  const key = cacheKey(backend, subsystem, variant);
  if (key in _variantCache) return _variantCache[key] ?? null;

  if (backend === "ffi" && !IS_BUN) {
    _variantCache[key] = null;
    return null;
  }

  // Determine the module path.  On Linux with a variant, backends that
  // support variants load from a variant-suffixed path:
  //   napi/<subsystem>-<variant>   (e.g. napi/screen-portal)
  //   ffi/<subsystem>-<variant>    (e.g. ffi/keyboard-portal)
  //   nolib/<subsystem>            (nolib modules dispatch internally)
  //
  // Non-Linux or no-variant: load from the base path (napi/<sub>, ffi/<sub>).
  // For nolib, variants are always dispatched internally via getRequestedVariant().

  let modPath: string;
  let isVariantSpecific = false;

  if (backend === "nolib") {
    // nolib modules dispatch internally via getRequestedVariant().
    modPath = `./nolib/${subsystem}`;
  } else if (variant) {
    modPath = `./${backend}/${subsystem}-${variant}`;
    try {
      require.resolve(modPath);
      isVariantSpecific = true;
    } catch {
      // No variant-specific file — fall back to the base module.
      modPath = `./${backend}/${subsystem}`;
    }
  } else {
    modPath = `./${backend}/${subsystem}`;
  }

  // If the resolved module is already in Node's require cache from a
  // different variant load, don't reuse it — its internal state was
  // baked at first load for that variant.  Variant-specific files
  // (e.g. ffi/keyboard-portal.ts) are exempt since they're unique per variant.
  if (variant && !isVariantSpecific) {
    const resolved = require.resolve(modPath);
    if (require.cache[resolved]) {
      _variantCache[key] = null;
      return null;
    }
  }

  const prev = _currentVariant;
  _currentVariant = variant;
  try {
    const mod = require(modPath);
    const usesVariant = isVariantSpecific || backend === "nolib";
    const result = { mod, usesVariant };
    _variantCache[key] = result;
    return result;
  } catch {
    _variantCache[key] = null;
    return null;
  } finally {
    _currentVariant = prev;
  }
}

// ─── Resolution ─────────────────────────────────────────────────────

const _cache: Partial<Record<Subsystem, any>> = {};
const _backend: Partial<Record<Subsystem, string>> = {};

function tryLoad(subsystem: Subsystem): any | null {
  if (_cache[subsystem]) return _cache[subsystem];

  const order = parseBackendPref(subsystem) || defaultOrder();

  for (const entry of order) {
    const result = tryLoadVariant(entry.backend, subsystem, entry.variant);
    if (result) {
      _cache[subsystem] = result.mod;
      _backend[subsystem] = (entry.variant && result.usesVariant)
        ? `${entry.backend}[${entry.variant}]`
        : entry.backend;
      return result.mod;
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
    `Install @mechatronic/napi-${subsystem}, use Bun for FFI, ` +
    `or ensure prerequisites for nolib ($DISPLAY for x11, portal for wayland, /dev/uinput for vt).`
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
  for (const v of VALID_VARIANTS) {
    for (const b of ["napi", "ffi", "nolib"] as const) {
      delete _variantCache[cacheKey(b, subsystem, v)];
    }
    delete _variantCache[cacheKey("napi", subsystem)];
    delete _variantCache[cacheKey("ffi", subsystem)];
    delete _variantCache[cacheKey("nolib", subsystem)];
  }
}
