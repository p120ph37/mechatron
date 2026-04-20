/**
 * nolib keyboard backend — pure TypeScript, no native libraries.
 *
 * Two input paths:
 *   1. X11 xproto (XTest FakeKeyEvent) — when $DISPLAY is set.
 *   2. uinput via ioctl bridge — headless/Wayland fallback via /dev/uinput.
 */

import { getXConnection } from "../ffi/xconn";
import { xprotoKeyPress, xprotoKeyRelease } from "../ffi/xproto";
import { nolibUinputAvailable, injectKeysym } from "./uinput";

const IS_LINUX = process.platform === "linux";
const HAS_DISPLAY = !!process.env.DISPLAY;

let _hasUinput: boolean | undefined;
function hasUinput(): boolean {
  if (_hasUinput === undefined) _hasUinput = IS_LINUX && nolibUinputAvailable();
  return _hasUinput;
}

async function linux_keyboard_press(keycode: number): Promise<void> {
  if (HAS_DISPLAY) return xprotoKeyPress(keycode);
  injectKeysym(keycode, true);
}

async function linux_keyboard_release(keycode: number): Promise<void> {
  if (HAS_DISPLAY) return xprotoKeyRelease(keycode);
  injectKeysym(keycode, false);
}

async function linux_keyboard_getKeyState(keycode: number): Promise<boolean> {
  if (!HAS_DISPLAY) return false;
  const c = await getXConnection();
  if (!c) return false;
  const keymap = await c.queryKeymap();
  const xkeycode = c.keysymToKeycode(keycode);
  if (xkeycode === 0) return false;
  return (keymap.keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}

export const keyboard_press = IS_LINUX ? linux_keyboard_press : null;
export const keyboard_release = IS_LINUX ? linux_keyboard_release : null;
export const keyboard_getKeyState = IS_LINUX ? linux_keyboard_getKeyState : null;

if (!IS_LINUX || (!HAS_DISPLAY && !hasUinput())) {
  throw new Error("nolib/keyboard: requires Linux with $DISPLAY or /dev/uinput");
}
