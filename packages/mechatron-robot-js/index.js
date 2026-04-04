"use strict";

// mechatron-robot-js — drop-in replacement for robot-js 2.2.0 backed by the
// modern, modular `mechatron` packages.
//
// Modern mechatron exposes plain ES classes via named exports and drops the
// robot-js cruft (callableClass proxy, flattened KEY_* globals, Module.Segment
// nesting, Memory.Stats/Region nesting, top-level sleep/clock,
// get/setNativeBackend stubs).  This shim reassembles that historical shape
// on top of modern mechatron so legacy robot-js consumers can migrate with a
// single `require` swap.

var mech = require("mechatron");

// ---------------------------------------------------------------------------
// callableClass — Proxy wrapper that lets `new Cls()` and `Cls()` both work.
// robot-js inherited this from its C++ NAPI binding (OnCalledAsFunction).
// ---------------------------------------------------------------------------
function callableClass(Cls) {
  return new Proxy(Cls, {
    apply: function (_target, _thisArg, args) {
      return new Cls(...args);
    },
  });
}

// ---------------------------------------------------------------------------
// Version constants (from robot-js 2.2.0)
// ---------------------------------------------------------------------------
var ROBOT_VERSION = 0x020200;
var ROBOT_VERSION_STR = "2.2.0 (" + mech.VERSION + ")";
var ADDON_VERSION = 0x000000;
var ADDON_VERSION_STR = mech.VERSION;

// ---------------------------------------------------------------------------
// Wrap every class so it can be called without `new`
// ---------------------------------------------------------------------------
var Range    = callableClass(mech.Range);
var Point    = callableClass(mech.Point);
var Size     = callableClass(mech.Size);
var Bounds   = callableClass(mech.Bounds);
var Color    = callableClass(mech.Color);
var Hash     = callableClass(mech.Hash);
var Image    = callableClass(mech.Image);
var Timer    = callableClass(mech.Timer);
var Keyboard = callableClass(mech.Keyboard);
var Mouse    = callableClass(mech.Mouse);
var Screen   = callableClass(mech.Screen);
var Window   = callableClass(mech.Window);
var Process  = callableClass(mech.Process);
var Module   = callableClass(mech.Module);
var Memory   = callableClass(mech.Memory);

// Sub-classes used as static namespaces on their parent classes (robot-js
// attaches these nested references post-hoc; modern mechatron exports them
// as top-level symbols instead).
var Segment = callableClass(mech.Segment);
var Stats   = callableClass(mech.Stats);
var Region  = callableClass(mech.Region);

// Attach nested references.  The outer wrapper is a Proxy around the raw
// class, so assigning a property to it sets it on the underlying target.
Module.Segment = Segment;
Memory.Stats   = Stats;
Memory.Region  = Region;

// ---------------------------------------------------------------------------
// Top-level time helpers (robot-js had mRobot.sleep / mRobot.clock)
// ---------------------------------------------------------------------------
function sleep(a, b) {
  return mech.Timer.sleep(a, b);
}

function clock() {
  return mech.Timer.getCpuTime();
}

// ---------------------------------------------------------------------------
// Legacy backend management.  In modern mechatron every subsystem manages
// its own native loader, so these are inert stubs kept for ABI compatibility.
// ---------------------------------------------------------------------------
function getNativeBackend() {
  return {};
}

function setNativeBackend(_backend) {
  // no-op
}

// ---------------------------------------------------------------------------
// Assemble the robot-js-shaped export object
// ---------------------------------------------------------------------------
var robot = {
  // Version info
  ROBOT_VERSION: ROBOT_VERSION,
  ROBOT_VERSION_STR: ROBOT_VERSION_STR,
  ADDON_VERSION: ADDON_VERSION,
  ADDON_VERSION_STR: ADDON_VERSION_STR,

  // Top-level functions
  sleep: sleep,
  clock: clock,

  // Data type classes
  Range: Range,
  Point: Point,
  Size: Size,
  Bounds: Bounds,
  Color: Color,
  Hash: Hash,
  Image: Image,
  Timer: Timer,

  // Subsystem classes
  Keyboard: Keyboard,
  Mouse: Mouse,
  Clipboard: mech.Clipboard,      // Clipboard is a plain object, not a class
  Screen: Screen,
  Window: Window,
  Process: Process,
  Module: Module,
  Memory: Memory,

  // Mouse button constants
  BUTTON_LEFT:   mech.BUTTON_LEFT,
  BUTTON_MID:    mech.BUTTON_MID,
  BUTTON_MIDDLE: mech.BUTTON_MIDDLE,
  BUTTON_RIGHT:  mech.BUTTON_RIGHT,
  BUTTON_X1:     mech.BUTTON_X1,
  BUTTON_X2:     mech.BUTTON_X2,

  // Memory flag aliases (also available as statics on Memory)
  MEMORY_DEFAULT:     mech.MEMORY_DEFAULT,
  MEMORY_SKIP_ERRORS: mech.MEMORY_SKIP_ERRORS,
  MEMORY_AUTO_ACCESS: mech.MEMORY_AUTO_ACCESS,

  // Legacy backend management
  getNativeBackend: getNativeBackend,
  setNativeBackend: setNativeBackend,
};

// Flatten platform-specific key constants (KEY_A, KEY_SHIFT, ...) onto the
// top-level shim object.  This matches the original robot-js layout where
// every KEY_* name was a direct property of the required module.
var keys = mech.KEYS;
for (var name in keys) {
  if (Object.prototype.hasOwnProperty.call(keys, name)) {
    robot[name] = keys[name];
  }
}

module.exports = robot;
