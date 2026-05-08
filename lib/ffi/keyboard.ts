/**
 * ffi keyboard backend — main-thread async proxy to keyboard-worker.ts
 * for non-Linux platforms (macOS, Windows).
 *
 * On Linux this base file throws so the backend resolver picks up the
 * variant-specific entry (ffi/keyboard-x11 for X11/uinput,
 * ffi/keyboard-portal for libei).  Mirrors the napi keyboard variant
 * split.
 */

import { createDispatcher } from "./_dispatch";

if (process.platform === "linux") {
  throw new Error(
    "ffi/keyboard: use ffi/keyboard-x11 (linux x11) or ffi/keyboard-portal (linux libei) variant on linux",
  );
}
if (!["win32", "darwin"].includes(process.platform)) {
  throw new Error("ffi/keyboard: unsupported platform");
}

const d = createDispatcher(require.resolve("./keyboard-worker"));

export const keyboard_press = (keycode: number): Promise<void> =>
  d.call("keyboard_press", [keycode]);
export const keyboard_release = (keycode: number): Promise<void> =>
  d.call("keyboard_release", [keycode]);
export const keyboard_getKeyState = (keycode: number): Promise<boolean> =>
  d.call("keyboard_getKeyState", [keycode]);
