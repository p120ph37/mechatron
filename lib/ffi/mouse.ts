/**
 * Pure-JS Bun FFI mouse backend.
 *
 * Linux: dlopens libX11.so.6 + libXtst.so.6 directly.
 * Windows: dlopens user32.dll directly.
 * macOS: dlopens CoreGraphics.framework; uses CGEventCreateMouseEvent,
 * CGEventPost, CGWarpMouseCursorPosition, CGEventSourceButtonState, and
 * CGEventCreateScrollWheelEvent2.  `mouse_getPos` can't be implemented
 * cleanly because CGEventGetLocation returns a CGPoint by value (bun:ffi
 * can only read the x component); callers treat {0,0} as "unsupported".
 */

import {
  ffi, getDisplay, isXTestAvailable, x11, xtest, True, False, CurrentTime,
} from "./x11";
import {
  user32,
  MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
  MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
  MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
  MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP,
  MOUSEEVENTF_WHEEL, MOUSEEVENTF_HWHEEL,
  XBUTTON1, XBUTTON2, WHEEL_DELTA,
  VK_LBUTTON, VK_RBUTTON, VK_MBUTTON, VK_XBUTTON1, VK_XBUTTON2,
  SM_SWAPBUTTON,
} from "./win";
import {
  cg, cf,
  kCGEventSourceStateHIDSystemState, kCGHIDEventTap,
  kCGEventLeftMouseDown, kCGEventLeftMouseUp,
  kCGEventRightMouseDown, kCGEventRightMouseUp,
  kCGEventOtherMouseDown, kCGEventOtherMouseUp,
  kCGMouseButtonLeft, kCGMouseButtonRight, kCGMouseButtonCenter,
  kCGScrollEventUnitPixel,
} from "./mac";
import type { Pointer } from "./bun";
import {
  injectMouseButton, injectMouseMoveRel, injectScrollV, injectScrollH,
  uinputReady,
} from "./uinput";
import { getMechanism } from "../platform";

// Button constants (must match lib/mouse/constants.ts)
const BUTTON_LEFT = 0;
const BUTTON_MID = 1;
const BUTTON_RIGHT = 2;
const BUTTON_X1 = 3;
const BUTTON_X2 = 4;

// Is uinput the selected input mechanism?  See note in ffi/keyboard.ts.
function linux_useUinput(): boolean {
  return getMechanism("input") === "uinput";
}

// X11 button mask bits (from <X11/X.h>)
const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

// ==================== Linux ====================

function linux_xButton(button: number): number | null {
  switch (button) {
    case BUTTON_LEFT:  return 1;
    case BUTTON_MID:   return 2;
    case BUTTON_RIGHT: return 3;
    default: return null;
  }
}

