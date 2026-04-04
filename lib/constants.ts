// Platform-specific key, button, and memory constants.
// These were previously compiled into the Rust native module with #[cfg(target_os)].
// Now defined purely in TS, selected at runtime via process.platform.

// ---------------------------------------------------------------------------
// Key constants — per-platform keycodes
// ---------------------------------------------------------------------------

interface KeyTable {
  KEY_SPACE: number; KEY_ESCAPE: number; KEY_TAB: number;
  KEY_ALT: number; KEY_LALT: number; KEY_RALT: number;
  KEY_CONTROL: number; KEY_LCONTROL: number; KEY_RCONTROL: number;
  KEY_SHIFT: number; KEY_LSHIFT: number; KEY_RSHIFT: number;
  KEY_SYSTEM: number; KEY_LSYSTEM: number; KEY_RSYSTEM: number;
  KEY_F1: number; KEY_F2: number; KEY_F3: number; KEY_F4: number;
  KEY_F5: number; KEY_F6: number; KEY_F7: number; KEY_F8: number;
  KEY_F9: number; KEY_F10: number; KEY_F11: number; KEY_F12: number;
  KEY_0: number; KEY_1: number; KEY_2: number; KEY_3: number;
  KEY_4: number; KEY_5: number; KEY_6: number; KEY_7: number;
  KEY_8: number; KEY_9: number;
  KEY_A: number; KEY_B: number; KEY_C: number; KEY_D: number;
  KEY_E: number; KEY_F: number; KEY_G: number; KEY_H: number;
  KEY_I: number; KEY_J: number; KEY_K: number; KEY_L: number;
  KEY_M: number; KEY_N: number; KEY_O: number; KEY_P: number;
  KEY_Q: number; KEY_R: number; KEY_S: number; KEY_T: number;
  KEY_U: number; KEY_V: number; KEY_W: number; KEY_X: number;
  KEY_Y: number; KEY_Z: number;
  KEY_GRAVE: number; KEY_MINUS: number; KEY_EQUAL: number;
  KEY_BACKSPACE: number;
  KEY_LBRACKET: number; KEY_RBRACKET: number; KEY_BACKSLASH: number;
  KEY_SEMICOLON: number; KEY_QUOTE: number; KEY_RETURN: number;
  KEY_COMMA: number; KEY_PERIOD: number; KEY_SLASH: number;
  KEY_LEFT: number; KEY_UP: number; KEY_RIGHT: number; KEY_DOWN: number;
  KEY_PRINT: number; KEY_PAUSE: number; KEY_INSERT: number; KEY_DELETE: number;
  KEY_HOME: number; KEY_END: number; KEY_PAGE_UP: number; KEY_PAGE_DOWN: number;
  KEY_ADD: number; KEY_SUBTRACT: number; KEY_MULTIPLY: number;
  KEY_DIVIDE: number; KEY_DECIMAL: number; KEY_ENTER: number;
  KEY_NUM0: number; KEY_NUM1: number; KEY_NUM2: number; KEY_NUM3: number;
  KEY_NUM4: number; KEY_NUM5: number; KEY_NUM6: number; KEY_NUM7: number;
  KEY_NUM8: number; KEY_NUM9: number;
  KEY_CAPS_LOCK: number; KEY_SCROLL_LOCK: number; KEY_NUM_LOCK: number;
}

