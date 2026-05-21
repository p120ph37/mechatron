/**
 * nolib[gext] keyboard backend — Clutter virtual device via D-Bus.
 *
 * Routes key press/release through the Mechatron GNOME Shell extension's
 * Input interface, which injects events via Clutter virtual keyboard
 * inside the compositor. No portal permission dialog required.
 *
 * getKeyState queries modifier masks and shadow key-tracking state
 * via the extension's GetKeyState D-Bus method.
 */

import { gextKeyboardKeysym, gextGetKeyState } from "../gext/input";

export async function keyboard_press(keycode: number): Promise<void> {
  return gextKeyboardKeysym(keycode, true);
}

export async function keyboard_release(keycode: number): Promise<void> {
  return gextKeyboardKeysym(keycode, false);
}

export async function keyboard_getKeyState(keycode: number): Promise<boolean> {
  return gextGetKeyState(keycode);
}
