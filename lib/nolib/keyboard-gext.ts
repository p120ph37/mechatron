/**
 * nolib[gext] keyboard backend — Clutter virtual device via D-Bus.
 *
 * Routes key press/release through the Mechatron GNOME Shell extension's
 * Input interface, which injects events via Clutter virtual keyboard
 * inside the compositor. No portal permission dialog required.
 *
 * getKeyState is unavailable (the extension is write-only).
 */

import { gextKeyboardKeysym } from "../gext/input";

export async function keyboard_press(keycode: number): Promise<void> {
  return gextKeyboardKeysym(keycode, true);
}

export async function keyboard_release(keycode: number): Promise<void> {
  return gextKeyboardKeysym(keycode, false);
}

export async function keyboard_getKeyState(_keycode: number): Promise<boolean> {
  return false;
}
