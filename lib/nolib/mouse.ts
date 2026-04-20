/**
 * nolib mouse backend — pure TypeScript, no native libraries.
 *
 * Three variants:
 *   - x11:    XTest FakeButtonEvent / WarpPointer via xproto. Requires $DISPLAY.
 *   - portal: RemoteDesktop D-Bus NotifyPointerButton/Motion/Axis. Requires Wayland + portal.
 *   - vt:     uinput via ioctl bridge. Requires /dev/uinput + interpreter.
 *     Note: vt and portal only support relative motion; getPos/setPos/getButtonState
 *     are no-ops without X11.
 */

import { getNolibVariant } from "../backend";
import { getXConnection } from "../ffi/xconn";
import {
  xprotoMousePress, xprotoMouseRelease,
  xprotoScrollV, xprotoScrollH, xprotoSetPos,
} from "../ffi/xproto";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2, evdevButton } from "../mouse/constants";
import {
  nolibUinputAvailable,
  injectMouseButton, injectScrollV, injectScrollH,
} from "./uinput";
import {
  remoteDesktopAvailable,
  notifyPointerButton, notifyPointerAxisDiscrete,
} from "../portal/remote-desktop";

const IS_LINUX = process.platform === "linux";
const HAS_DISPLAY = !!process.env.DISPLAY;
const VARIANT = getNolibVariant();

const USE_X11 = HAS_DISPLAY && (VARIANT === "x11" || VARIANT === undefined);
const USE_PORTAL = VARIANT === "portal";

let _hasUinput: boolean | undefined;
function hasUinput(): boolean {
  if (_hasUinput === undefined) _hasUinput = IS_LINUX && nolibUinputAvailable();
  return _hasUinput;
}

const Button1Mask = 1 << 8;
const Button2Mask = 1 << 9;
const Button3Mask = 1 << 10;

// Portal scroll axes: 0 = vertical, 1 = horizontal
const AXIS_VERTICAL = 0;
const AXIS_HORIZONTAL = 1;

async function linux_mouse_press(button: number): Promise<void> {
  if (USE_X11) return xprotoMousePress(button);
  if (USE_PORTAL) {
    const code = evdevButton(button);
    if (code !== null) await notifyPointerButton(code, true);
    return;
  }
  injectMouseButton(button, true);
}

async function linux_mouse_release(button: number): Promise<void> {
  if (USE_X11) return xprotoMouseRelease(button);
  if (USE_PORTAL) {
    const code = evdevButton(button);
    if (code !== null) await notifyPointerButton(code, false);
    return;
  }
  injectMouseButton(button, false);
}

async function linux_mouse_scrollH(amount: number): Promise<void> {
  if (USE_X11) return xprotoScrollH(amount);
  if (USE_PORTAL) return notifyPointerAxisDiscrete(AXIS_HORIZONTAL, amount);
  injectScrollH(amount);
}

async function linux_mouse_scrollV(amount: number): Promise<void> {
  if (USE_X11) return xprotoScrollV(amount);
  if (USE_PORTAL) return notifyPointerAxisDiscrete(AXIS_VERTICAL, amount);
  injectScrollV(amount);
}

async function linux_mouse_getPos(): Promise<{ x: number; y: number }> {
  if (USE_PORTAL) return { x: 0, y: 0 };
  if (!USE_X11) return { x: 0, y: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  const qp = await c.queryPointer();
  return { x: qp.rootX, y: qp.rootY };
}

async function linux_mouse_setPos(x: number, y: number): Promise<void> {
  if (USE_PORTAL) return;
  if (!USE_X11) return;
  return xprotoSetPos(x, y);
}

async function linux_mouse_getButtonState(button: number): Promise<boolean> {
  if (USE_PORTAL) return false;
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
if (VARIANT === "portal" && !remoteDesktopAvailable()) {
  throw new Error("nolib/mouse[portal]: requires Wayland session + D-Bus session bus");
}
if (VARIANT === "x11" && !HAS_DISPLAY) {
  throw new Error("nolib/mouse[x11]: requires $DISPLAY");
}
if (VARIANT === "vt" && !hasUinput()) {
  throw new Error("nolib/mouse[vt]: requires /dev/uinput");
}
if (!HAS_DISPLAY && !remoteDesktopAvailable() && !hasUinput()) {
  throw new Error("nolib/mouse: requires $DISPLAY, Wayland portal, or /dev/uinput");
}
