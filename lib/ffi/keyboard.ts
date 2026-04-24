import { injectKeysym, uinputSelected } from "./uinput";
import {
  getDisplay, isXTestAvailable, x11, xtest,
} from "./x11";
import { getBunFFI } from "./bun";
import {
  user32, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
} from "./win";
import {
  cg, cf, kCGEventSourceStateHIDSystemState, kCGHIDEventTap,
} from "./mac";

// ==================== Linux ====================

function linux_keyboard_press(keycode: number): void {
  if (uinputSelected()) {
    if (injectKeysym(keycode, true)) return;
  }
  const X = x11(); const XT = xtest(); const d = getDisplay();
  if (!X || !XT || !d) return;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return;
  XT.XTestFakeKeyEvent(d, xkeycode, 1, 0n);
  X.XSync(d, 0);
}

function linux_keyboard_release(keycode: number): void {
  if (uinputSelected()) {
    if (injectKeysym(keycode, false)) return;
  }
  const X = x11(); const XT = xtest(); const d = getDisplay();
  if (!X || !XT || !d) return;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return;
  XT.XTestFakeKeyEvent(d, xkeycode, 0, 0n);
  X.XSync(d, 0);
}

function linux_keyboard_getKeyState(keycode: number): boolean {
  const X = x11(); const F = getBunFFI(); const d = getDisplay();
  if (!X || !F || !d) return false;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return false;
  const keys = new Uint8Array(32);
  X.XQueryKeymap(d, F.ptr(keys));
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

// Signal unavailability to the backend resolver when the required native
// libraries cannot be loaded on this platform.
if (platform === "linux" && !isXTestAvailable() && !uinputSelected()) {
  throw new Error("ffi/keyboard: requires libXtst or uinput on Linux");
}