// Linux — X11 keysym values
const linuxKeys: KeyTable = {
  KEY_SPACE: 0x0020, KEY_ESCAPE: 0xFF1B, KEY_TAB: 0xFF09,
  KEY_ALT: 0xFFE9, KEY_LALT: 0xFFE9, KEY_RALT: 0xFFEA,
  KEY_CONTROL: 0xFFE3, KEY_LCONTROL: 0xFFE3, KEY_RCONTROL: 0xFFE4,
  KEY_SHIFT: 0xFFE1, KEY_LSHIFT: 0xFFE1, KEY_RSHIFT: 0xFFE2,
  KEY_SYSTEM: 0xFFEB, KEY_LSYSTEM: 0xFFEB, KEY_RSYSTEM: 0xFFEC,
  KEY_F1: 0xFFBE, KEY_F2: 0xFFBF, KEY_F3: 0xFFC0, KEY_F4: 0xFFC1,
  KEY_F5: 0xFFC2, KEY_F6: 0xFFC3, KEY_F7: 0xFFC4, KEY_F8: 0xFFC5,
  KEY_F9: 0xFFC6, KEY_F10: 0xFFC7, KEY_F11: 0xFFC8, KEY_F12: 0xFFC9,
  KEY_0: 0x0030, KEY_1: 0x0031, KEY_2: 0x0032, KEY_3: 0x0033,
  KEY_4: 0x0034, KEY_5: 0x0035, KEY_6: 0x0036, KEY_7: 0x0037,
  KEY_8: 0x0038, KEY_9: 0x0039,
  KEY_A: 0x0061, KEY_B: 0x0062, KEY_C: 0x0063, KEY_D: 0x0064,
  KEY_E: 0x0065, KEY_F: 0x0066, KEY_G: 0x0067, KEY_H: 0x0068,
  KEY_I: 0x0069, KEY_J: 0x006A, KEY_K: 0x006B, KEY_L: 0x006C,
  KEY_M: 0x006D, KEY_N: 0x006E, KEY_O: 0x006F, KEY_P: 0x0070,
  KEY_Q: 0x0071, KEY_R: 0x0072, KEY_S: 0x0073, KEY_T: 0x0074,
  KEY_U: 0x0075, KEY_V: 0x0076, KEY_W: 0x0077, KEY_X: 0x0078,
  KEY_Y: 0x0079, KEY_Z: 0x007A,
  KEY_GRAVE: 0x0060, KEY_MINUS: 0x002D, KEY_EQUAL: 0x003D,
  KEY_BACKSPACE: 0xFF08,
  KEY_LBRACKET: 0x005B, KEY_RBRACKET: 0x005D, KEY_BACKSLASH: 0x005C,
  KEY_SEMICOLON: 0x003B, KEY_QUOTE: 0x0027, KEY_RETURN: 0xFF0D,
  KEY_COMMA: 0x002C, KEY_PERIOD: 0x002E, KEY_SLASH: 0x002F,
  KEY_LEFT: 0xFF51, KEY_UP: 0xFF52, KEY_RIGHT: 0xFF53, KEY_DOWN: 0xFF54,
  KEY_PRINT: 0xFF61, KEY_PAUSE: 0xFF13, KEY_INSERT: 0xFF63, KEY_DELETE: 0xFFFF,
  KEY_HOME: 0xFF50, KEY_END: 0xFF57, KEY_PAGE_UP: 0xFF55, KEY_PAGE_DOWN: 0xFF56,
  KEY_ADD: 0xFFAB, KEY_SUBTRACT: 0xFFAD, KEY_MULTIPLY: 0xFFAA,
  KEY_DIVIDE: 0xFFAF, KEY_DECIMAL: 0xFFAE, KEY_ENTER: 0xFF8D,
  KEY_NUM0: 0xFFB0, KEY_NUM1: 0xFFB1, KEY_NUM2: 0xFFB2, KEY_NUM3: 0xFFB3,
  KEY_NUM4: 0xFFB4, KEY_NUM5: 0xFFB5, KEY_NUM6: 0xFFB6, KEY_NUM7: 0xFFB7,
  KEY_NUM8: 0xFFB8, KEY_NUM9: 0xFFB9,
  KEY_CAPS_LOCK: 0xFFE5, KEY_SCROLL_LOCK: 0xFF14, KEY_NUM_LOCK: 0xFF7F,
};

