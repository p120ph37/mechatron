/**
 * Pure-JS Bun FFI keyboard backend.
 *
 * Linux: dlopens libX11.so.6 + libXtst.so.6 directly.
 * Windows: dlopens user32.dll directly.
 * macOS: dlopens CoreGraphics.framework; uses CGEventCreateKeyboardEvent +
 * CGEventPost to inject synthetic key events, and CGEventSourceKeyState
 * for read-back.
 *
 * Exports the same property names as the napi `keyboard_*` symbols so the
 * loader's consumers (`lib/keyboard/Keyboard.ts`) work unchanged.
 */

import { ffi, getDisplay, isXTestAvailable, x11, xtest, True, False, CurrentTime } from "./x11";
import {
  user32, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
} from "./win";
import {
  cg, cf, kCGEventSourceStateHIDSystemState, kCGHIDEventTap,
} from "./mac";
import { injectKeysym, uinputSelected } from "./uinput";
import {
  xprotoSelected, xprotoKeyPress, xprotoKeyRelease,
} from "./xproto";

// ==================== Linux ====================

function linux_keyboard_press(keycode: number): void | Promise<void> {
  if (xprotoSelected()) return xprotoKeyPress(keycode);
  if (uinputSelected()) {
    if (injectKeysym(keycode, true)) return;
  }
  if (!isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  const xkeycode = X.XKeysymToKeycode(display, BigInt(keycode));
  T.XTestFakeKeyEvent(display, xkeycode, True, CurrentTime);
  X.XSync(display, False);
}

function linux_keyboard_release(keycode: number): void | Promise<void> {
  if (xprotoSelected()) return xprotoKeyRelease(keycode);
  if (uinputSelected()) {
    if (injectKeysym(keycode, false)) return;
  }
  if (!isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  const xkeycode = X.XKeysymToKeycode(display, BigInt(keycode));
  T.XTestFakeKeyEvent(display, xkeycode, False, CurrentTime);
  X.XSync(display, False);
}

function linux_keyboard_getKeyState(keycode: number): boolean {
  if (!isXTestAvailable()) return false;
  const X = x11()!;
  const display = getDisplay();
  const keys = new Uint8Array(32);
  X.XQueryKeymap(display, ffi()!.ptr(keys));
  const xkeycode = X.XKeysymToKeycode(display, BigInt(keycode));
  return (keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}

// ==================== Windows ====================

function win_keyboard_press(keycode: number): void {
  const u = user32(); if (!u) return;
  const scan = u.MapVirtualKeyW(keycode >>> 0, MAPVK_VK_TO_VSC) & 0xff;
  u.keybd_event(keycode & 0xff, scan, 0, 0n);
}

function win_keyboard_release(keycode: number): void {
  const u = user32(); if (!u) return;
  const scan = u.MapVirtualKeyW(keycode >>> 0, MAPVK_VK_TO_VSC) & 0xff;
  u.keybd_event(keycode & 0xff, scan, KEYEVENTF_KEYUP, 0n);
}

function win_keyboard_getKeyState(keycode: number): boolean {
  const u = user32(); if (!u) return false;
  return (u.GetAsyncKeyState(keycode) & 0x8000) !== 0;
}

// ==================== macOS ====================

// CGEventSourceRef is expensive to create — cache one per process.
let _macSource: ReturnType<NonNullable<ReturnType<typeof cg>>["CGEventSourceCreate"]> | null = null;
function macSource() {
  if (_macSource !== null) return _macSource;
  const C = cg();
  if (!C) return null;
  _macSource = C.CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  return _macSource;
}

function mac_keyboard_press(keycode: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const src = macSource();
  const evt = C.CGEventCreateKeyboardEvent(src, keycode & 0xFFFF, 1);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_keyboard_release(keycode: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const src = macSource();
  const evt = C.CGEventCreateKeyboardEvent(src, keycode & 0xFFFF, 0);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_keyboard_getKeyState(keycode: number): boolean {
  const C = cg();
  if (!C) return false;
  return C.CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, keycode & 0xFFFF) !== 0;
}

// ==================== Dispatch ====================

const platform = process.platform;

export const keyboard_press =
  platform === "linux"  ? linux_keyboard_press :
  platform === "win32"  ? win_keyboard_press :
  platform === "darwin" ? mac_keyboard_press :
                          (_k: number) => {};

export const keyboard_release =
  platform === "linux"  ? linux_keyboard_release :
  platform === "win32"  ? win_keyboard_release :
  platform === "darwin" ? mac_keyboard_release :
                          (_k: number) => {};

export const keyboard_getKeyState =
  platform === "linux"  ? linux_keyboard_getKeyState :
  platform === "win32"  ? win_keyboard_getKeyState :
  platform === "darwin" ? mac_keyboard_getKeyState :
                          (_k: number) => false;
