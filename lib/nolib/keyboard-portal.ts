/**
 * nolib[portal] keyboard backend — RemoteDesktop D-Bus.
 *
 * Routes key press/release through the xdg-desktop-portal RemoteDesktop
 * NotifyKeyboardKeysym method.  Requires a Wayland session with a
 * working portal frontend.  getKeyState is unavailable (the portal API
 * is write-only).
 */

import {
  remoteDesktopAvailable, notifyKeyboardKeysym,
} from "../portal/remote-desktop";

if (!remoteDesktopAvailable()) {
  throw new Error("nolib/keyboard[portal]: requires Wayland session + D-Bus session bus");
}

export async function keyboard_press(keycode: number): Promise<void> {
  return notifyKeyboardKeysym(keycode, true);
}

export async function keyboard_release(keycode: number): Promise<void> {
  return notifyKeyboardKeysym(keycode, false);
}

export async function keyboard_getKeyState(_keycode: number): Promise<boolean> {
  // RemoteDesktop is write-only; no way to query current key state.
  return false;
}
