/**
 * ffi keyboard backend — synchronous worker-side implementation for
 * non-Linux platforms (macOS, Windows).
 *
 * Linux x11 lives in keyboard-x11-impl.ts (variant split mirroring napi).
 * The main-thread proxy in keyboard.ts throws on Linux so this module is
 * never loaded there.
 */

import {
  user32, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
} from "./win";
import {
  cg, cf, kCGEventSourceStateHIDSystemState, kCGHIDEventTap,
} from "./mac";

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
  if (src === null) return;
  const evt = C.CGEventCreateKeyboardEvent(src, keycode & 0xFFFF, true);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_keyboard_release(keycode: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const src = macSource();
  if (src === null) return;
  const evt = C.CGEventCreateKeyboardEvent(src, keycode & 0xFFFF, false);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_keyboard_getKeyState(keycode: number): boolean {
  const C = cg();
  if (!C) return false;
  return C.CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, keycode & 0xFFFF);
}

// ==================== Dispatch ====================

const platform = process.platform;

export const keyboard_press =
  platform === "win32"  ? win_keyboard_press :
  platform === "darwin" ? mac_keyboard_press :
                          (_k: number) => {};

export const keyboard_release =
  platform === "win32"  ? win_keyboard_release :
  platform === "darwin" ? mac_keyboard_release :
                          (_k: number) => {};

export const keyboard_getKeyState =
  platform === "win32"  ? win_keyboard_getKeyState :
  platform === "darwin" ? mac_keyboard_getKeyState :
                          (_k: number) => false;
