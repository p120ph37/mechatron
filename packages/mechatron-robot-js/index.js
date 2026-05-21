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

var mech;
try {
  // When running from the monorepo workspace, resolve the local source
  // (Bun can import .ts directly).  This is the development path.
  mech = require("../../lib/index.ts");
} catch (_) {
  // When installed as an npm package, resolve the published mechatron.
  mech = require("mechatron");
}

// ---------------------------------------------------------------------------
// Synchronous bridge — block the calling thread until a Promise resolves.
//
// robot-js 2.x was fully synchronous: every method blocked the event loop
// until the result was ready.  Modern mechatron is async-first (napi
// AsyncTask, worker-thread FFI dispatch).  This bridge keeps a persistent
// Worker thread alive with its own mechatron instance.  The main thread
// sends { expr, args } messages and blocks via Atomics.wait until the
// worker writes the JSON result into a SharedArrayBuffer and signals.
//
// The persistent worker preserves state (X11 connections, clipboard
// selections, etc.) across calls.
// ---------------------------------------------------------------------------
var _workerThreads = require("worker_threads");

var _mechPath;
try {
  _mechPath = require.resolve("../../lib/index.ts");
} catch (_) {
  _mechPath = require.resolve("mechatron");
}

var _syncLockSab = new SharedArrayBuffer(4);
var _syncLock = new Int32Array(_syncLockSab);
var _syncDataSab = new SharedArrayBuffer(1 << 20);
var _syncDataView = new Uint8Array(_syncDataSab);

var _syncWorkerCode = [
  'var { parentPort, workerData } = require("worker_threads");',
  'var lock = new Int32Array(workerData.lockSab);',
  'var data = new Uint8Array(workerData.dataSab);',
  'var mech = require(workerData.mechPath);',
  'parentPort.on("message", async function(msg) {',
  '  var val, err;',
  '  try {',
  '    val = await new Function("mech", "args", "return " + msg.expr)(mech, msg.args);',
  '  } catch (e) { err = e && e.message || String(e); }',
  '  var json = err !== undefined ? JSON.stringify({ __e: err }) : JSON.stringify(val, function(k, v) { return typeof v === "bigint" ? Number(v) : v; });',
  '  var enc = new TextEncoder();',
  '  var bytes = enc.encode(json);',
  '  data.fill(0);',
  '  if (bytes.length < data.length) data.set(bytes);',
  '  Atomics.store(lock, 0, 1);',
  '  Atomics.notify(lock, 0);',
  '});',
].join("\n");

var _syncWorker = null;

function ensureSyncWorker() {
  if (_syncWorker) return;
  _syncWorker = new _workerThreads.Worker(_syncWorkerCode, {
    eval: true,
    workerData: { lockSab: _syncLockSab, dataSab: _syncDataSab, mechPath: _mechPath },
  });
  _syncWorker.unref();
}

function awaitSync(expr, args) {
  ensureSyncWorker();
  _syncDataView.fill(0);
  Atomics.store(_syncLock, 0, 0);

  _syncWorker.postMessage({ expr: expr, args: args || [] });
  Atomics.wait(_syncLock, 0, 0, 30000);

  var end = 0;
  while (end < _syncDataView.length && _syncDataView[end] !== 0) end++;
  if (end === 0) return undefined;
  var parsed = JSON.parse(new TextDecoder().decode(_syncDataView.subarray(0, end)));
  if (parsed && typeof parsed === "object" && parsed.__e !== undefined) {
    throw new Error(parsed.__e);
  }
  return parsed;
}

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
// Synchronous overrides — make async mechatron methods block synchronously
// to preserve the robot-js 2.x fully-synchronous API contract.
// ---------------------------------------------------------------------------

// -- Window static methods --
mech.Window.getList = function (title) {
  var handles = awaitSync(
    '(async function() { var ws = await mech.Window.getList(args[0]); return ws.map(function(w) { return Number(w.getHandle()); }); })()',
    [title]
  );
  if (!handles) return [];
  return handles.map(function (h) { return new mech.Window(h); });
};

