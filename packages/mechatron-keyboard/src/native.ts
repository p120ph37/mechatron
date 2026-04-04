function getNodeFile(): string {
  const p = process.platform;
  const a = process.arch;
  const map: Record<string, string> = {
    "linux-x64": "mechatron-keyboard.linux-x64-gnu.node",
    "linux-arm64": "mechatron-keyboard.linux-arm64-gnu.node",
    "darwin-x64": "mechatron-keyboard.darwin-x64.node",
    "darwin-arm64": "mechatron-keyboard.darwin-arm64.node",
    "win32-x64": "mechatron-keyboard.win32-x64-msvc.node",
    "win32-ia32": "mechatron-keyboard.win32-ia32-msvc.node",
  };
  return map[`${p}-${a}`] || `mechatron-keyboard.${p}-${a}.node`;
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
  _native = require(path.resolve(__dirname, "..", "..", "..", "native-rs", "keyboard", getNodeFile()));
  return _native;
}
