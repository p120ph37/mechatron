/**
 * nolib[vt] keyboard backend — /dev/uinput via ioctl bridge.
 *
 * Synthesizes key press/release events through a userspace evdev device
 * registered with the kernel via the uinput protocol.  Useful for
 * headless TTY / VT environments.  getKeyState is unavailable (uinput
 * is write-only).  Requires /dev/uinput to be readable+writable by the
 * test process.
 */

import { nolibUinputAvailable, injectKeysym } from "./uinput";

if (!nolibUinputAvailable()) {
  throw new Error("nolib/keyboard[vt]: requires /dev/uinput");
}

export async function keyboard_press(keycode: number): Promise<void> {
  injectKeysym(keycode, true);
}

export async function keyboard_release(keycode: number): Promise<void> {
  injectKeysym(keycode, false);
}

export async function keyboard_getKeyState(_keycode: number): Promise<boolean> {
  // uinput is write-only; no way to query current key state.
  return false;
}
