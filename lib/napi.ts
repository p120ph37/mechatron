/**
 * Unified native module loader.
 *
 * Each subsystem's NAPI binary lives in its own optional package
 * (`@mechatronic/napi-keyboard`, etc.).  This module resolves and loads them
 * on demand, with graceful fallback when a native package is absent.
 */

const SUBSYSTEMS = [
  "keyboard", "mouse", "clipboard", "screen", "window", "process", "memory",
] as const;

export type Subsystem = typeof SUBSYSTEMS[number];

function getNodeFile(subsystem: string): string {
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
const _errors: Partial<Record<Subsystem, Error>> = {};

function tryLoad(subsystem: Subsystem): any {
  if (_cache[subsystem]) return _cache[subsystem];
  if (_errors[subsystem]) return null;

  const path = require("path");
  const nodeFile = getNodeFile(subsystem);

  // Resolve from @mechatronic/napi-<sub> package (installed via optionalDependencies,
  // or linked via npm workspaces during development)
  try {
    const pkgDir = path.dirname(
      require.resolve(`@mechatronic/napi-${subsystem}/package.json`)
    );
    _cache[subsystem] = require(path.join(pkgDir, nodeFile));
    return _cache[subsystem];
  } catch (_) {}

  _errors[subsystem] = new Error(
    `mechatron: native module for "${subsystem}" is not available. ` +
    `Install @mechatronic/napi-${subsystem} or build from source.`
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
