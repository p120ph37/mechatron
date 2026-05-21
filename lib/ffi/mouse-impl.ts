/**
 * ffi mouse backend — synchronous worker-side implementation for
 * non-Linux platforms (macOS, Windows).
 *
 * Linux x11 lives in mouse-x11-impl.ts (variant split mirroring napi).
 * The main-thread proxy in mouse.ts throws on Linux so this module is
 * never loaded there.
 */

import {
  user32, winFFI,
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
  kCGEventLeftMouseDragged, kCGEventRightMouseDragged,
  kCGEventOtherMouseDown, kCGEventOtherMouseUp,
  kCGMouseButtonLeft, kCGMouseButtonRight, kCGMouseButtonCenter,
  kCGScrollEventUnitPixel,
  kCGMouseEventClickState,
} from "./mac";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "../mouse/constants";

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
  const u = user32();
  const F = winFFI();
  if (!u || !F) return { x: 0, y: 0 };
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

let _macMouseSource: bigint | null = null;
function macMouseSource(): bigint {
  if (_macMouseSource !== null) return _macMouseSource;
  const C = cg(); if (!C) { _macMouseSource = 0n; return 0n; }
  _macMouseSource = C.CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  if (!_macMouseSource) return 0n;
  return _macMouseSource;
}

let _macLastPos = { x: 0, y: 0 };

let _macLastClickTime = 0;
const DOUBLE_CLICK_MS = 500;

function mac_getClickCount(): bigint {
  const now = Date.now();
  if (now - _macLastClickTime < DOUBLE_CLICK_MS) {
    _macLastClickTime = 0;
    return 2n;
  }
  _macLastClickTime = now;
  return 1n;
}

function mac_mouse_press(button: number): void {
  const C = cg();
  const F = cf();
  const spec = mac_cgButton(button);
  if (!C || !F || !spec) return;
  const src = macMouseSource();
  if (!src) return;
  const evt = C.CGEventCreateMouseEvent(src, spec.type_down, _macLastPos.x, _macLastPos.y, spec.cg_btn);
  if (!evt) return;
  C.CGEventSetIntegerValueField(evt, kCGMouseEventClickState, mac_getClickCount());
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_release(button: number): void {
  const C = cg();
  const F = cf();
  const spec = mac_cgButton(button);
  if (!C || !F || !spec) return;
  const src = macMouseSource();
  if (!src) return;
  const evt = C.CGEventCreateMouseEvent(src, spec.type_up, _macLastPos.x, _macLastPos.y, spec.cg_btn);
  if (!evt) return;
  C.CGEventSetIntegerValueField(evt, kCGMouseEventClickState, mac_getClickCount());
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_scrollV(amount: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const evt = C.CGEventCreateScrollWheelEvent2(0n, kCGScrollEventUnitPixel, 1, amount | 0, 0, 0);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_scrollH(amount: number): void {
  const C = cg();
  const F = cf();
  if (!C || !F) return;
  const evt = C.CGEventCreateScrollWheelEvent2(0n, kCGScrollEventUnitPixel, 2, 0, amount | 0, 0);
  if (!evt) return;
  C.CGEventPost(kCGHIDEventTap, evt);
  F.CFRelease(evt);
}

function mac_mouse_getPos(): { x: number; y: number } {
  return { x: _macLastPos.x, y: _macLastPos.y };
}

function mac_mouse_setPos(x: number, y: number): void {
  const C = cg();
  const F = cf();
  if (!C) return;

  const leftDown = C.CGEventSourceButtonState(kCGEventSourceStateHIDSystemState, kCGMouseButtonLeft);
  const rightDown = C.CGEventSourceButtonState(kCGEventSourceStateHIDSystemState, kCGMouseButtonRight);

  if ((leftDown || rightDown) && F) {
    const src = macMouseSource();
    if (!src) return;
    const [dragType, dragBtn] = leftDown
      ? [kCGEventLeftMouseDragged, kCGMouseButtonLeft]
      : [kCGEventRightMouseDragged, kCGMouseButtonRight];
    const evt = C.CGEventCreateMouseEvent(src, dragType, x, y, dragBtn);
    if (evt) {
      C.CGEventPost(kCGHIDEventTap, evt);
      F.CFRelease(evt);
    }
  } else {
    C.CGWarpMouseCursorPosition(x, y);
    C.CGAssociateMouseAndMouseCursorPosition(true);
  }
  _macLastPos = { x, y };
}

function mac_mouse_getButtonState(button: number): boolean {
  const C = cg();
  const spec = mac_cgButton(button);
  if (!C || !spec) return false;
  return C.CGEventSourceButtonState(kCGEventSourceStateHIDSystemState, spec.cg_btn);
}

// ==================== Dispatch ====================

const platform = process.platform;

export const mouse_press =
  platform === "win32" ? win_mouse_press :
  platform === "darwin" ? mac_mouse_press :
                         (_b: number) => {};

export const mouse_release =
  platform === "win32" ? win_mouse_release :
  platform === "darwin" ? mac_mouse_release :
                         (_b: number) => {};

export const mouse_scrollH =
  platform === "win32" ? win_mouse_scrollH :
  platform === "darwin" ? mac_mouse_scrollH :
                         (_a: number) => {};

export const mouse_scrollV =
  platform === "win32" ? win_mouse_scrollV :
  platform === "darwin" ? mac_mouse_scrollV :
                         (_a: number) => {};

export const mouse_getPos =
  platform === "win32" ? win_mouse_getPos :
  platform === "darwin" ? mac_mouse_getPos :
                         (): { x: number; y: number } => ({ x: 0, y: 0 });

export const mouse_setPos =
  platform === "win32" ? win_mouse_setPos :
  platform === "darwin" ? mac_mouse_setPos :
                         (_x: number, _y: number) => {};

export const mouse_getButtonState =
  platform === "win32" ? win_mouse_getButtonState :
  platform === "darwin" ? mac_mouse_getButtonState :
                         (_b: number) => false;
