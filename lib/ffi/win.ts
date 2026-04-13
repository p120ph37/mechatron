/**
 * Windows FFI helpers shared between subsystems.
 *
 * For keyboard/mouse we use the legacy `keybd_event` / `mouse_event` entry
 * points rather than `SendInput`.  They are documented as superseded but
 * remain functional, and avoid having to lay out the tagged-union INPUT
 * struct from JS.
 */

import { getBunFFI, type BunFFI, type Pointer } from "./bun";

interface User32 {
  keybd_event: (vk: number, scan: number, flags: number, extra: bigint) => void;
  mouse_event: (flags: number, dx: number, dy: number, data: number, extra: bigint) => void;
  GetAsyncKeyState: (vk: number) => number;
  GetCursorPos: (lpPoint: Pointer) => number;
  SetCursorPos: (x: number, y: number) => number;
  GetSystemMetrics: (nIndex: number) => number;
  MapVirtualKeyW: (uCode: number, uMapType: number) => number;
}

let _opened = false;
let _ffi: BunFFI | null = null;
let _user32: User32 | null = null;

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  const T = _ffi.FFIType;

  try {
    const lib = _ffi.dlopen<User32>("user32.dll", {
      keybd_event:      { args: [T.u8, T.u8, T.u32, T.u64], returns: T.void },
      mouse_event:      { args: [T.u32, T.i32, T.i32, T.u32, T.u64], returns: T.void },
      GetAsyncKeyState: { args: [T.i32], returns: T.i16 as any },
      GetCursorPos:     { args: [T.ptr], returns: T.i32 },
      SetCursorPos:     { args: [T.i32, T.i32], returns: T.i32 },
      GetSystemMetrics: { args: [T.i32], returns: T.i32 },
      MapVirtualKeyW:   { args: [T.u32, T.u32], returns: T.u32 },
    });
    _user32 = lib.symbols;
  } catch (_) {
    _user32 = null;
  }
}

export function user32(): User32 | null {
  tryDlopen();
  return _user32;
}

// keybd_event flags
export const KEYEVENTF_KEYUP = 0x0002;

// mouse_event flags
export const MOUSEEVENTF_LEFTDOWN   = 0x0002;
export const MOUSEEVENTF_LEFTUP     = 0x0004;
export const MOUSEEVENTF_RIGHTDOWN  = 0x0008;
export const MOUSEEVENTF_RIGHTUP    = 0x0010;
export const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
export const MOUSEEVENTF_MIDDLEUP   = 0x0040;
export const MOUSEEVENTF_XDOWN      = 0x0080;
export const MOUSEEVENTF_XUP        = 0x0100;
export const MOUSEEVENTF_WHEEL      = 0x0800;
export const MOUSEEVENTF_HWHEEL     = 0x1000;

export const XBUTTON1 = 1;
export const XBUTTON2 = 2;
export const WHEEL_DELTA = 120;

// VK codes used here
export const VK_LBUTTON  = 0x01;
export const VK_RBUTTON  = 0x02;
export const VK_MBUTTON  = 0x04;
export const VK_XBUTTON1 = 0x05;
export const VK_XBUTTON2 = 0x06;

// GetSystemMetrics index
export const SM_SWAPBUTTON = 23;

// MapVirtualKey type
export const MAPVK_VK_TO_VSC = 0;
