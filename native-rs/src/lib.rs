mod x11;
mod keys;
mod timer;
mod keyboard;
mod mouse;
mod clipboard;
mod screen;
mod window;
mod process;
mod memory;

use napi_derive::napi;

// Version strings exported as functions (napi-rs v2 can't export String constants)
#[napi(js_name = "ROBOT_VERSION_STR")]
pub fn robot_version_str() -> String { "2.2.0 (0.0.0)".to_string() }

#[napi(js_name = "ADDON_VERSION_STR")]
pub fn addon_version_str() -> String { "0.0.0".to_string() }

// Numeric constants (napi-rs v2 exports const by Rust identifier name)
#[napi] pub const ROBOT_VERSION: u32 = 0x020200;
#[napi] pub const ADDON_VERSION: u32 = 0x000000;

// Key constants (Linux X11 keysym values)
#[napi] pub const KEY_SPACE: u32 = 0x0020;
#[napi] pub const KEY_ESCAPE: u32 = 0xFF1B;
#[napi] pub const KEY_TAB: u32 = 0xFF09;
#[napi] pub const KEY_ALT: u32 = 0xFFE9;
#[napi] pub const KEY_LALT: u32 = 0xFFE9;
#[napi] pub const KEY_RALT: u32 = 0xFFEA;
#[napi] pub const KEY_CONTROL: u32 = 0xFFE3;
#[napi] pub const KEY_LCONTROL: u32 = 0xFFE3;
#[napi] pub const KEY_RCONTROL: u32 = 0xFFE4;
#[napi] pub const KEY_SHIFT: u32 = 0xFFE1;
#[napi] pub const KEY_LSHIFT: u32 = 0xFFE1;
#[napi] pub const KEY_RSHIFT: u32 = 0xFFE2;
#[napi] pub const KEY_SYSTEM: u32 = 0xFFEB;
#[napi] pub const KEY_LSYSTEM: u32 = 0xFFEB;
#[napi] pub const KEY_RSYSTEM: u32 = 0xFFEC;
#[napi] pub const KEY_F1: u32 = 0xFFBE;
#[napi] pub const KEY_F2: u32 = 0xFFBF;
#[napi] pub const KEY_F3: u32 = 0xFFC0;
#[napi] pub const KEY_F4: u32 = 0xFFC1;
#[napi] pub const KEY_F5: u32 = 0xFFC2;
#[napi] pub const KEY_F6: u32 = 0xFFC3;
#[napi] pub const KEY_F7: u32 = 0xFFC4;
#[napi] pub const KEY_F8: u32 = 0xFFC5;
#[napi] pub const KEY_F9: u32 = 0xFFC6;
#[napi] pub const KEY_F10: u32 = 0xFFC7;
#[napi] pub const KEY_F11: u32 = 0xFFC8;
#[napi] pub const KEY_F12: u32 = 0xFFC9;
#[napi] pub const KEY_0: u32 = 0x0030;
#[napi] pub const KEY_1: u32 = 0x0031;
#[napi] pub const KEY_2: u32 = 0x0032;
#[napi] pub const KEY_3: u32 = 0x0033;
#[napi] pub const KEY_4: u32 = 0x0034;
#[napi] pub const KEY_5: u32 = 0x0035;
#[napi] pub const KEY_6: u32 = 0x0036;
#[napi] pub const KEY_7: u32 = 0x0037;
#[napi] pub const KEY_8: u32 = 0x0038;
#[napi] pub const KEY_9: u32 = 0x0039;
#[napi] pub const KEY_A: u32 = 0x0061;
#[napi] pub const KEY_B: u32 = 0x0062;
#[napi] pub const KEY_C: u32 = 0x0063;
#[napi] pub const KEY_D: u32 = 0x0064;
#[napi] pub const KEY_E: u32 = 0x0065;
#[napi] pub const KEY_F: u32 = 0x0066;
#[napi] pub const KEY_G: u32 = 0x0067;
#[napi] pub const KEY_H: u32 = 0x0068;
#[napi] pub const KEY_I: u32 = 0x0069;
#[napi] pub const KEY_J: u32 = 0x006A;
#[napi] pub const KEY_K: u32 = 0x006B;
#[napi] pub const KEY_L: u32 = 0x006C;
#[napi] pub const KEY_M: u32 = 0x006D;
#[napi] pub const KEY_N: u32 = 0x006E;
#[napi] pub const KEY_O: u32 = 0x006F;
#[napi] pub const KEY_P: u32 = 0x0070;
#[napi] pub const KEY_Q: u32 = 0x0071;
#[napi] pub const KEY_R: u32 = 0x0072;
#[napi] pub const KEY_S: u32 = 0x0073;
#[napi] pub const KEY_T: u32 = 0x0074;
#[napi] pub const KEY_U: u32 = 0x0075;
#[napi] pub const KEY_V: u32 = 0x0076;
#[napi] pub const KEY_W: u32 = 0x0077;
#[napi] pub const KEY_X: u32 = 0x0078;
#[napi] pub const KEY_Y: u32 = 0x0079;
#[napi] pub const KEY_Z: u32 = 0x007A;
#[napi] pub const KEY_GRAVE: u32 = 0x0060;
#[napi] pub const KEY_MINUS: u32 = 0x002D;
#[napi] pub const KEY_EQUAL: u32 = 0x003D;
#[napi] pub const KEY_BACKSPACE: u32 = 0xFF08;
#[napi] pub const KEY_LBRACKET: u32 = 0x005B;
#[napi] pub const KEY_RBRACKET: u32 = 0x005D;
#[napi] pub const KEY_BACKSLASH: u32 = 0x005C;
#[napi] pub const KEY_SEMICOLON: u32 = 0x003B;
#[napi] pub const KEY_QUOTE: u32 = 0x0027;
#[napi] pub const KEY_RETURN: u32 = 0xFF0D;
#[napi] pub const KEY_COMMA: u32 = 0x002C;
#[napi] pub const KEY_PERIOD: u32 = 0x002E;
#[napi] pub const KEY_SLASH: u32 = 0x002F;
#[napi] pub const KEY_LEFT: u32 = 0xFF51;
#[napi] pub const KEY_UP: u32 = 0xFF52;
#[napi] pub const KEY_RIGHT: u32 = 0xFF53;
#[napi] pub const KEY_DOWN: u32 = 0xFF54;
#[napi] pub const KEY_PRINT: u32 = 0xFF61;
#[napi] pub const KEY_PAUSE: u32 = 0xFF13;
#[napi] pub const KEY_INSERT: u32 = 0xFF63;
#[napi] pub const KEY_DELETE: u32 = 0xFFFF;
#[napi] pub const KEY_HOME: u32 = 0xFF50;
#[napi] pub const KEY_END: u32 = 0xFF57;
#[napi] pub const KEY_PAGE_UP: u32 = 0xFF55;
#[napi] pub const KEY_PAGE_DOWN: u32 = 0xFF56;
#[napi] pub const KEY_ADD: u32 = 0xFFAB;
#[napi] pub const KEY_SUBTRACT: u32 = 0xFFAD;
#[napi] pub const KEY_MULTIPLY: u32 = 0xFFAA;
#[napi] pub const KEY_DIVIDE: u32 = 0xFFAF;
#[napi] pub const KEY_DECIMAL: u32 = 0xFFAE;
#[napi] pub const KEY_ENTER: u32 = 0xFF8D;
#[napi] pub const KEY_NUM0: u32 = 0xFFB0;
#[napi] pub const KEY_NUM1: u32 = 0xFFB1;
#[napi] pub const KEY_NUM2: u32 = 0xFFB2;
#[napi] pub const KEY_NUM3: u32 = 0xFFB3;
#[napi] pub const KEY_NUM4: u32 = 0xFFB4;
#[napi] pub const KEY_NUM5: u32 = 0xFFB5;
#[napi] pub const KEY_NUM6: u32 = 0xFFB6;
#[napi] pub const KEY_NUM7: u32 = 0xFFB7;
#[napi] pub const KEY_NUM8: u32 = 0xFFB8;
#[napi] pub const KEY_NUM9: u32 = 0xFFB9;
#[napi] pub const KEY_CAPS_LOCK: u32 = 0xFFE5;
#[napi] pub const KEY_SCROLL_LOCK: u32 = 0xFF14;
#[napi] pub const KEY_NUM_LOCK: u32 = 0xFF7F;

// Button constants
#[napi] pub const BUTTON_LEFT: u32 = 0;
#[napi] pub const BUTTON_MID: u32 = 1;
#[napi] pub const BUTTON_MIDDLE: u32 = 1;
#[napi] pub const BUTTON_RIGHT: u32 = 2;
#[napi] pub const BUTTON_X1: u32 = 3;
#[napi] pub const BUTTON_X2: u32 = 4;

// Memory flag constants
#[napi] pub const MEMORY_DEFAULT: u32 = 0x0;
#[napi] pub const MEMORY_SKIP_ERRORS: u32 = 0x1;
#[napi] pub const MEMORY_AUTO_ACCESS: u32 = 0x2;
