#[cfg(target_os = "linux")]
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

// ---------------------------------------------------------------------------
// Platform-specific key constants
// ---------------------------------------------------------------------------

// KEY_SPACE
#[cfg(target_os = "linux")]   #[napi] pub const KEY_SPACE: u32 = 0x0020;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SPACE: u32 = 0x31;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SPACE: u32 = 0x20;

// KEY_ESCAPE
#[cfg(target_os = "linux")]   #[napi] pub const KEY_ESCAPE: u32 = 0xFF1B;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_ESCAPE: u32 = 0x35;
#[cfg(target_os = "windows")] #[napi] pub const KEY_ESCAPE: u32 = 0x1B;

// KEY_TAB
#[cfg(target_os = "linux")]   #[napi] pub const KEY_TAB: u32 = 0xFF09;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_TAB: u32 = 0x30;
#[cfg(target_os = "windows")] #[napi] pub const KEY_TAB: u32 = 0x09;

// KEY_ALT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_ALT: u32 = 0xFFE9;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_ALT: u32 = 0x3A;
#[cfg(target_os = "windows")] #[napi] pub const KEY_ALT: u32 = 0x12;

// KEY_LALT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_LALT: u32 = 0xFFE9;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LALT: u32 = 0x3A;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LALT: u32 = 0xA4;

// KEY_RALT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_RALT: u32 = 0xFFEA;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RALT: u32 = 0x3D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RALT: u32 = 0xA5;

// KEY_CONTROL
#[cfg(target_os = "linux")]   #[napi] pub const KEY_CONTROL: u32 = 0xFFE3;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_CONTROL: u32 = 0x3B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_CONTROL: u32 = 0x11;

// KEY_LCONTROL
#[cfg(target_os = "linux")]   #[napi] pub const KEY_LCONTROL: u32 = 0xFFE3;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LCONTROL: u32 = 0x3B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LCONTROL: u32 = 0xA2;

// KEY_RCONTROL
#[cfg(target_os = "linux")]   #[napi] pub const KEY_RCONTROL: u32 = 0xFFE4;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RCONTROL: u32 = 0x3E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RCONTROL: u32 = 0xA3;

// KEY_SHIFT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_SHIFT: u32 = 0xFFE1;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SHIFT: u32 = 0x38;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SHIFT: u32 = 0x10;

// KEY_LSHIFT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_LSHIFT: u32 = 0xFFE1;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LSHIFT: u32 = 0x38;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LSHIFT: u32 = 0xA0;

// KEY_RSHIFT
#[cfg(target_os = "linux")]   #[napi] pub const KEY_RSHIFT: u32 = 0xFFE2;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RSHIFT: u32 = 0x3C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RSHIFT: u32 = 0xA1;

// KEY_SYSTEM
#[cfg(target_os = "linux")]   #[napi] pub const KEY_SYSTEM: u32 = 0xFFEB;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SYSTEM: u32 = 0x37;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SYSTEM: u32 = 0x5B;

// KEY_LSYSTEM
#[cfg(target_os = "linux")]   #[napi] pub const KEY_LSYSTEM: u32 = 0xFFEB;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LSYSTEM: u32 = 0x37;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LSYSTEM: u32 = 0x5B;

// KEY_RSYSTEM
#[cfg(target_os = "linux")]   #[napi] pub const KEY_RSYSTEM: u32 = 0xFFEC;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RSYSTEM: u32 = 0x36;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RSYSTEM: u32 = 0x5C;

// Function keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_F1: u32 = 0xFFBE;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F1: u32 = 0x7A;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F1: u32 = 0x70;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F2: u32 = 0xFFBF;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F2: u32 = 0x78;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F2: u32 = 0x71;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F3: u32 = 0xFFC0;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F3: u32 = 0x63;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F3: u32 = 0x72;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F4: u32 = 0xFFC1;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F4: u32 = 0x76;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F4: u32 = 0x73;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F5: u32 = 0xFFC2;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F5: u32 = 0x60;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F5: u32 = 0x74;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F6: u32 = 0xFFC3;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F6: u32 = 0x61;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F6: u32 = 0x75;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F7: u32 = 0xFFC4;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F7: u32 = 0x62;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F7: u32 = 0x76;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F8: u32 = 0xFFC5;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F8: u32 = 0x64;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F8: u32 = 0x77;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F9: u32 = 0xFFC6;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F9: u32 = 0x65;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F9: u32 = 0x78;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F10: u32 = 0xFFC7;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F10: u32 = 0x6D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F10: u32 = 0x79;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F11: u32 = 0xFFC8;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F11: u32 = 0x67;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F11: u32 = 0x7A;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F12: u32 = 0xFFC9;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F12: u32 = 0x6F;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F12: u32 = 0x7B;

