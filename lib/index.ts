// mechatron — meta-package re-exporting all subsystem packages
// This preserves the original robot-js-compatible API surface.

// Pure data types
import { Range, Point, Size, Bounds, Color, Hash, Image, Timer } from "mechatron-types";

// Subsystem classes
import { Keyboard, getAllKeyConstants } from "mechatron-keyboard";
import { Mouse, BUTTON_LEFT, BUTTON_MID, BUTTON_MIDDLE, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "mechatron-mouse";
import { Clipboard } from "mechatron-clipboard";
import { Screen } from "mechatron-screen";
import { Window } from "mechatron-window";
import { Process, Module, Segment } from "mechatron-process";
import { Memory, Stats, Region, MEMORY_DEFAULT, MEMORY_SKIP_ERRORS, MEMORY_AUTO_ACCESS } from "mechatron-memory";

// Version constants
const ROBOT_VERSION = 0x020200;
const ROBOT_VERSION_STR = "2.2.0 (0.0.0)";
const ADDON_VERSION = 0x000000;
const ADDON_VERSION_STR = "0.0.0";

// Wrap ES6 classes so they can be called without `new` (matching C++ NAPI OnCalledAsFunction behavior)
function callableClass<T extends new (...args: any[]) => any>(Cls: T): T {
  return new Proxy(Cls, {
    apply(_target, _thisArg, args) {
      return new Cls(...args);
    },
  }) as T;
}

// Top-level sleep/clock functions matching original API
function sleep(a: Range | number, b?: number): void {
  Timer.sleep(a as any, b as any);
}

function clock(): number {
  return Timer.getCpuTime();
}

// Wrap sub-classes for callable-without-new
const CallableSegment = callableClass(Segment);
const CallableStats = callableClass(Stats);
const CallableRegion = callableClass(Region);

// Attach Segment to Module (matches original: mRobot.Module.Segment = Segment)
(Module as any).Segment = CallableSegment;

// Attach Stats and Region to Memory
(Memory as any).Stats = CallableStats;
(Memory as any).Region = CallableRegion;

// Hook Process.prototype.getModules to set _proc on returned modules
const _origGetModules = Process.prototype.getModules;
Process.prototype.getModules = function(this: Process, regex?: string) {
  const rawModules = _origGetModules.call(this, regex);
  return rawModules.map((m: any) => {
    const mod = new Module(m);
    mod._segments = null;
    mod._proc = this;
    return mod;
  });
} as any;

// Backend management — pass-through to subsystem native loaders
// For backward compatibility, getNativeBackend/setNativeBackend are no-ops
// since each subsystem now manages its own native backend.
function getNativeBackend(): any {
  return {};
}
function setNativeBackend(_backend: any): void {
  // No-op — subsystems manage their own native loaders
}

// Platform-specific key/button constants
const _keyConstants = getAllKeyConstants();

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
  Bounds: callableClass(Bounds),
  Clipboard,
  Color: callableClass(Color),
  Hash: callableClass(Hash),
  Image: callableClass(Image),
  Keyboard: callableClass(Keyboard),
  Memory: callableClass(Memory),
  Module: callableClass(Module),
  Mouse: callableClass(Mouse),
  Point: callableClass(Point),
  Process: callableClass(Process),
  Range: callableClass(Range),
  Screen: callableClass(Screen),
  Size: callableClass(Size),
  Timer: callableClass(Timer),
  Window: callableClass(Window),

  // Key constants (platform-specific)
  ..._keyConstants,

  // Button constants
  BUTTON_LEFT, BUTTON_MID, BUTTON_MIDDLE, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2,

  // Memory constants
  MEMORY_DEFAULT, MEMORY_SKIP_ERRORS, MEMORY_AUTO_ACCESS,

  // Backend management (legacy)
  getNativeBackend,
  setNativeBackend,
};

export = mRobot;
