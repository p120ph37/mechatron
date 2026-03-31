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
import { getNativeBackend, setNativeBackend } from "./native";

// Version constants
const ROBOT_VERSION = 0x020000;
const ROBOT_VERSION_STR = "2.0.0 (0.0.0)";
const ADDON_VERSION = 0x000000;
const ADDON_VERSION_STR = "0.0.0";

// Platform-specific key constants
// These are loaded from the native addon at runtime so they match the compiled platform
function getKeyConstants(): Record<string, number> {
  try {
    const native = getNativeBackend();
    // The thin native addon exports key constants directly
    // For now, use the X11 keysym values (Linux) as defaults
    return _linuxKeys;
  } catch {
    return _linuxKeys;
  }
}

// Linux (X11 keysym) key constants - used as compile-time defaults
const _linuxKeys: Record<string, number> = {
  KEY_SPACE: 0x0020,
  KEY_ESCAPE: 0xFF1B,
  KEY_TAB: 0xFF09,
  KEY_ALT: 0xFFE9,
  KEY_LALT: 0xFFE9,
  KEY_RALT: 0xFFEA,
  KEY_CONTROL: 0xFFE3,
  KEY_LCONTROL: 0xFFE3,
  KEY_RCONTROL: 0xFFE4,
  KEY_SHIFT: 0xFFE1,
  KEY_LSHIFT: 0xFFE1,
  KEY_RSHIFT: 0xFFE2,
  KEY_SYSTEM: 0xFFEB,
  KEY_LSYSTEM: 0xFFEB,
  KEY_RSYSTEM: 0xFFEC,
  KEY_F1: 0xFFBE,
  KEY_F2: 0xFFBF,
  KEY_F3: 0xFFC0,
  KEY_F4: 0xFFC1,
  KEY_F5: 0xFFC2,
  KEY_F6: 0xFFC3,
  KEY_F7: 0xFFC4,
  KEY_F8: 0xFFC5,
  KEY_F9: 0xFFC6,
  KEY_F10: 0xFFC7,
  KEY_F11: 0xFFC8,
  KEY_F12: 0xFFC9,
  KEY_0: 0x0030,
  KEY_1: 0x0031,
  KEY_2: 0x0032,
  KEY_3: 0x0033,
  KEY_4: 0x0034,
  KEY_5: 0x0035,
  KEY_6: 0x0036,
  KEY_7: 0x0037,
  KEY_8: 0x0038,
  KEY_9: 0x0039,
  KEY_A: 0x0061,
  KEY_B: 0x0062,
  KEY_C: 0x0063,
  KEY_D: 0x0064,
  KEY_E: 0x0065,
  KEY_F: 0x0066,
  KEY_G: 0x0067,
  KEY_H: 0x0068,
  KEY_I: 0x0069,
  KEY_J: 0x006A,
  KEY_K: 0x006B,
  KEY_L: 0x006C,
  KEY_M: 0x006D,
  KEY_N: 0x006E,
  KEY_O: 0x006F,
  KEY_P: 0x0070,
  KEY_Q: 0x0071,
  KEY_R: 0x0072,
  KEY_S: 0x0073,
  KEY_T: 0x0074,
  KEY_U: 0x0075,
  KEY_V: 0x0076,
  KEY_W: 0x0077,
  KEY_X: 0x0078,
  KEY_Y: 0x0079,
  KEY_Z: 0x007A,
  KEY_GRAVE: 0x0060,
  KEY_MINUS: 0x002D,
  KEY_EQUAL: 0x003D,
  KEY_BACKSPACE: 0xFF08,
  KEY_LBRACKET: 0x005B,
  KEY_RBRACKET: 0x005D,
  KEY_BACKSLASH: 0x005C,
  KEY_SEMICOLON: 0x003B,
  KEY_QUOTE: 0x0027,
  KEY_RETURN: 0xFF0D,
  KEY_COMMA: 0x002C,
  KEY_PERIOD: 0x002E,
  KEY_SLASH: 0x002F,
  KEY_LEFT: 0xFF51,
  KEY_UP: 0xFF52,
  KEY_RIGHT: 0xFF53,
  KEY_DOWN: 0xFF54,
  KEY_PRINT: 0xFF61,
  KEY_PAUSE: 0xFF13,
  KEY_INSERT: 0xFF63,
  KEY_DELETE: 0xFFFF,
  KEY_HOME: 0xFF50,
  KEY_END: 0xFF57,
  KEY_PAGE_UP: 0xFF55,
  KEY_PAGE_DOWN: 0xFF56,
  KEY_ADD: 0xFFAB,
  KEY_SUBTRACT: 0xFFAD,
  KEY_MULTIPLY: 0xFFAA,
  KEY_DIVIDE: 0xFFAF,
  KEY_DECIMAL: 0xFFAE,
  KEY_ENTER: 0xFF8D,
  KEY_NUM0: 0xFFB0,
  KEY_NUM1: 0xFFB1,
  KEY_NUM2: 0xFFB2,
  KEY_NUM3: 0xFFB3,
  KEY_NUM4: 0xFFB4,
  KEY_NUM5: 0xFFB5,
  KEY_NUM6: 0xFFB6,
  KEY_NUM7: 0xFFB7,
  KEY_NUM8: 0xFFB8,
  KEY_NUM9: 0xFFB9,
  KEY_CAPS_LOCK: 0xFFE5,
  KEY_SCROLL_LOCK: 0xFF14,
  KEY_NUM_LOCK: 0xFF7F,
};

// Button constants (platform-independent)
const BUTTON_LEFT = 0;
const BUTTON_MID = 1;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;
const BUTTON_X1 = 3;
const BUTTON_X2 = 4;

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

// Export everything as a single module object (matching the original index.js pattern)
const keys = getKeyConstants();

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

  // Key constants
  ...keys,

  // Button constants
  BUTTON_LEFT,
  BUTTON_MID,
  BUTTON_MIDDLE,
  BUTTON_RIGHT,
  BUTTON_X1,
  BUTTON_X2,

  // Backend management (new in TS layer)
  getNativeBackend,
  setNativeBackend,
};

export = mRobot;
