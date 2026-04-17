import { getXConnection } from "./xconn";
import { xprotoKeyPress, xprotoKeyRelease } from "./xproto";
import { injectKeysym, uinputSelected } from "./uinput";
import {
  user32, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
} from "./win";
import {
  cg, cf, kCGEventSourceStateHIDSystemState, kCGHIDEventTap,
} from "./mac";

// ==================== Linux ====================

function linux_keyboard_press(keycode: number): void | Promise<void> {
  if (uinputSelected()) {
    if (injectKeysym(keycode, true)) return;
  }
  return xprotoKeyPress(keycode);
}

function linux_keyboard_release(keycode: number): void | Promise<void> {
  if (uinputSelected()) {
    if (injectKeysym(keycode, false)) return;
  }
  return xprotoKeyRelease(keycode);
}

async function linux_keyboard_getKeyState(keycode: number): Promise<boolean> {
  const c = await getXConnection();
  if (!c) return false;
  const km = await c.queryKeymap();
  const xkeycode = c.keysymToKeycode(keycode);
  if (xkeycode === 0) return false;
  return (km.keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
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
