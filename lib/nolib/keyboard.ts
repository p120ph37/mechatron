/**
 * nolib keyboard backend — pure TypeScript, no native libraries.
 *
 * Linux: X11 wire protocol (xproto) over Unix/TCP socket.
 * Other platforms: not available (returns null from loader).
 */

import { getXConnection } from "../ffi/xconn";
import { xprotoKeyPress, xprotoKeyRelease } from "../ffi/xproto";

const IS_LINUX = process.platform === "linux";

async function linux_keyboard_press(keycode: number): Promise<void> {
  return xprotoKeyPress(keycode);
}

async function linux_keyboard_release(keycode: number): Promise<void> {
  return xprotoKeyRelease(keycode);
}

async function linux_keyboard_getKeyState(keycode: number): Promise<boolean> {
  const c = await getXConnection();
  if (!c) return false;
  const keymap = await c.queryKeymap();
  const xkeycode = c.keysymToKeycode(keycode);
  if (xkeycode === 0) return false;
  return (keymap.keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}

// Only export on Linux; the backend loader skips this module on other platforms.
export const keyboard_press = IS_LINUX ? linux_keyboard_press : null;
export const keyboard_release = IS_LINUX ? linux_keyboard_release : null;
export const keyboard_getKeyState = IS_LINUX ? linux_keyboard_getKeyState : null;

// Module is only viable on Linux with $DISPLAY set.
if (!IS_LINUX || !process.env.DISPLAY) {
  // Signal to the backend resolver that this module can't load.
  throw new Error("nolib/keyboard: requires Linux with $DISPLAY");
}
