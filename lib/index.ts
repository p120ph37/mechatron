// mechatron - TypeScript API layer
// Pure data types (zero native dependency)
import { Range } from "./Range";
import { Point } from "./Point";
import { Size } from "./Size";
import { Bounds } from "./Bounds";
import { Color } from "./Color";
import { Hash } from "./Hash";
import { Image } from "./Image";
import { Timer } from "./Timer";

// Native-backed types
import { Keyboard } from "./Keyboard";
import { Mouse } from "./Mouse";
import { Clipboard } from "./Clipboard";
import { Screen } from "./Screen";
import { Window } from "./Window";
import { Process } from "./Process";
import { Module, Segment } from "./Module";
import { Memory, Stats, Region } from "./Memory";

// Native backend management
import { getNativeBackend, setNativeBackend, getNativeConstants } from "./native";

// Version constants
const ROBOT_VERSION = 0x020000;
const ROBOT_VERSION_STR = "2.0.0 (0.0.0)";
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

// Platform-specific key/button constants from native addon
const _nativeConstants = getNativeConstants();

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

  // Key and button constants from native addon (platform-specific)
  ..._nativeConstants,

  // Backend management
  getNativeBackend,
  setNativeBackend,
};

export = mRobot;
