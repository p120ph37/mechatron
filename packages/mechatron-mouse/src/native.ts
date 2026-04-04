function getNodeFile(): string {
  const p = process.platform;
  const a = process.arch;
  const map: Record<string, string> = {
    "linux-x64": "mechatron-mouse.linux-x64-gnu.node",
    "linux-arm64": "mechatron-mouse.linux-arm64-gnu.node",
    "darwin-x64": "mechatron-mouse.darwin-x64.node",
    "darwin-arm64": "mechatron-mouse.darwin-arm64.node",
    "win32-x64": "mechatron-mouse.win32-x64-msvc.node",
    "win32-ia32": "mechatron-mouse.win32-ia32-msvc.node",
  };
  return map[`${p}-${a}`] || `mechatron-mouse.${p}-${a}.node`;
}

let _native: any = null;

export function getNative(): any {
  if (_native) return _native;
  const path = require("path");
  // Published layout: .node alongside package.json
  try {
    _native = require(path.resolve(__dirname, "..", getNodeFile()));
    return _native;
  } catch (_) {}
  // Development layout: workspace root native-rs/<crate>/target/release/
  // Fallback: look for built .node in native-rs/<subsystem>/
  _native = require(path.resolve(__dirname, "..", "..", "..", "native-rs", "mouse", getNodeFile()));
  return _native;
}