// macOS — kVK_ virtual keycodes
const darwinKeys: KeyTable = {
  KEY_SPACE: 0x31, KEY_ESCAPE: 0x35, KEY_TAB: 0x30,
  KEY_ALT: 0x3A, KEY_LALT: 0x3A, KEY_RALT: 0x3D,
  KEY_CONTROL: 0x3B, KEY_LCONTROL: 0x3B, KEY_RCONTROL: 0x3E,
  KEY_SHIFT: 0x38, KEY_LSHIFT: 0x38, KEY_RSHIFT: 0x3C,
  KEY_SYSTEM: 0x37, KEY_LSYSTEM: 0x37, KEY_RSYSTEM: 0x36,
  KEY_F1: 0x7A, KEY_F2: 0x78, KEY_F3: 0x63, KEY_F4: 0x76,
  KEY_F5: 0x60, KEY_F6: 0x61, KEY_F7: 0x62, KEY_F8: 0x64,
  KEY_F9: 0x65, KEY_F10: 0x6D, KEY_F11: 0x67, KEY_F12: 0x6F,
  KEY_0: 0x1D, KEY_1: 0x12, KEY_2: 0x13, KEY_3: 0x14,
  KEY_4: 0x15, KEY_5: 0x17, KEY_6: 0x16, KEY_7: 0x1A,
  KEY_8: 0x1C, KEY_9: 0x19,
  KEY_A: 0x00, KEY_B: 0x0B, KEY_C: 0x08, KEY_D: 0x02,
  KEY_E: 0x0E, KEY_F: 0x03, KEY_G: 0x05, KEY_H: 0x04,
  KEY_I: 0x22, KEY_J: 0x26, KEY_K: 0x28, KEY_L: 0x25,
  KEY_M: 0x2E, KEY_N: 0x2D, KEY_O: 0x1F, KEY_P: 0x23,
  KEY_Q: 0x0C, KEY_R: 0x0F, KEY_S: 0x01, KEY_T: 0x11,
  KEY_U: 0x20, KEY_V: 0x09, KEY_W: 0x0D, KEY_X: 0x07,
  KEY_Y: 0x10, KEY_Z: 0x06,
  KEY_GRAVE: 0x32, KEY_MINUS: 0x1B, KEY_EQUAL: 0x18,
  KEY_BACKSPACE: 0x33,
  KEY_LBRACKET: 0x21, KEY_RBRACKET: 0x1E, KEY_BACKSLASH: 0x2A,
  KEY_SEMICOLON: 0x29, KEY_QUOTE: 0x27, KEY_RETURN: 0x24,
  KEY_COMMA: 0x2B, KEY_PERIOD: 0x2F, KEY_SLASH: 0x2C,
  KEY_LEFT: 0x7B, KEY_UP: 0x7E, KEY_RIGHT: 0x7C, KEY_DOWN: 0x7D,
  KEY_PRINT: 0x69, KEY_PAUSE: 0x71, KEY_INSERT: 0x72, KEY_DELETE: 0x75,
  KEY_HOME: 0x73, KEY_END: 0x77, KEY_PAGE_UP: 0x74, KEY_PAGE_DOWN: 0x79,
  KEY_ADD: 0x45, KEY_SUBTRACT: 0x4E, KEY_MULTIPLY: 0x43,
  KEY_DIVIDE: 0x4B, KEY_DECIMAL: 0x41, KEY_ENTER: 0x4C,
  KEY_NUM0: 0x52, KEY_NUM1: 0x53, KEY_NUM2: 0x54, KEY_NUM3: 0x55,
  KEY_NUM4: 0x56, KEY_NUM5: 0x57, KEY_NUM6: 0x58, KEY_NUM7: 0x59,
  KEY_NUM8: 0x5B, KEY_NUM9: 0x5C,
  KEY_CAPS_LOCK: 0x39, KEY_SCROLL_LOCK: 0x6B, KEY_NUM_LOCK: 0x47,
};

