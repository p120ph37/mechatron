"use strict";
// mechatron - TypeScript API layer
// Pure data types (zero native dependency)
const Range_1 = require("./Range");
const Point_1 = require("./Point");
const Size_1 = require("./Size");
const Bounds_1 = require("./Bounds");
const Color_1 = require("./Color");
const Hash_1 = require("./Hash");
const Image_1 = require("./Image");
const Timer_1 = require("./Timer");
// Native-backed types
const Keyboard_1 = require("./Keyboard");
const Mouse_1 = require("./Mouse");
const Clipboard_1 = require("./Clipboard");
const Screen_1 = require("./Screen");
const Window_1 = require("./Window");
const Process_1 = require("./Process");
const Module_1 = require("./Module");
const Memory_1 = require("./Memory");
// Native backend management
const native_1 = require("./native");
const constants_1 = require("./constants");
// Version constants
const ROBOT_VERSION = 0x020200;
const ROBOT_VERSION_STR = "2.2.0 (0.0.0)";
const ADDON_VERSION = 0x000000;
const ADDON_VERSION_STR = "0.0.0";
// Wrap ES6 classes so they can be called without `new` (matching C++ NAPI OnCalledAsFunction behavior)
function callableClass(Cls) {
    return new Proxy(Cls, {
        apply(_target, _thisArg, args) {
            return new Cls(...args);
        },
    });
}
// Top-level sleep/clock functions matching original API
function sleep(a, b) {
    Timer_1.Timer.sleep(a, b);
}
function clock() {
    return Timer_1.Timer.getCpuTime();
}
// Wrap sub-classes for callable-without-new
const CallableSegment = callableClass(Module_1.Segment);
const CallableStats = callableClass(Memory_1.Stats);
const CallableRegion = callableClass(Memory_1.Region);
// Attach Segment to Module (matches original: mRobot.Module.Segment = Segment)
Module_1.Module.Segment = CallableSegment;
// Attach Stats and Region to Memory
Memory_1.Memory.Stats = CallableStats;
Memory_1.Memory.Region = CallableRegion;
// Hook Process.prototype.getModules to set _proc on returned modules
const _origGetModules = Process_1.Process.prototype.getModules;
Process_1.Process.prototype.getModules = function (regex) {
    const rawModules = _origGetModules.call(this, regex);
    return rawModules.map((m) => {
        const mod = new Module_1.Module(m);
        mod._segments = null;
        mod._proc = this;
        return mod;
    });
};
// Platform-specific key/button constants (now from TS constants module)
const _nativeConstants = (0, constants_1.getAllConstants)();
const mRobot = {
    // Version info
    ROBOT_VERSION,
    ROBOT_VERSION_STR,
    ADDON_VERSION,
    ADDON_VERSION_STR,
    // Top-level functions
    sleep,
    clock,
    // Classes (wrapped for constructor-without-new compatibility)
    Bounds: callableClass(Bounds_1.Bounds),
    Clipboard: Clipboard_1.Clipboard,
    Color: callableClass(Color_1.Color),
    Hash: callableClass(Hash_1.Hash),
    Image: callableClass(Image_1.Image),
    Keyboard: callableClass(Keyboard_1.Keyboard),
    Memory: callableClass(Memory_1.Memory),
    Module: callableClass(Module_1.Module),
    Mouse: callableClass(Mouse_1.Mouse),
    Point: callableClass(Point_1.Point),
    Process: callableClass(Process_1.Process),
    Range: callableClass(Range_1.Range),
    Screen: callableClass(Screen_1.Screen),
    Size: callableClass(Size_1.Size),
    Timer: callableClass(Timer_1.Timer),
    Window: callableClass(Window_1.Window),
    // Key and button constants from native addon (platform-specific)
    ..._nativeConstants,
    // Backend management
    getNativeBackend: native_1.getNativeBackend,
    setNativeBackend: native_1.setNativeBackend,
};
module.exports = mRobot;
