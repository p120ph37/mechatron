/**
 * nolib mouse backend — pure TypeScript, no native libraries.
 *
 * Two variants:
 *   - x11: XTest FakeButtonEvent / WarpPointer via xproto. Requires $DISPLAY.
 *   - vt:  uinput via ioctl bridge. Requires /dev/uinput + interpreter.
 *     Note: vt only supports relative motion; getPos/setPos/getButtonState
 *     are no-ops without X11.
 */

import { getNolibVariant } from "../backend";
import { getXConnection } from "../ffi/xconn";
import {
  xprotoMousePress, xprotoMouseRelease,
  xprotoScrollV, xprotoScrollH, xprotoSetPos,
} from "../ffi/xproto";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "../mouse/constants";
import {
  nolibUinputAvailable,
  injectMouseButton, injectScrollV, injectScrollH,
} from "./uinput";

const IS_LINUX = process.platform === "linux";
const HAS_DISPLAY = !!process.env.DISPLAY;
const VARIANT = getNolibVariant();

const USE_X11 = HAS_DISPLAY && (VARIANT === "x11" || VARIANT === undefined);
const USE_VT = !USE_X11 && (VARIANT === "vt" || VARIANT === undefined);

let _hasUinput: boolean | undefined;
function hasUinput(): boolean {
  if (_hasUinput === undefined) _hasUinput = IS_LINUX && nolibUinputAvailable();
  return _hasUinput;
}

const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

function linux_mouse_press(button: number): Promise<void> | void {
  if (USE_X11) return xprotoMousePress(button);
  injectMouseButton(button, true);
}

function linux_mouse_release(button: number): Promise<void> | void {
  if (USE_X11) return xprotoMouseRelease(button);
  injectMouseButton(button, false);
}

function linux_mouse_scrollH(amount: number): Promise<void> | void {
  if (USE_X11) return xprotoScrollH(amount);
  injectScrollH(amount);
}

function linux_mouse_scrollV(amount: number): Promise<void> | void {
  if (USE_X11) return xprotoScrollV(amount);
  injectScrollV(amount);
}

async function linux_mouse_getPos(): Promise<{ x: number; y: number }> {
  if (!USE_X11) return { x: 0, y: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  const qp = await c.queryPointer();
  return { x: qp.rootX, y: qp.rootY };
}

function linux_mouse_setPos(x: number, y: number): Promise<void> {
  if (!USE_X11) return Promise.resolve();
  return xprotoSetPos(x, y);
}

async function linux_mouse_getButtonState(button: number): Promise<boolean> {
  if (!USE_X11) return false;
  if (button === BUTTON_X1 || button === BUTTON_X2) return false;
  const c = await getXConnection();
  if (!c) return false;
  const qp = await c.queryPointer();
  const m = qp.mask;
  switch (button) {
    case BUTTON_LEFT:  return ((m & Button1Mask) >>> 8) !== 0;
    case BUTTON_MID:   return ((m & Button2Mask) >>> 8) !== 0;
    case BUTTON_RIGHT: return ((m & Button3Mask) >>> 8) !== 0;
    default: return false;
  }
}

export const mouse_press = IS_LINUX ? linux_mouse_press : null;
export const mouse_release = IS_LINUX ? linux_mouse_release : null;
export const mouse_scrollH = IS_LINUX ? linux_mouse_scrollH : null;
export const mouse_scrollV = IS_LINUX ? linux_mouse_scrollV : null;
export const mouse_getPos = IS_LINUX ? linux_mouse_getPos : null;
export const mouse_setPos = IS_LINUX ? linux_mouse_setPos : null;
export const mouse_getButtonState = IS_LINUX ? linux_mouse_getButtonState : null;

if (!IS_LINUX) {
  throw new Error("nolib/mouse: requires Linux");
}
if (VARIANT === "portal") {
  throw new Error("nolib/mouse[portal]: RemoteDesktop D-Bus backend not yet implemented");
}
if (VARIANT === "x11" && !HAS_DISPLAY) {
  throw new Error("nolib/mouse[x11]: requires $DISPLAY");
}
if (VARIANT === "vt" && !hasUinput()) {
  throw new Error("nolib/mouse[vt]: requires /dev/uinput");
}
if (!HAS_DISPLAY && !hasUinput()) {
  throw new Error("nolib/mouse: requires $DISPLAY or /dev/uinput");
}
