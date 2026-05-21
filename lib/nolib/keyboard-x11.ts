/**
 * nolib[x11] keyboard backend — XTest FakeKeyEvent over xproto.
 *
 * Pure-TS injection through the lib/x11proto/xproto sync wrappers and a
 * QueryKeymap-based getKeyState implementation.  Requires $DISPLAY.
 */

import { getXConnection } from "../x11proto/xconn";
import { xprotoKeyPress, xprotoKeyRelease } from "../x11proto/xproto";

if (!process.env.DISPLAY) {
  throw new Error("nolib/keyboard[x11]: requires $DISPLAY");
}

export async function keyboard_press(keycode: number): Promise<void> {
  return xprotoKeyPress(keycode);
}

export async function keyboard_release(keycode: number): Promise<void> {
  return xprotoKeyRelease(keycode);
}

export async function keyboard_getKeyState(keycode: number): Promise<boolean> {
  const c = await getXConnection();
  if (!c) return false;
  const keymap = await c.queryKeymap();
  const xkeycode = c.keysymToKeycode(keycode);
  if (xkeycode === 0) return false;
  return (keymap.keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}
