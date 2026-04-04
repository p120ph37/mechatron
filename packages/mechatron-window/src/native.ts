function getNodeFile(): string {
  const p = process.platform;
  const a = process.arch;
  const map: Record<string, string> = {
    "linux-x64": "mechatron-window.linux-x64-gnu.node",
    "linux-arm64": "mechatron-window.linux-arm64-gnu.node",
    "darwin-x64": "mechatron-window.darwin-x64.node",
    "darwin-arm64": "mechatron-window.darwin-arm64.node",
    "win32-x64": "mechatron-window.win32-x64-msvc.node",
    "win32-ia32": "mechatron-window.win32-ia32-msvc.node",
  };
  return map[`${p}-${a}`] || `mechatron-window.${p}-${a}.node`;
}

let _native: any = null;

export function getNative(): any {
  if (_native) return _native;
  const path = require("path");
  try {
    _native = require(path.resolve(__dirname, "..", getNodeFile()));
    return _native;
  } catch (_) {}
  _native = require(path.resolve(__dirname, "..", "..", "..", "native-rs", "window", getNodeFile()));
  return _native;
}
