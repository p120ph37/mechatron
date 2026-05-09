/**
 * ffi[portal] keyboard backend — RemoteDesktop D-Bus.
 *
 * Mirrors the linux-napi[portal] surface (which uses a Rust binary
 * with libei) by routing key press/release through the same
 * xdg-desktop-portal RemoteDesktop NotifyKeyboardKeysym method that
 * lib/nolib/keyboard-portal.ts uses.  Sharing the wire-protocol
 * implementation in lib/portal/remote-desktop.ts keeps the ffi[portal]
 * variant available wherever a Wayland session + D-Bus is reachable
 * without pulling in a libei FFI surface.
 */

import {
  remoteDesktopAvailable, notifyKeyboardKeysym,
} from "../portal/remote-desktop";

if (!remoteDesktopAvailable()) {
  throw new Error("ffi/keyboard[portal]: requires Wayland session + D-Bus session bus");
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
