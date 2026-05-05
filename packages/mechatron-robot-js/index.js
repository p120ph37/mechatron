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

// Attach nested references.  The outer wrapper is a Proxy around the raw
// class, so assigning a property to it sets it on the underlying target.
Module.Segment = Segment;
Memory.Stats   = Stats;

// BigInt→Number coercion for robot-js API contract.  Modern mechatron uses
// bigint for pointer-sized fields (Region.start/stop/size, addresses returned
// by getMinAddress/getMaxAddress/find).  robot-js 2.x exposed these as plain
// numbers, so consumers may rely on strict equality (=== 0) or typeof checks.
// Truncation is acceptable: robot-js never supported >53-bit addresses.
function regionToNumber(region) {
  if (region && typeof region.start === "bigint") {
    region.start = Number(region.start);
    region.stop  = Number(region.stop);
    region.size  = Number(region.size);
  }
  return region;
}

var _getRegion = mech.Memory.prototype.getRegion;
mech.Memory.prototype.getRegion = async function () {
  return regionToNumber(await _getRegion.apply(this, arguments));
};

var _getRegions = mech.Memory.prototype.getRegions;
mech.Memory.prototype.getRegions = async function () {
  var regions = await _getRegions.apply(this, arguments);
  for (var i = 0; i < regions.length; i++) regionToNumber(regions[i]);
  return regions;
};

var _getMinAddress = mech.Memory.prototype.getMinAddress;
mech.Memory.prototype.getMinAddress = async function () {
  return Number(await _getMinAddress.apply(this, arguments));
};

var _getMaxAddress = mech.Memory.prototype.getMaxAddress;
mech.Memory.prototype.getMaxAddress = async function () {
  return Number(await _getMaxAddress.apply(this, arguments));
};

var _find = mech.Memory.prototype.find;
mech.Memory.prototype.find = async function () {
  var hits = await _find.apply(this, arguments);
  for (var i = 0; i < hits.length; i++) hits[i] = Number(hits[i]);
  return hits;
};

// Region constructor override — coerce bigint fields to number on creation.
var _OrigRegion = mech.Region;
var _RegionShim = function () {
  var r = new _OrigRegion();
  return regionToNumber(r);
};
_RegionShim.prototype = _OrigRegion.prototype;
_RegionShim.compare = _OrigRegion.compare;
var Region = callableClass(_RegionShim);
Memory.Region  = Region;

// Cache stubs — robot-js 2.x exposed caching on Memory but it was never
// implemented beyond the NAPI layer.  Modern mechatron drops it entirely;
// provide synchronous noop stubs here for ABI compatibility.
mech.Memory.prototype.createCache = function () { return false; };
mech.Memory.prototype.clearCache = function () {};
mech.Memory.prototype.deleteCache = function () {};
mech.Memory.prototype.isCaching = function () { return false; };
mech.Memory.prototype.getCacheSize = function () { return 0; };

// getWindows — moved out of the Process class in modern mechatron; the
// window subsystem handles all window enumeration.  This shim uses
// Window.getList + PID filtering to maintain the robot-js API shape.
mech.Process.prototype.getWindows = async function (regex) {
  var pid = this.getPID();
  var wins = await mech.Window.getList(regex);
  var out = [];
  for (var i = 0; i < wins.length; i++) {
    if (await wins[i].getPID() === pid) out.push(wins[i]);
  }
  return out;
};

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