// Number keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_0: u32 = 0x0030;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_0: u32 = 0x1D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_0: u32 = 0x30;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_1: u32 = 0x0031;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_1: u32 = 0x12;
#[cfg(target_os = "windows")] #[napi] pub const KEY_1: u32 = 0x31;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_2: u32 = 0x0032;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_2: u32 = 0x13;
#[cfg(target_os = "windows")] #[napi] pub const KEY_2: u32 = 0x32;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_3: u32 = 0x0033;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_3: u32 = 0x14;
#[cfg(target_os = "windows")] #[napi] pub const KEY_3: u32 = 0x33;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_4: u32 = 0x0034;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_4: u32 = 0x15;
#[cfg(target_os = "windows")] #[napi] pub const KEY_4: u32 = 0x34;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_5: u32 = 0x0035;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_5: u32 = 0x17;
#[cfg(target_os = "windows")] #[napi] pub const KEY_5: u32 = 0x35;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_6: u32 = 0x0036;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_6: u32 = 0x16;
#[cfg(target_os = "windows")] #[napi] pub const KEY_6: u32 = 0x36;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_7: u32 = 0x0037;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_7: u32 = 0x1A;
#[cfg(target_os = "windows")] #[napi] pub const KEY_7: u32 = 0x37;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_8: u32 = 0x0038;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_8: u32 = 0x1C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_8: u32 = 0x38;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_9: u32 = 0x0039;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_9: u32 = 0x19;
#[cfg(target_os = "windows")] #[napi] pub const KEY_9: u32 = 0x39;

// Letter keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_A: u32 = 0x0061;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_A: u32 = 0x00;
#[cfg(target_os = "windows")] #[napi] pub const KEY_A: u32 = 0x41;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_B: u32 = 0x0062;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_B: u32 = 0x0B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_B: u32 = 0x42;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_C: u32 = 0x0063;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_C: u32 = 0x08;
#[cfg(target_os = "windows")] #[napi] pub const KEY_C: u32 = 0x43;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_D: u32 = 0x0064;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_D: u32 = 0x02;
#[cfg(target_os = "windows")] #[napi] pub const KEY_D: u32 = 0x44;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_E: u32 = 0x0065;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_E: u32 = 0x0E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_E: u32 = 0x45;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_F: u32 = 0x0066;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_F: u32 = 0x03;
#[cfg(target_os = "windows")] #[napi] pub const KEY_F: u32 = 0x46;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_G: u32 = 0x0067;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_G: u32 = 0x05;
#[cfg(target_os = "windows")] #[napi] pub const KEY_G: u32 = 0x47;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_H: u32 = 0x0068;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_H: u32 = 0x04;
#[cfg(target_os = "windows")] #[napi] pub const KEY_H: u32 = 0x48;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_I: u32 = 0x0069;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_I: u32 = 0x22;
#[cfg(target_os = "windows")] #[napi] pub const KEY_I: u32 = 0x49;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_J: u32 = 0x006A;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_J: u32 = 0x26;
#[cfg(target_os = "windows")] #[napi] pub const KEY_J: u32 = 0x4A;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_K: u32 = 0x006B;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_K: u32 = 0x28;
#[cfg(target_os = "windows")] #[napi] pub const KEY_K: u32 = 0x4B;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_L: u32 = 0x006C;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_L: u32 = 0x25;
#[cfg(target_os = "windows")] #[napi] pub const KEY_L: u32 = 0x4C;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_M: u32 = 0x006D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_M: u32 = 0x2E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_M: u32 = 0x4D;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_N: u32 = 0x006E;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_N: u32 = 0x2D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_N: u32 = 0x4E;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_O: u32 = 0x006F;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_O: u32 = 0x1F;
#[cfg(target_os = "windows")] #[napi] pub const KEY_O: u32 = 0x4F;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_P: u32 = 0x0070;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_P: u32 = 0x23;
#[cfg(target_os = "windows")] #[napi] pub const KEY_P: u32 = 0x50;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_Q: u32 = 0x0071;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_Q: u32 = 0x0C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_Q: u32 = 0x51;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_R: u32 = 0x0072;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_R: u32 = 0x0F;
#[cfg(target_os = "windows")] #[napi] pub const KEY_R: u32 = 0x52;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_S: u32 = 0x0073;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_S: u32 = 0x01;
#[cfg(target_os = "windows")] #[napi] pub const KEY_S: u32 = 0x53;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_T: u32 = 0x0074;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_T: u32 = 0x11;
#[cfg(target_os = "windows")] #[napi] pub const KEY_T: u32 = 0x54;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_U: u32 = 0x0075;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_U: u32 = 0x20;
#[cfg(target_os = "windows")] #[napi] pub const KEY_U: u32 = 0x55;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_V: u32 = 0x0076;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_V: u32 = 0x09;
#[cfg(target_os = "windows")] #[napi] pub const KEY_V: u32 = 0x56;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_W: u32 = 0x0077;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_W: u32 = 0x0D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_W: u32 = 0x57;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_X: u32 = 0x0078;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_X: u32 = 0x07;
#[cfg(target_os = "windows")] #[napi] pub const KEY_X: u32 = 0x58;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_Y: u32 = 0x0079;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_Y: u32 = 0x10;
#[cfg(target_os = "windows")] #[napi] pub const KEY_Y: u32 = 0x59;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_Z: u32 = 0x007A;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_Z: u32 = 0x06;
#[cfg(target_os = "windows")] #[napi] pub const KEY_Z: u32 = 0x5A;