// Windows — VK_ virtual key codes
const win32Keys: KeyTable = {
  KEY_SPACE: 0x20, KEY_ESCAPE: 0x1B, KEY_TAB: 0x09,
  KEY_ALT: 0x12, KEY_LALT: 0xA4, KEY_RALT: 0xA5,
  KEY_CONTROL: 0x11, KEY_LCONTROL: 0xA2, KEY_RCONTROL: 0xA3,
  KEY_SHIFT: 0x10, KEY_LSHIFT: 0xA0, KEY_RSHIFT: 0xA1,
  KEY_SYSTEM: 0x5B, KEY_LSYSTEM: 0x5B, KEY_RSYSTEM: 0x5C,
  KEY_F1: 0x70, KEY_F2: 0x71, KEY_F3: 0x72, KEY_F4: 0x73,
  KEY_F5: 0x74, KEY_F6: 0x75, KEY_F7: 0x76, KEY_F8: 0x77,
  KEY_F9: 0x78, KEY_F10: 0x79, KEY_F11: 0x7A, KEY_F12: 0x7B,
  KEY_0: 0x30, KEY_1: 0x31, KEY_2: 0x32, KEY_3: 0x33,
  KEY_4: 0x34, KEY_5: 0x35, KEY_6: 0x36, KEY_7: 0x37,
  KEY_8: 0x38, KEY_9: 0x39,
  KEY_A: 0x41, KEY_B: 0x42, KEY_C: 0x43, KEY_D: 0x44,
  KEY_E: 0x45, KEY_F: 0x46, KEY_G: 0x47, KEY_H: 0x48,
  KEY_I: 0x49, KEY_J: 0x4A, KEY_K: 0x4B, KEY_L: 0x4C,
  KEY_M: 0x4D, KEY_N: 0x4E, KEY_O: 0x4F, KEY_P: 0x50,
  KEY_Q: 0x51, KEY_R: 0x52, KEY_S: 0x53, KEY_T: 0x54,
  KEY_U: 0x55, KEY_V: 0x56, KEY_W: 0x57, KEY_X: 0x58,
  KEY_Y: 0x59, KEY_Z: 0x5A,
  KEY_GRAVE: 0xC0, KEY_MINUS: 0xBD, KEY_EQUAL: 0xBB,
  KEY_BACKSPACE: 0x08,
  KEY_LBRACKET: 0xDB, KEY_RBRACKET: 0xDD, KEY_BACKSLASH: 0xDC,
  KEY_SEMICOLON: 0xBA, KEY_QUOTE: 0xDE, KEY_RETURN: 0x0D,
  KEY_COMMA: 0xBC, KEY_PERIOD: 0xBE, KEY_SLASH: 0xBF,
  KEY_LEFT: 0x25, KEY_UP: 0x26, KEY_RIGHT: 0x27, KEY_DOWN: 0x28,
  KEY_PRINT: 0x2C, KEY_PAUSE: 0x13, KEY_INSERT: 0x2D, KEY_DELETE: 0x2E,
  KEY_HOME: 0x24, KEY_END: 0x23, KEY_PAGE_UP: 0x21, KEY_PAGE_DOWN: 0x22,
  KEY_ADD: 0x6B, KEY_SUBTRACT: 0x6D, KEY_MULTIPLY: 0x6A,
  KEY_DIVIDE: 0x6F, KEY_DECIMAL: 0x6E, KEY_ENTER: 0x0D,
  KEY_NUM0: 0x60, KEY_NUM1: 0x61, KEY_NUM2: 0x62, KEY_NUM3: 0x63,
  KEY_NUM4: 0x64, KEY_NUM5: 0x65, KEY_NUM6: 0x66, KEY_NUM7: 0x67,
  KEY_NUM8: 0x68, KEY_NUM9: 0x69,
  KEY_CAPS_LOCK: 0x14, KEY_SCROLL_LOCK: 0x91, KEY_NUM_LOCK: 0x90,
};

const keyTableByPlatform: Record<string, KeyTable> = {
  linux: linuxKeys,
  darwin: darwinKeys,
  win32: win32Keys,
};

function getPlatformKeys(): KeyTable {
  return keyTableByPlatform[process.platform] || linuxKeys;
}

// ---------------------------------------------------------------------------
// ALL_KEYS — unique keycodes to iterate for getState()
// Per-platform because some platforms split L/R variants differently.
// ---------------------------------------------------------------------------

