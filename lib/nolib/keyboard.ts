/**
 * nolib keyboard backend — pure TypeScript, no native libraries.
 *
 * Three variants:
 *   - x11:    XTest FakeKeyEvent via xproto socket. Requires $DISPLAY.
 *   - portal: RemoteDesktop D-Bus NotifyKeyboardKeysym. Requires Wayland + portal.
 *   - vt:     uinput via ioctl bridge. Requires /dev/uinput + interpreter.
 */

import { getNolibVariant } from "../backend";
import { getXConnection } from "../x11proto/xconn";
import { xprotoKeyPress, xprotoKeyRelease } from "../x11proto/xproto";
import { nolibUinputAvailable, injectKeysym } from "./uinput";
import {
  remoteDesktopAvailable, notifyKeyboardKeysym,
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

async function linux_keyboard_press(keycode: number): Promise<void> {
  if (USE_X11) return xprotoKeyPress(keycode);
  if (USE_PORTAL) return notifyKeyboardKeysym(keycode, true);
  injectKeysym(keycode, true);
}

async function linux_keyboard_release(keycode: number): Promise<void> {
  if (USE_X11) return xprotoKeyRelease(keycode);
  if (USE_PORTAL) return notifyKeyboardKeysym(keycode, false);
  injectKeysym(keycode, false);
}

async function linux_keyboard_getKeyState(keycode: number): Promise<boolean> {
  if (USE_PORTAL) return false;
  if (!USE_X11) return false;
  const c = await getXConnection();
  if (!c) return false;
  const keymap = await c.queryKeymap();
  const xkeycode = c.keysymToKeycode(keycode);
  if (xkeycode === 0) return false;
  return (keymap.keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}

const SUPPORTED = IS_LINUX || HAS_DISPLAY;

export const keyboard_press = SUPPORTED ? linux_keyboard_press : null;
export const keyboard_release = SUPPORTED ? linux_keyboard_release : null;
export const keyboard_getKeyState = SUPPORTED ? linux_keyboard_getKeyState : null;

if (!SUPPORTED) {
  throw new Error("nolib/keyboard: requires Linux or $DISPLAY");
}
if (VARIANT === "portal" && !remoteDesktopAvailable()) {
  throw new Error("nolib/keyboard[portal]: requires Wayland session + D-Bus session bus");
}
if (VARIANT === "x11" && !HAS_DISPLAY) {
  throw new Error("nolib/keyboard[x11]: requires $DISPLAY");
}
if (VARIANT === "vt" && !hasUinput()) {
  throw new Error("nolib/keyboard[vt]: requires /dev/uinput");
}
if (!HAS_DISPLAY && !remoteDesktopAvailable() && !hasUinput()) {
  throw new Error("nolib/keyboard: requires $DISPLAY, Wayland portal, or /dev/uinput");
}