// Punctuation and symbol keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_GRAVE: u32 = 0x0060;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_GRAVE: u32 = 0x32;
#[cfg(target_os = "windows")] #[napi] pub const KEY_GRAVE: u32 = 0xC0;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_MINUS: u32 = 0x002D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_MINUS: u32 = 0x1B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_MINUS: u32 = 0xBD;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_EQUAL: u32 = 0x003D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_EQUAL: u32 = 0x18;
#[cfg(target_os = "windows")] #[napi] pub const KEY_EQUAL: u32 = 0xBB;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_BACKSPACE: u32 = 0xFF08;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_BACKSPACE: u32 = 0x33;
#[cfg(target_os = "windows")] #[napi] pub const KEY_BACKSPACE: u32 = 0x08;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_LBRACKET: u32 = 0x005B;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LBRACKET: u32 = 0x21;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LBRACKET: u32 = 0xDB;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_RBRACKET: u32 = 0x005D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RBRACKET: u32 = 0x1E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RBRACKET: u32 = 0xDD;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_BACKSLASH: u32 = 0x005C;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_BACKSLASH: u32 = 0x2A;
#[cfg(target_os = "windows")] #[napi] pub const KEY_BACKSLASH: u32 = 0xDC;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_SEMICOLON: u32 = 0x003B;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SEMICOLON: u32 = 0x29;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SEMICOLON: u32 = 0xBA;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_QUOTE: u32 = 0x0027;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_QUOTE: u32 = 0x27;
#[cfg(target_os = "windows")] #[napi] pub const KEY_QUOTE: u32 = 0xDE;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_RETURN: u32 = 0xFF0D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RETURN: u32 = 0x24;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RETURN: u32 = 0x0D;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_COMMA: u32 = 0x002C;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_COMMA: u32 = 0x2B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_COMMA: u32 = 0xBC;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_PERIOD: u32 = 0x002E;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_PERIOD: u32 = 0x2F;
#[cfg(target_os = "windows")] #[napi] pub const KEY_PERIOD: u32 = 0xBE;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_SLASH: u32 = 0x002F;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SLASH: u32 = 0x2C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SLASH: u32 = 0xBF;

// Arrow keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_LEFT: u32 = 0xFF51;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_LEFT: u32 = 0x7B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_LEFT: u32 = 0x25;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_UP: u32 = 0xFF52;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_UP: u32 = 0x7E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_UP: u32 = 0x26;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_RIGHT: u32 = 0xFF53;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_RIGHT: u32 = 0x7C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_RIGHT: u32 = 0x27;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_DOWN: u32 = 0xFF54;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_DOWN: u32 = 0x7D;
#[cfg(target_os = "windows")] #[napi] pub const KEY_DOWN: u32 = 0x28;

// Special keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_PRINT: u32 = 0xFF61;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_PRINT: u32 = 0x69;
#[cfg(target_os = "windows")] #[napi] pub const KEY_PRINT: u32 = 0x2C;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_PAUSE: u32 = 0xFF13;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_PAUSE: u32 = 0x71;
#[cfg(target_os = "windows")] #[napi] pub const KEY_PAUSE: u32 = 0x13;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_INSERT: u32 = 0xFF63;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_INSERT: u32 = 0x72;
#[cfg(target_os = "windows")] #[napi] pub const KEY_INSERT: u32 = 0x2D;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_DELETE: u32 = 0xFFFF;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_DELETE: u32 = 0x75;
#[cfg(target_os = "windows")] #[napi] pub const KEY_DELETE: u32 = 0x2E;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_HOME: u32 = 0xFF50;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_HOME: u32 = 0x73;
#[cfg(target_os = "windows")] #[napi] pub const KEY_HOME: u32 = 0x24;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_END: u32 = 0xFF57;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_END: u32 = 0x77;
#[cfg(target_os = "windows")] #[napi] pub const KEY_END: u32 = 0x23;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_PAGE_UP: u32 = 0xFF55;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_PAGE_UP: u32 = 0x74;
#[cfg(target_os = "windows")] #[napi] pub const KEY_PAGE_UP: u32 = 0x21;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_PAGE_DOWN: u32 = 0xFF56;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_PAGE_DOWN: u32 = 0x79;
#[cfg(target_os = "windows")] #[napi] pub const KEY_PAGE_DOWN: u32 = 0x22;