// Linux/macOS: KEY_ALT==KEY_LALT, KEY_CONTROL==KEY_LCONTROL, etc., so skip L variants
function buildAllKeysLinuxMac(k: KeyTable): number[] {
  return [
    k.KEY_SPACE, k.KEY_ESCAPE, k.KEY_TAB,
    k.KEY_ALT, k.KEY_RALT, k.KEY_CONTROL, k.KEY_RCONTROL,
    k.KEY_SHIFT, k.KEY_RSHIFT, k.KEY_SYSTEM, k.KEY_RSYSTEM,
    k.KEY_F1, k.KEY_F2, k.KEY_F3, k.KEY_F4, k.KEY_F5, k.KEY_F6,
    k.KEY_F7, k.KEY_F8, k.KEY_F9, k.KEY_F10, k.KEY_F11, k.KEY_F12,
    k.KEY_0, k.KEY_1, k.KEY_2, k.KEY_3, k.KEY_4, k.KEY_5, k.KEY_6, k.KEY_7, k.KEY_8, k.KEY_9,
    k.KEY_A, k.KEY_B, k.KEY_C, k.KEY_D, k.KEY_E, k.KEY_F, k.KEY_G,
    k.KEY_H, k.KEY_I, k.KEY_J, k.KEY_K, k.KEY_L, k.KEY_M, k.KEY_N,
    k.KEY_O, k.KEY_P, k.KEY_Q, k.KEY_R, k.KEY_S, k.KEY_T, k.KEY_U,
    k.KEY_V, k.KEY_W, k.KEY_X, k.KEY_Y, k.KEY_Z,
    k.KEY_GRAVE, k.KEY_MINUS, k.KEY_EQUAL, k.KEY_BACKSPACE,
    k.KEY_LBRACKET, k.KEY_RBRACKET, k.KEY_BACKSLASH,
    k.KEY_SEMICOLON, k.KEY_QUOTE, k.KEY_RETURN,
    k.KEY_COMMA, k.KEY_PERIOD, k.KEY_SLASH,
    k.KEY_LEFT, k.KEY_UP, k.KEY_RIGHT, k.KEY_DOWN,
    k.KEY_PRINT, k.KEY_PAUSE, k.KEY_INSERT, k.KEY_DELETE,
    k.KEY_HOME, k.KEY_END, k.KEY_PAGE_UP, k.KEY_PAGE_DOWN,
    k.KEY_ADD, k.KEY_SUBTRACT, k.KEY_MULTIPLY, k.KEY_DIVIDE, k.KEY_DECIMAL, k.KEY_ENTER,
    k.KEY_NUM0, k.KEY_NUM1, k.KEY_NUM2, k.KEY_NUM3, k.KEY_NUM4,
    k.KEY_NUM5, k.KEY_NUM6, k.KEY_NUM7, k.KEY_NUM8, k.KEY_NUM9,
    k.KEY_CAPS_LOCK, k.KEY_SCROLL_LOCK, k.KEY_NUM_LOCK,
  ];
}

// Windows: KEY_ALT!=KEY_LALT, KEY_SHIFT!=KEY_LSHIFT, so include both L and R
function buildAllKeysWindows(k: KeyTable): number[] {
  return [
    k.KEY_SPACE, k.KEY_ESCAPE, k.KEY_TAB,
    k.KEY_ALT, k.KEY_LALT, k.KEY_RALT, k.KEY_CONTROL, k.KEY_LCONTROL, k.KEY_RCONTROL,
    k.KEY_SHIFT, k.KEY_LSHIFT, k.KEY_RSHIFT, k.KEY_SYSTEM, k.KEY_RSYSTEM,
    k.KEY_F1, k.KEY_F2, k.KEY_F3, k.KEY_F4, k.KEY_F5, k.KEY_F6,
    k.KEY_F7, k.KEY_F8, k.KEY_F9, k.KEY_F10, k.KEY_F11, k.KEY_F12,
    k.KEY_0, k.KEY_1, k.KEY_2, k.KEY_3, k.KEY_4, k.KEY_5, k.KEY_6, k.KEY_7, k.KEY_8, k.KEY_9,
    k.KEY_A, k.KEY_B, k.KEY_C, k.KEY_D, k.KEY_E, k.KEY_F, k.KEY_G,
    k.KEY_H, k.KEY_I, k.KEY_J, k.KEY_K, k.KEY_L, k.KEY_M, k.KEY_N,
    k.KEY_O, k.KEY_P, k.KEY_Q, k.KEY_R, k.KEY_S, k.KEY_T, k.KEY_U,
    k.KEY_V, k.KEY_W, k.KEY_X, k.KEY_Y, k.KEY_Z,
    k.KEY_GRAVE, k.KEY_MINUS, k.KEY_EQUAL, k.KEY_BACKSPACE,
    k.KEY_LBRACKET, k.KEY_RBRACKET, k.KEY_BACKSLASH,
    k.KEY_SEMICOLON, k.KEY_QUOTE, k.KEY_RETURN,
    k.KEY_COMMA, k.KEY_PERIOD, k.KEY_SLASH,
    k.KEY_LEFT, k.KEY_UP, k.KEY_RIGHT, k.KEY_DOWN,
    k.KEY_PRINT, k.KEY_PAUSE, k.KEY_INSERT, k.KEY_DELETE,
    k.KEY_HOME, k.KEY_END, k.KEY_PAGE_UP, k.KEY_PAGE_DOWN,
    k.KEY_ADD, k.KEY_SUBTRACT, k.KEY_MULTIPLY, k.KEY_DIVIDE, k.KEY_DECIMAL, k.KEY_ENTER,
    k.KEY_NUM0, k.KEY_NUM1, k.KEY_NUM2, k.KEY_NUM3, k.KEY_NUM4,
    k.KEY_NUM5, k.KEY_NUM6, k.KEY_NUM7, k.KEY_NUM8, k.KEY_NUM9,
    k.KEY_CAPS_LOCK, k.KEY_SCROLL_LOCK, k.KEY_NUM_LOCK,
  ];
}

