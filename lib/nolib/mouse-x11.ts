/**
 * nolib[x11] mouse backend — XTest FakeButtonEvent / WarpPointer over xproto.
 */

import { getXConnection } from "../x11proto/xconn";
import {
  xprotoMousePress, xprotoMouseRelease,
  xprotoScrollV, xprotoScrollH, xprotoSetPos,
} from "../x11proto/xproto";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "../mouse/constants";

if (!process.env.DISPLAY) {
  throw new Error("nolib/mouse[x11]: requires $DISPLAY");
}

const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

export async function mouse_press(button: number): Promise<void> {
  return xprotoMousePress(button);
}

export async function mouse_release(button: number): Promise<void> {
  return xprotoMouseRelease(button);
}

export async function mouse_scrollH(amount: number): Promise<void> {
  return xprotoScrollH(amount);
}

export async function mouse_scrollV(amount: number): Promise<void> {
  return xprotoScrollV(amount);
}

export async function mouse_getPos(): Promise<{ x: number; y: number }> {
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  const qp = await c.queryPointer();
  return { x: qp.rootX, y: qp.rootY };
}

export async function mouse_setPos(x: number, y: number): Promise<void> {
  return xprotoSetPos(x, y);
}

export async function mouse_getButtonState(button: number): Promise<boolean> {
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