// Numpad operator keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_ADD: u32 = 0xFFAB;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_ADD: u32 = 0x45;
#[cfg(target_os = "windows")] #[napi] pub const KEY_ADD: u32 = 0x6B;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_SUBTRACT: u32 = 0xFFAD;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SUBTRACT: u32 = 0x4E;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SUBTRACT: u32 = 0x6D;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_MULTIPLY: u32 = 0xFFAA;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_MULTIPLY: u32 = 0x43;
#[cfg(target_os = "windows")] #[napi] pub const KEY_MULTIPLY: u32 = 0x6A;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_DIVIDE: u32 = 0xFFAF;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_DIVIDE: u32 = 0x4B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_DIVIDE: u32 = 0x6F;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_DECIMAL: u32 = 0xFFAE;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_DECIMAL: u32 = 0x41;
#[cfg(target_os = "windows")] #[napi] pub const KEY_DECIMAL: u32 = 0x6E;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_ENTER: u32 = 0xFF8D;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_ENTER: u32 = 0x4C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_ENTER: u32 = 0x0D;

// Numpad number keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM0: u32 = 0xFFB0;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM0: u32 = 0x52;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM0: u32 = 0x60;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM1: u32 = 0xFFB1;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM1: u32 = 0x53;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM1: u32 = 0x61;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM2: u32 = 0xFFB2;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM2: u32 = 0x54;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM2: u32 = 0x62;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM3: u32 = 0xFFB3;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM3: u32 = 0x55;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM3: u32 = 0x63;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM4: u32 = 0xFFB4;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM4: u32 = 0x56;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM4: u32 = 0x64;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM5: u32 = 0xFFB5;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM5: u32 = 0x57;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM5: u32 = 0x65;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM6: u32 = 0xFFB6;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM6: u32 = 0x58;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM6: u32 = 0x66;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM7: u32 = 0xFFB7;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM7: u32 = 0x59;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM7: u32 = 0x67;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM8: u32 = 0xFFB8;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM8: u32 = 0x5B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM8: u32 = 0x68;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM9: u32 = 0xFFB9;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM9: u32 = 0x5C;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM9: u32 = 0x69;

// Lock keys
#[cfg(target_os = "linux")]   #[napi] pub const KEY_CAPS_LOCK: u32 = 0xFFE5;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_CAPS_LOCK: u32 = 0x39;
#[cfg(target_os = "windows")] #[napi] pub const KEY_CAPS_LOCK: u32 = 0x14;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_SCROLL_LOCK: u32 = 0xFF14;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_SCROLL_LOCK: u32 = 0x6B;
#[cfg(target_os = "windows")] #[napi] pub const KEY_SCROLL_LOCK: u32 = 0x91;

#[cfg(target_os = "linux")]   #[napi] pub const KEY_NUM_LOCK: u32 = 0xFF7F;
#[cfg(target_os = "macos")]   #[napi] pub const KEY_NUM_LOCK: u32 = 0x47;
#[cfg(target_os = "windows")] #[napi] pub const KEY_NUM_LOCK: u32 = 0x90;

// ---------------------------------------------------------------------------
// Button constants (same on all platforms)
// ---------------------------------------------------------------------------
#[napi] pub const BUTTON_LEFT: u32 = 0;
#[napi] pub const BUTTON_MID: u32 = 1;
#[napi] pub const BUTTON_MIDDLE: u32 = 1;
#[napi] pub const BUTTON_RIGHT: u32 = 2;
#[napi] pub const BUTTON_X1: u32 = 3;
#[napi] pub const BUTTON_X2: u32 = 4;

// Memory flag constants (same on all platforms)
#[napi] pub const MEMORY_DEFAULT: u32 = 0x0;
#[napi] pub const MEMORY_SKIP_ERRORS: u32 = 0x1;
#[napi] pub const MEMORY_AUTO_ACCESS: u32 = 0x2;
