/**
 * nolib mouse backend — pure TypeScript, no native libraries.
 *
 * Linux: X11 wire protocol (xproto) over Unix/TCP socket.
 * Other platforms: not available.
 */

import { getXConnection } from "../ffi/xconn";
import {
  xprotoMousePress, xprotoMouseRelease,
  xprotoScrollV, xprotoScrollH, xprotoSetPos,
} from "../ffi/xproto";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "../mouse/constants";

const IS_LINUX = process.platform === "linux";

const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

function linux_mouse_press(button: number): Promise<void> | void {
  return xprotoMousePress(button);
}

function linux_mouse_release(button: number): Promise<void> | void {
  return xprotoMouseRelease(button);
}

function linux_mouse_scrollH(amount: number): Promise<void> | void {
  return xprotoScrollH(amount);
}

function linux_mouse_scrollV(amount: number): Promise<void> | void {
  return xprotoScrollV(amount);
}

async function linux_mouse_getPos(): Promise<{ x: number; y: number }> {
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  const qp = await c.queryPointer();
  return { x: qp.rootX, y: qp.rootY };
}

function linux_mouse_setPos(x: number, y: number): Promise<void> {
  return xprotoSetPos(x, y);
}

async function linux_mouse_getButtonState(button: number): Promise<boolean> {
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

if (!IS_LINUX || !process.env.DISPLAY) {
  throw new Error("nolib/mouse: requires Linux with $DISPLAY");
}
