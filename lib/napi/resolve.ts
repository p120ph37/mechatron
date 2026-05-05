/**
 * Shared napi .node binary resolution logic.
 *
 * Each @mechatronic/napi-<subsystem> npm package ships a platform-specific
 * .node binary.  This module resolves the correct filename and loads it.
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

export function loadNapi(subsystem: string): any {
  const path = require("path");
  const pkg = `@mechatronic/napi-${subsystem}`;
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  const nodeFile = `mechatron-${subsystem}.${platformSuffix}.node`;
  return require(path.join(pkgDir, nodeFile));
}