export function getAllKeys(): number[] {
  const k = getPlatformKeys();
  if (process.platform === "win32") return buildAllKeysWindows(k);
  return buildAllKeysLinuxMac(k);
}

// ---------------------------------------------------------------------------
// Key name -> keycode mapping (for keyboard compile)
// The mapping structure is identical across platforms; only the values differ.
// ---------------------------------------------------------------------------

let _keyNames: Record<string, number> | null = null;

export function getKeyNames(): Record<string, number> {
  if (_keyNames) return _keyNames;
  const k = getPlatformKeys();
  _keyNames = {
    " ": k.KEY_SPACE, "SPACE": k.KEY_SPACE, "SPC": k.KEY_SPACE,
    "ESCAPE": k.KEY_ESCAPE, "ESC": k.KEY_ESCAPE,
    "TAB": k.KEY_TAB,
    "ALT": k.KEY_ALT, "LALT": k.KEY_LALT, "RALT": k.KEY_RALT,
    "CONTROL": k.KEY_CONTROL, "LCONTROL": k.KEY_LCONTROL, "RCONTROL": k.KEY_RCONTROL,
    "CTRL": k.KEY_CONTROL, "LCTRL": k.KEY_LCONTROL, "RCTRL": k.KEY_RCONTROL,
    "SHIFT": k.KEY_SHIFT, "LSHIFT": k.KEY_LSHIFT, "RSHIFT": k.KEY_RSHIFT,
    "SYSTEM": k.KEY_SYSTEM, "LSYSTEM": k.KEY_LSYSTEM, "RSYSTEM": k.KEY_RSYSTEM,
    "F1": k.KEY_F1, "F2": k.KEY_F2, "F3": k.KEY_F3, "F4": k.KEY_F4,
    "F5": k.KEY_F5, "F6": k.KEY_F6, "F7": k.KEY_F7, "F8": k.KEY_F8,
    "F9": k.KEY_F9, "F10": k.KEY_F10, "F11": k.KEY_F11, "F12": k.KEY_F12,
    "0": k.KEY_0, "1": k.KEY_1, "2": k.KEY_2, "3": k.KEY_3,
    "4": k.KEY_4, "5": k.KEY_5, "6": k.KEY_6, "7": k.KEY_7,
    "8": k.KEY_8, "9": k.KEY_9,
    "A": k.KEY_A, "B": k.KEY_B, "C": k.KEY_C, "D": k.KEY_D,
    "E": k.KEY_E, "F": k.KEY_F, "G": k.KEY_G, "H": k.KEY_H,
    "I": k.KEY_I, "J": k.KEY_J, "K": k.KEY_K, "L": k.KEY_L,
    "M": k.KEY_M, "N": k.KEY_N, "O": k.KEY_O, "P": k.KEY_P,
    "Q": k.KEY_Q, "R": k.KEY_R, "S": k.KEY_S, "T": k.KEY_T,
    "U": k.KEY_U, "V": k.KEY_V, "W": k.KEY_W, "X": k.KEY_X,
    "Y": k.KEY_Y, "Z": k.KEY_Z,
    "`": k.KEY_GRAVE, "-": k.KEY_MINUS, "=": k.KEY_EQUAL,
    "<": k.KEY_BACKSPACE, "[": k.KEY_LBRACKET, "]": k.KEY_RBRACKET,
    "\\": k.KEY_BACKSLASH, ";": k.KEY_SEMICOLON, "'": k.KEY_QUOTE,
    "~": k.KEY_RETURN, ",": k.KEY_COMMA, ".": k.KEY_PERIOD, "/": k.KEY_SLASH,
    "GRAVE": k.KEY_GRAVE, "MINUS": k.KEY_MINUS, "EQUAL": k.KEY_EQUAL,
    "BACKSPACE": k.KEY_BACKSPACE, "BS": k.KEY_BACKSPACE,
    "LBRACKET": k.KEY_LBRACKET, "RBRACKET": k.KEY_RBRACKET,
    "BACKSLASH": k.KEY_BACKSLASH, "SEMICOLON": k.KEY_SEMICOLON,
    "QUOTE": k.KEY_QUOTE, "RETURN": k.KEY_RETURN,
    "COMMA": k.KEY_COMMA, "PERIOD": k.KEY_PERIOD, "SLASH": k.KEY_SLASH,
    "LEFT": k.KEY_LEFT, "UP": k.KEY_UP, "RIGHT": k.KEY_RIGHT, "DOWN": k.KEY_DOWN,
    "PRINT": k.KEY_PRINT, "PAUSE": k.KEY_PAUSE, "BREAK": k.KEY_PAUSE,
    "INSERT": k.KEY_INSERT, "INS": k.KEY_INSERT,
    "DELETE": k.KEY_DELETE, "DEL": k.KEY_DELETE,
    "HOME": k.KEY_HOME, "END": k.KEY_END,
    "PAGEUP": k.KEY_PAGE_UP, "PGUP": k.KEY_PAGE_UP,
    "PAGEDOWN": k.KEY_PAGE_DOWN, "PGDN": k.KEY_PAGE_DOWN,
    "NUM+": k.KEY_ADD, "NUM-": k.KEY_SUBTRACT, "NUM*": k.KEY_MULTIPLY,
    "NUM/": k.KEY_DIVIDE, "NUM.": k.KEY_DECIMAL, "NUM~": k.KEY_ENTER,
    "ADD": k.KEY_ADD, "SUBTRACT": k.KEY_SUBTRACT, "MULTIPLY": k.KEY_MULTIPLY,
    "DIVIDE": k.KEY_DIVIDE, "DECIMAL": k.KEY_DECIMAL, "ENTER": k.KEY_ENTER,
    "NUM0": k.KEY_NUM0, "NUM1": k.KEY_NUM1, "NUM2": k.KEY_NUM2, "NUM3": k.KEY_NUM3,
    "NUM4": k.KEY_NUM4, "NUM5": k.KEY_NUM5, "NUM6": k.KEY_NUM6, "NUM7": k.KEY_NUM7,
    "NUM8": k.KEY_NUM8, "NUM9": k.KEY_NUM9,
    "CAPSLOCK": k.KEY_CAPS_LOCK, "SCROLLLOCK": k.KEY_SCROLL_LOCK, "NUMLOCK": k.KEY_NUM_LOCK,
  };
  return _keyNames;
}

// ---------------------------------------------------------------------------
// Button constants — platform-independent
// ---------------------------------------------------------------------------

export const BUTTON_LEFT   = 0;
export const BUTTON_MID    = 1;
export const BUTTON_MIDDLE = 1;
export const BUTTON_RIGHT  = 2;
export const BUTTON_X1     = 3;
export const BUTTON_X2     = 4;

// ---------------------------------------------------------------------------
// Memory flag constants — platform-independent
// ---------------------------------------------------------------------------

export const MEMORY_DEFAULT      = 0x0;
export const MEMORY_SKIP_ERRORS  = 0x1;
export const MEMORY_AUTO_ACCESS  = 0x2;

// ---------------------------------------------------------------------------
// Flat export of all constants (for spreading into the mRobot object)
// ---------------------------------------------------------------------------

export function getAllConstants(): Record<string, number> {
  const k = getPlatformKeys();
  return {
    ...k,
    BUTTON_LEFT, BUTTON_MID, BUTTON_MIDDLE, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2,
    MEMORY_DEFAULT, MEMORY_SKIP_ERRORS, MEMORY_AUTO_ACCESS,
  };
}