mech.Window.getActive = function () {
  var handle = awaitSync(
    '(async function() { var w = await mech.Window.getActive(); return Number(w.getHandle()); })()'
  );
  return new mech.Window(handle || 0);
};

mech.Window.setActive = function (window) {
  awaitSync(
    '(async function() { await mech.Window.setActive(new mech.Window(args[0])); })()',
    [Number(window.getHandle())]
  );
};

mech.Window.isAxEnabled = function (prompt) {
  return awaitSync('mech.Window.isAxEnabled(args[0])', [prompt]);
};

// -- Window instance methods --
var _origWinGetHandle = mech.Window.prototype.getHandle;
mech.Window.prototype.getHandle = function () {
  return Number(_origWinGetHandle.call(this));
};

mech.Window.prototype.isValid = function () {
  return awaitSync(
    '(new mech.Window(args[0])).isValid()',
    [this.getHandle()]
  );
};

mech.Window.prototype.close = function () {
  awaitSync('(new mech.Window(args[0])).close()', [this.getHandle()]);
};

mech.Window.prototype.isTopMost = function () {
  return awaitSync('(new mech.Window(args[0])).isTopMost()', [this.getHandle()]);
};

mech.Window.prototype.isBorderless = function () {
  return awaitSync('(new mech.Window(args[0])).isBorderless()', [this.getHandle()]);
};

mech.Window.prototype.isMinimized = function () {
  return awaitSync('(new mech.Window(args[0])).isMinimized()', [this.getHandle()]);
};

mech.Window.prototype.isMaximized = function () {
  return awaitSync('(new mech.Window(args[0])).isMaximized()', [this.getHandle()]);
};

mech.Window.prototype.setTopMost = function (v) {
  awaitSync('(new mech.Window(args[0])).setTopMost(args[1])', [this.getHandle(), v]);
};

mech.Window.prototype.setBorderless = function (v) {
  awaitSync('(new mech.Window(args[0])).setBorderless(args[1])', [this.getHandle(), v]);
};

mech.Window.prototype.setMinimized = function (v) {
  awaitSync('(new mech.Window(args[0])).setMinimized(args[1])', [this.getHandle(), v]);
};

mech.Window.prototype.setMaximized = function (v) {
  awaitSync('(new mech.Window(args[0])).setMaximized(args[1])', [this.getHandle(), v]);
};

mech.Window.prototype.getProcess = function () {
  var pid = awaitSync(
    '(async function() { var p = await (new mech.Window(args[0])).getProcess(); return p.getPID(); })()',
    [this.getHandle()]
  );
  return new mech.Process(pid);
};

mech.Window.prototype.getPID = function () {
  return awaitSync('(new mech.Window(args[0])).getPID()', [this.getHandle()]);
};

mech.Window.prototype.setHandle = function (handle) {
  return awaitSync(
    '(new mech.Window(args[0])).setHandle(args[1])',
    [this.getHandle(), Number(handle)]
  );
};

mech.Window.prototype.getTitle = function () {
  return awaitSync('(new mech.Window(args[0])).getTitle()', [this.getHandle()]);
};

mech.Window.prototype.setTitle = function (title) {
  awaitSync('(new mech.Window(args[0])).setTitle(args[1])', [this.getHandle(), title]);
};

mech.Window.prototype.getBounds = function () {
  var b = awaitSync(
    '(async function() { var b = await (new mech.Window(args[0])).getBounds(); return [b.x,b.y,b.w,b.h]; })()',
    [this.getHandle()]
  );
  return b ? new mech.Bounds(b[0], b[1], b[2], b[3]) : new mech.Bounds();
};

mech.Window.prototype.setBounds = function (a, b, c, d) {
  if (typeof a === "number") {
    awaitSync('(new mech.Window(args[0])).setBounds(args[1],args[2],args[3],args[4])', [this.getHandle(), a, b, c, d]);
  } else if (a && typeof a.x === "number") {
    awaitSync('(new mech.Window(args[0])).setBounds(args[1],args[2],args[3],args[4])', [this.getHandle(), a.x, a.y, a.w, a.h]);
  } else {
    awaitSync('(new mech.Window(args[0])).setBounds()', [this.getHandle()]);
  }
};

