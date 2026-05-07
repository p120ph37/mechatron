/**
 * Shared napi .node binary resolution logic.
 *
 * Each @mechatronic/napi-<subsystem> npm package ships one or more
 * platform-specific .node binaries.  Subsystems with backend variants on
 * Linux (keyboard / mouse / clipboard / screen) ship multiple binaries
 * inside the same package — one per variant, each linking only its own
 * runtime dependencies.  The variant TS facade calls
 * `loadNapi(subsystem, variant)` to pick the matching binary file.
 *
 * Selecting the right binary by name doesn't change the npm publish
 * surface: each subsystem has exactly one npm package; users who want
 * to exclude a whole subsystem (e.g. memory, to avoid AV warnings)
 * still uninstall a single package.
 */

const p = process.platform;
const a = process.arch;

const PLATFORM_MAP: Record<string, string> = {
  "linux-x64":    "linux-x64-gnu",
  "linux-arm64":  "linux-arm64-gnu",
  "darwin-x64":   "darwin-x64",
  "darwin-arm64": "darwin-arm64",
  "win32-x64":    "win32-x64-msvc",
  "win32-ia32":   "win32-ia32-msvc",
};

const platformSuffix = PLATFORM_MAP[`${p}-${a}`] || `${p}-${a}`;

export function loadNapi(subsystem: string, variant?: string): any {
  const path = require("path");
  const pkg = `@mechatronic/napi-${subsystem}`;
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  const baseName = variant ? `${subsystem}-${variant}` : subsystem;
  const nodeFile = `mechatron-${baseName}.${platformSuffix}.node`;
  return require(path.join(pkgDir, nodeFile));
}
