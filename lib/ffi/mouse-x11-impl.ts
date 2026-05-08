/**
 * ffi mouse backend (x11 variant) — Linux-only synchronous worker-side
 * implementation.
 *
 * Extracted from mouse-impl.ts as part of the variant split that mirrors
 * napi[x11]/napi[portal].  Contains only the X11/XTest + uinput
 * injection paths; the worker entry (mouse-x11-worker.ts) loads it and
 * the main-thread proxy (mouse-x11.ts) dispatches into the worker.
 */

import {
  injectMouseButton, injectScrollV, injectScrollH, injectAbsMotion,
  uinputSelected, UINPUT_ABS_MAX,
} from "./uinput";
import {
  getDisplay, isXTestAvailable, x11, xtest,
} from "./x11";
import { getBunFFI } from "./bun";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2, xButton as linux_xButton } from "../mouse/constants";

const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

export function mouse_press(button: number): void {
  if (uinputSelected()) {
    if (injectMouseButton(button, true)) return;
  }
  const XT = xtest(); const X = x11(); const d = getDisplay();
  if (!XT || !X || !d) return;
  const xbtn = linux_xButton(button);
  if (xbtn === null) return;
  XT.XTestFakeButtonEvent(d, xbtn, 1, 0n);
  X.XSync(d, 0);
}

export function mouse_release(button: number): void {
  if (uinputSelected()) {
    if (injectMouseButton(button, false)) return;
  }
  const XT = xtest(); const X = x11(); const d = getDisplay();
  if (!XT || !X || !d) return;
  const xbtn = linux_xButton(button);
  if (xbtn === null) return;
  XT.XTestFakeButtonEvent(d, xbtn, 0, 0n);
  X.XSync(d, 0);
}

export function mouse_scrollH(amount: number): void {
  if (uinputSelected()) {
    if (injectScrollH(amount)) return;
  }
  const XT = xtest(); const X = x11(); const d = getDisplay();
  if (!XT || !X || !d) return;
  const repeat = Math.abs(amount);
  const btn = amount < 0 ? 6 : 7;
  for (let i = 0; i < repeat; i++) {
    XT.XTestFakeButtonEvent(d, btn, 1, 0n);
    XT.XTestFakeButtonEvent(d, btn, 0, 0n);
  }
  X.XSync(d, 0);
}

export function mouse_scrollV(amount: number): void {
  if (uinputSelected()) {
    if (injectScrollV(amount)) return;
  }
  const XT = xtest(); const X = x11(); const d = getDisplay();
  if (!XT || !X || !d) return;
  const repeat = Math.abs(amount);
  const btn = amount < 0 ? 5 : 4;
  for (let i = 0; i < repeat; i++) {
    XT.XTestFakeButtonEvent(d, btn, 1, 0n);
    XT.XTestFakeButtonEvent(d, btn, 0, 0n);
  }
  X.XSync(d, 0);
}

export function mouse_getPos(): { x: number; y: number } {
  const X = x11(); const F = getBunFFI(); const d = getDisplay();
  if (!X || !F || !d) return { x: 0, y: 0 };
  const root = X.XDefaultRootWindow(d);
  const rootRet = new BigUint64Array(1);
  const childRet = new BigUint64Array(1);
  const rootX = new Int32Array(1);
  const rootY = new Int32Array(1);
  const winX = new Int32Array(1);
  const winY = new Int32Array(1);
  const mask = new Uint32Array(1);
  X.XQueryPointer(d, root, F.ptr(rootRet), F.ptr(childRet),
    F.ptr(rootX), F.ptr(rootY), F.ptr(winX), F.ptr(winY), F.ptr(mask));
  return { x: rootX[0], y: rootY[0] };
}

let _screenDims: { w: number; h: number } | undefined;
function getScreenDims(): { w: number; h: number } | null {
  if (_screenDims) return _screenDims;
  const X = x11(); const d = getDisplay();
  if (!X || !d) return null;
  const screen = X.XDefaultScreen(d);
  const screenPtr = X.XScreenOfDisplay(d, screen);
  if (!screenPtr) return null;
  const w = X.XWidthOfScreen(screenPtr);
  const h = X.XHeightOfScreen(screenPtr);
  if (w <= 0 || h <= 0) return null;
  _screenDims = { w, h };
  return _screenDims;
}

export function mouse_setPos(x: number, y: number): void {
  if (uinputSelected()) {
    const dims = getScreenDims();
    if (dims) {
      const absX = Math.round((x * UINPUT_ABS_MAX) / dims.w);
      const absY = Math.round((y * UINPUT_ABS_MAX) / dims.h);
      if (injectAbsMotion(absX, absY)) return;
    }
  }
  // Fallback to XWarpPointer
  const X = x11(); const d = getDisplay();
  if (!X || !d) return;
  const root = X.XDefaultRootWindow(d);
  X.XWarpPointer(d, 0n, root, 0, 0, 0, 0, x, y);
  X.XSync(d, 0);
}

export function mouse_getButtonState(button: number): boolean {
  if (button === BUTTON_X1 || button === BUTTON_X2) return false;
  const X = x11(); const F = getBunFFI(); const d = getDisplay();
  if (!X || !F || !d) return false;
  const root = X.XDefaultRootWindow(d);
  const rootRet = new BigUint64Array(1);
  const childRet = new BigUint64Array(1);
  const rootX = new Int32Array(1);
  const rootY = new Int32Array(1);
  const winX = new Int32Array(1);
  const winY = new Int32Array(1);
  const mask = new Uint32Array(1);
  X.XQueryPointer(d, root, F.ptr(rootRet), F.ptr(childRet),
    F.ptr(rootX), F.ptr(rootY), F.ptr(winX), F.ptr(winY), F.ptr(mask));
  const m = mask[0];
  switch (button) {
    case BUTTON_LEFT:  return ((m & Button1Mask) >>> 8) !== 0;
    case BUTTON_MID:   return ((m & Button2Mask) >>> 8) !== 0;
    case BUTTON_RIGHT: return ((m & Button3Mask) >>> 8) !== 0;
    default: return false;
  }
}

// Signal unavailability to the backend resolver when the required native
// libraries cannot be loaded.
if (!isXTestAvailable() && !uinputSelected()) {
  throw new Error("ffi/mouse-x11: requires libXtst or uinput");
}