mech.Window.prototype.getClient = function () {
  var b = awaitSync(
    '(async function() { var b = await (new mech.Window(args[0])).getClient(); return [b.x,b.y,b.w,b.h]; })()',
    [this.getHandle()]
  );
  return b ? new mech.Bounds(b[0], b[1], b[2], b[3]) : new mech.Bounds();
};

mech.Window.prototype.setClient = function (a, b, c, d) {
  if (typeof a === "number") {
    awaitSync('(new mech.Window(args[0])).setClient(args[1],args[2],args[3],args[4])', [this.getHandle(), a, b, c, d]);
  } else if (a && typeof a.x === "number") {
    awaitSync('(new mech.Window(args[0])).setClient(args[1],args[2],args[3],args[4])', [this.getHandle(), a.x, a.y, a.w, a.h]);
  } else {
    awaitSync('(new mech.Window(args[0])).setClient()', [this.getHandle()]);
  }
};

mech.Window.prototype.mapToClient = function (a, b) {
  var x, y;
  if (typeof a === "number") { x = a; y = b !== undefined ? b : a; }
  else if (a && typeof a.x === "number") { x = a.x; y = a.y; }
  else { x = 0; y = 0; }
  var p = awaitSync(
    '(async function() { var p = await (new mech.Window(args[0])).mapToClient(args[1],args[2]); return [p.x,p.y]; })()',
    [this.getHandle(), x, y]
  );
  return p ? new mech.Point(p[0], p[1]) : new mech.Point();
};

mech.Window.prototype.mapToScreen = function (a, b) {
  var x, y;
  if (typeof a === "number") { x = a; y = b !== undefined ? b : a; }
  else if (a && typeof a.x === "number") { x = a.x; y = a.y; }
  else { x = 0; y = 0; }
  var p = awaitSync(
    '(async function() { var p = await (new mech.Window(args[0])).mapToScreen(args[1],args[2]); return [p.x,p.y]; })()',
    [this.getHandle(), x, y]
  );
  return p ? new mech.Point(p[0], p[1]) : new mech.Point();
};

// -- Screen static methods --
mech.Screen.synchronize = function () {
  return awaitSync('mech.Screen.synchronize()');
};

mech.Screen.getList = function () {
  var data = awaitSync(
    'mech.Screen.getList().map(function(s) { var b = s.getBounds(); var u = s.getUsable(); return [b.x,b.y,b.w,b.h,u.x,u.y,u.w,u.h]; })'
  );
  if (!data || !data.length) return [];
  return data.map(function (d) {
    return new mech.Screen(new mech.Bounds(d[0], d[1], d[2], d[3]), new mech.Bounds(d[4], d[5], d[6], d[7]));
  });
};

mech.Screen.getMain = function () {
  var d = awaitSync(
    '(function() { var s = mech.Screen.getMain(); if (!s) return null; var b = s.getBounds(); var u = s.getUsable(); return [b.x,b.y,b.w,b.h,u.x,u.y,u.w,u.h]; })()'
  );
  if (!d) return null;
  return new mech.Screen(new mech.Bounds(d[0], d[1], d[2], d[3]), new mech.Bounds(d[4], d[5], d[6], d[7]));
};

mech.Screen.getTotalBounds = function () {
  var d = awaitSync(
    '(function() { var b = mech.Screen.getTotalBounds(); return [b.x,b.y,b.w,b.h]; })()'
  );
  return d ? new mech.Bounds(d[0], d[1], d[2], d[3]) : new mech.Bounds();
};

mech.Screen.getTotalUsable = function () {
  var d = awaitSync(
    '(function() { var b = mech.Screen.getTotalUsable(); return [b.x,b.y,b.w,b.h]; })()'
  );
  return d ? new mech.Bounds(d[0], d[1], d[2], d[3]) : new mech.Bounds();
};

