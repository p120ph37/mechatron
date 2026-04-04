"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNativeBackend = getNativeBackend;
exports.setNativeBackend = setNativeBackend;
let _backend = null;
function getRustNodeFile() {
    const p = process.platform;
    const a = process.arch;
    const map = {
        "linux-x64": "mechatron-native.linux-x64-gnu.node",
        "linux-arm64": "mechatron-native.linux-arm64-gnu.node",
        "darwin-x64": "mechatron-native.darwin-x64.node",
        "darwin-arm64": "mechatron-native.darwin-arm64.node",
        "win32-x64": "mechatron-native.win32-x64-msvc.node",
        "win32-ia32": "mechatron-native.win32-ia32-msvc.node",
    };
    return map[`${p}-${a}`] || `mechatron-native.${p}-${a}.node`;
}
function getNativeBackend() {
    if (_backend)
        return _backend;
    const path = require("path");
    const rustAddon = require(path.resolve(__dirname, "..", "native-rs", getRustNodeFile()));
    _backend = rustAddon;
    return _backend;
}
function setNativeBackend(backend) {
    _backend = backend;
}