function linux_mouse_press(button: number): void {
  if (linux_useUinput() && uinputReady()) {
    // uinput supports all five mechatron buttons (L/M/R/X1/X2); fall
    // through only on out-of-range values, which XTest will also drop.
    if (injectMouseButton(button, true)) return;
  }
  const xbtn = linux_xButton(button);
  if (xbtn === null || !isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  T.XTestFakeButtonEvent(display, xbtn, True, CurrentTime);
  X.XSync(display, False);
}

function linux_mouse_release(button: number): void {
  if (linux_useUinput() && uinputReady()) {
    if (injectMouseButton(button, false)) return;
  }
  const xbtn = linux_xButton(button);
  if (xbtn === null || !isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  T.XTestFakeButtonEvent(display, xbtn, False, CurrentTime);
  X.XSync(display, False);
}

function linux_mouse_scrollH(amount: number): void {
  if (linux_useUinput() && uinputReady()) {
    // uinput REL_HWHEEL takes discrete notches in a single write, so
    // one evdev event vs. XTest's |amount|×{press+release} pairs.
    if (injectScrollH(amount)) return;
  }
  if (!isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  const repeat = Math.abs(amount);
  const button = amount < 0 ? 6 : 7;
  for (let i = 0; i < repeat; i++) {
    T.XTestFakeButtonEvent(display, button, True, CurrentTime);
    T.XTestFakeButtonEvent(display, button, False, CurrentTime);
  }
  X.XSync(display, False);
}

function linux_mouse_scrollV(amount: number): void {
  if (linux_useUinput() && uinputReady()) {
    if (injectScrollV(amount)) return;
  }
  if (!isXTestAvailable()) return;
  const X = x11()!, T = xtest()!;
  const display = getDisplay();
  const repeat = Math.abs(amount);
  const button = amount < 0 ? 5 : 4;
  for (let i = 0; i < repeat; i++) {
    T.XTestFakeButtonEvent(display, button, True, CurrentTime);
    T.XTestFakeButtonEvent(display, button, False, CurrentTime);
  }
  X.XSync(display, False);
}

function linux_mouse_getPos(): { x: number; y: number } {
  if (!isXTestAvailable()) return { x: 0, y: 0 };
  const X = x11()!, F = ffi()!;
  const display = getDisplay();
  const screens = X.XScreenCount(display);
  const root = new BigUint64Array(1);
  const child = new BigUint64Array(1);
  const rx = new Int32Array(1);
  const ry = new Int32Array(1);
  const wx = new Int32Array(1);
  const wy = new Int32Array(1);
  const mask = new Uint32Array(1);
  for (let i = 0; i < screens; i++) {
    const r = X.XQueryPointer(
      display, X.XRootWindow(display, i),
      F.ptr(root), F.ptr(child),
      F.ptr(rx), F.ptr(ry),
      F.ptr(wx), F.ptr(wy),
      F.ptr(mask),
    );
    if (r !== 0) return { x: rx[0], y: ry[0] };
  }
  return { x: 0, y: 0 };
}

function linux_mouse_setPos(x: number, y: number): void {
  if (!isXTestAvailable()) return;
  const X = x11()!;
  const display = getDisplay();
  X.XWarpPointer(display, 0n, X.XDefaultRootWindow(display), 0, 0, 0, 0, x, y);
  X.XSync(display, False);
}

function linux_mouse_getButtonState(button: number): boolean {
  if (button === BUTTON_X1 || button === BUTTON_X2 || !isXTestAvailable()) return false;
  const X = x11()!, F = ffi()!;
  const display = getDisplay();
  const screens = X.XScreenCount(display);
  const root = new BigUint64Array(1);
  const child = new BigUint64Array(1);
  const rx = new Int32Array(1);
  const ry = new Int32Array(1);
  const wx = new Int32Array(1);
  const wy = new Int32Array(1);
  const mask = new Uint32Array(1);
  for (let i = 0; i < screens; i++) {
    const r = X.XQueryPointer(
      display, X.XRootWindow(display, i),
      F.ptr(root), F.ptr(child),
      F.ptr(rx), F.ptr(ry),
      F.ptr(wx), F.ptr(wy),
      F.ptr(mask),
    );
    if (r !== 0) {
      const m = mask[0];
      switch (button) {
        case BUTTON_LEFT:  return ((m & Button1Mask) >>> 8) !== 0;
        case BUTTON_MID:   return ((m & Button2Mask) >>> 8) !== 0;
        case BUTTON_RIGHT: return ((m & Button3Mask) >>> 8) !== 0;
        default: return false;
      }
    }
  }
  return false;
}

// ==================== Windows ====================

function win_swapped(): boolean {
  const u = user32(); if (!u) return false;
  return u.GetSystemMetrics(SM_SWAPBUTTON) !== 0;
}

function win_mouseFlags(button: number, press: boolean): { flags: number; data: number } | null {
  const swap = win_swapped();
  switch (button) {
    case BUTTON_LEFT:
      if (press) return { flags: swap ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN, data: 0 };
      else       return { flags: swap ? MOUSEEVENTF_RIGHTUP   : MOUSEEVENTF_LEFTUP,   data: 0 };
    case BUTTON_RIGHT:
      if (press) return { flags: swap ? MOUSEEVENTF_LEFTDOWN  : MOUSEEVENTF_RIGHTDOWN, data: 0 };
      else       return { flags: swap ? MOUSEEVENTF_LEFTUP    : MOUSEEVENTF_RIGHTUP,   data: 0 };
    case BUTTON_MID:
      return { flags: press ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP, data: 0 };
    case BUTTON_X1:
      return { flags: press ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP, data: XBUTTON1 };
    case BUTTON_X2:
      return { flags: press ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP, data: XBUTTON2 };
    default: return null;
  }
}

function win_mouse_press(button: number): void {
  const u = user32(); if (!u) return;
  const f = win_mouseFlags(button, true); if (!f) return;
  u.mouse_event(f.flags, 0, 0, f.data, 0n);
}

function win_mouse_release(button: number): void {
  const u = user32(); if (!u) return;
  const f = win_mouseFlags(button, false); if (!f) return;
  u.mouse_event(f.flags, 0, 0, f.data, 0n);
}

function win_mouse_scrollH(amount: number): void {
  const u = user32(); if (!u) return;
  u.mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, (amount * WHEEL_DELTA) | 0, 0n);
}

function win_mouse_scrollV(amount: number): void {
  const u = user32(); if (!u) return;
  u.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (amount * WHEEL_DELTA) | 0, 0n);
}

function win_mouse_getPos(): { x: number; y: number } {
  const u = user32(); const F = ffi();
  if (!u || !F) return { x: 0, y: 0 };
  // POINT { LONG x; LONG y; } — 8 bytes
  const buf = new Int32Array(2);
  u.GetCursorPos(F.ptr(buf));
  return { x: buf[0], y: buf[1] };
}

function win_mouse_setPos(x: number, y: number): void {
  const u = user32(); if (!u) return;
  u.SetCursorPos(x, y);
}

function win_mouse_getButtonState(button: number): boolean {
  const u = user32(); if (!u) return false;
  const swap = win_swapped();
  let vk: number;
  switch (button) {
    case BUTTON_LEFT:  vk = swap ? VK_RBUTTON : VK_LBUTTON; break;
    case BUTTON_MID:   vk = VK_MBUTTON; break;
    case BUTTON_RIGHT: vk = swap ? VK_LBUTTON : VK_RBUTTON; break;
    case BUTTON_X1:    vk = VK_XBUTTON1; break;
    case BUTTON_X2:    vk = VK_XBUTTON2; break;
    default: return false;
  }
  return (u.GetAsyncKeyState(vk) & 0x8000) !== 0;
}

// ==================== macOS ====================

function mac_cgButton(button: number): { type_down: number; type_up: number; cg_btn: number } | null {
  switch (button) {
    case BUTTON_LEFT:
      return { type_down: kCGEventLeftMouseDown,  type_up: kCGEventLeftMouseUp,  cg_btn: kCGMouseButtonLeft };
    case BUTTON_RIGHT:
      return { type_down: kCGEventRightMouseDown, type_up: kCGEventRightMouseUp, cg_btn: kCGMouseButtonRight };
    case BUTTON_MID:
      return { type_down: kCGEventOtherMouseDown, type_up: kCGEventOtherMouseUp, cg_btn: kCGMouseButtonCenter };
    case BUTTON_X1:
      return { type_down: kCGEventOtherMouseDown, type_up: kCGEventOtherMouseUp, cg_btn: 3 };
    case BUTTON_X2:
      return { type_down: kCGEventOtherMouseDown, type_up: kCGEventOtherMouseUp, cg_btn: 4 };
    default:
      return null;
  }
}

// Shared HID event source (cheaper than recreating it per call).
let _macMouseSource: Pointer = null;
function macMouseSource(): Pointer {
  if (_macMouseSource) return _macMouseSource;
  const C = cg(); if (!C) return null;
  _macMouseSource = C.CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  return _macMouseSource;
}

// Last-known cursor position.  `CGEventGetLocation` returns a CGPoint by
// value which bun:ffi can't retrieve, so we track position ourselves via
// `setPos`.  `getPos` returns the cached value.
let _macLastPos = { x: 0, y: 0 };

function mac_mouse_press(button: number): void {
  const C = cg();
  const F = cf();
  const spec = mac_cgButton(button);
  if (!C || !F || !spec) return;
  const src = macMouseSource();
  // CGPoint is passed as two f64 args (see mac.ts CGEventCreateMouseEvent
  // signature).  Posting at the tracked last position matches the napi
  // backend's behavior closely enough for HID state-source updates.
  const evt = C.CGEventCreateMouseEvent(src, spec.type_down, _macLastPos.x, _macLastPos.y, spec.cg_btn);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_release(button: number): void {
  const C = cg();
  const F = cf();
  const spec = mac_cgButton(button);
  if (!C || !F || !spec) return;
  const src = macMouseSource();
  const evt = C.CGEventCreateMouseEvent(src, spec.type_up, _macLastPos.x, _macLastPos.y, spec.cg_btn);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_scrollV(amount: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  // macOS treats positive scroll values as "up", matching robot-js semantics.
  const evt = C.CGEventCreateScrollWheelEvent2(null, kCGScrollEventUnitPixel, 1, amount | 0, 0, 0);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_scrollH(amount: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const evt = C.CGEventCreateScrollWheelEvent2(null, kCGScrollEventUnitPixel, 2, 0, amount | 0, 0);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_getPos(): { x: number; y: number } {
  // CGEventGetLocation returns CGPoint by value; bun:ffi can't retrieve
  // both components.  We return the last position we warped the cursor
  // to instead — accurate as long as all movement goes through setPos.
  return { x: _macLastPos.x, y: _macLastPos.y };
}

function mac_mouse_setPos(x: number, y: number): void {
  const C = cg();
  if (!C) return;
  C.CGWarpMouseCursorPosition(x, y);
  // Immediately re-associate so the system mouse tracks the synthesized
  // position (matches napi backend behavior).
  C.CGAssociateMouseAndMouseCursorPosition(1);
  _macLastPos = { x, y };
}

function mac_mouse_getButtonState(button: number): boolean {
  const C = cg();
  const spec = mac_cgButton(button);
  if (!C || !spec) return false;
  return C.CGEventSourceButtonState(kCGEventSourceStateHIDSystemState, spec.cg_btn) !== 0;
}

// ==================== Dispatch ====================

const platform = process.platform;

export const mouse_press =
  platform === "linux" ? linux_mouse_press :
  platform === "win32" ? win_mouse_press :
  platform === "darwin" ? mac_mouse_press :
                         (_b: number) => {};

export const mouse_release =
  platform === "linux" ? linux_mouse_release :
  platform === "win32" ? win_mouse_release :
  platform === "darwin" ? mac_mouse_release :
                         (_b: number) => {};

export const mouse_scrollH =
  platform === "linux" ? linux_mouse_scrollH :
  platform === "win32" ? win_mouse_scrollH :
  platform === "darwin" ? mac_mouse_scrollH :
                         (_a: number) => {};

export const mouse_scrollV =
  platform === "linux" ? linux_mouse_scrollV :
  platform === "win32" ? win_mouse_scrollV :
  platform === "darwin" ? mac_mouse_scrollV :
                         (_a: number) => {};

export const mouse_getPos =
  platform === "linux" ? linux_mouse_getPos :
  platform === "win32" ? win_mouse_getPos :
  platform === "darwin" ? mac_mouse_getPos :
                         (): { x: number; y: number } => ({ x: 0, y: 0 });

export const mouse_setPos =
  platform === "linux" ? linux_mouse_setPos :
  platform === "win32" ? win_mouse_setPos :
  platform === "darwin" ? mac_mouse_setPos :
                         (_x: number, _y: number) => {};

export const mouse_getButtonState =
  platform === "linux" ? linux_mouse_getButtonState :
  platform === "win32" ? win_mouse_getButtonState :
  platform === "darwin" ? mac_mouse_getButtonState :
                         (_b: number) => false;