// -- Process static methods --
mech.Process.getCurrent = function () {
  var pid = awaitSync('mech.Process.getCurrent().then(function(p) { return p.getPID(); })');
  return new mech.Process(pid);
};

mech.Process.getList = function (regex) {
  var pids = awaitSync(
    '(async function() { var ps = await mech.Process.getList(args[0]); return ps.map(function(p) { return p.getPID(); }); })()',
    [regex]
  );
  if (!pids) return [];
  return pids.map(function (pid) { return new mech.Process(pid); });
};

mech.Process.isSys64Bit = function () {
  return awaitSync('mech.Process.isSys64Bit()');
};

// -- Process instance methods --
mech.Process.prototype.open = function (pid) {
  return awaitSync('(new mech.Process()).open(args[0])', [pid]);
};

mech.Process.prototype.close = function () {
  awaitSync('(new mech.Process(args[0])).close()', [this.getPID()]);
};

mech.Process.prototype.isValid = function () {
  return awaitSync('(new mech.Process(args[0])).isValid()', [this.getPID()]);
};

mech.Process.prototype.is64Bit = function () {
  return awaitSync('(new mech.Process(args[0])).is64Bit()', [this.getPID()]);
};

mech.Process.prototype.isDebugged = function () {
  return awaitSync('(new mech.Process(args[0])).isDebugged()', [this.getPID()]);
};

mech.Process.prototype.getHandle = function () {
  return awaitSync('(new mech.Process(args[0])).getHandle()', [this.getPID()]);
};

mech.Process.prototype.getName = function () {
  return awaitSync('(new mech.Process(args[0])).getName()', [this.getPID()]);
};

mech.Process.prototype.getPath = function () {
  return awaitSync('(new mech.Process(args[0])).getPath()', [this.getPID()]);
};

mech.Process.prototype.exit = function () {
  awaitSync('(new mech.Process(args[0])).exit()', [this.getPID()]);
};

mech.Process.prototype.kill = function () {
  awaitSync('(new mech.Process(args[0])).kill()', [this.getPID()]);
};

mech.Process.prototype.hasExited = function () {
  return awaitSync('(new mech.Process(args[0])).hasExited()', [this.getPID()]);
};

mech.Process.prototype.getModules = function (regex) {
  var raw = awaitSync(
    '(async function() { var ms = await (new mech.Process(args[0])).getModules(args[1]); return ms.map(function(m) { return { valid: m.isValid(), name: m.getName(), path: m.getPath(), base: Number(m.getBase()), size: Number(m.getSize()) }; }); })()',
    [this.getPID(), regex]
  );
  if (!raw) return [];
  var self = this;
  return raw.map(function (d) {
    var mod = new mech.Module(d);
    mod._proc = self;
    return mod;
  });
};

mech.Process.prototype.getWindows = function (regex) {
  var pid = this.getPID();
  var handles = awaitSync(
    '(async function() { var wins = await mech.Window.getList(args[1]); var out = []; for (var i = 0; i < wins.length; i++) { if (await wins[i].getPID() === args[0]) out.push(Number(wins[i].getHandle())); } return out; })()',
    [pid, regex]
  );
  if (!handles) return [];
  return handles.map(function (h) { return new mech.Window(h); });
};

// -- Clipboard methods --
mech.Clipboard.clear = function () {
  return awaitSync('mech.Clipboard.clear()');
};

mech.Clipboard.hasText = function () {
  return awaitSync('mech.Clipboard.hasText()');
};

mech.Clipboard.getText = function () {
  return awaitSync('mech.Clipboard.getText()');
};

mech.Clipboard.setText = function (text) {
  return awaitSync('mech.Clipboard.setText(args[0])', [text]);
};

mech.Clipboard.hasImage = function () {
  return awaitSync('mech.Clipboard.hasImage()');
};

mech.Clipboard.getSequence = function () {
  return awaitSync('mech.Clipboard.getSequence()');
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
