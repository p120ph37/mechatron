/**
 * ffi keyboard backend — main-thread async proxy to keyboard-worker.ts
 * for non-Linux platforms (macOS, Windows).
 *
 * Linux is served by napi[x11/portal/gext] or nolib[x11/portal/gext/vt];
 * ffi has no Linux backend.
 */

import { createDispatcher } from "./_dispatch";

if (process.platform === "linux") {
  throw new Error("ffi/keyboard: not available on Linux — use napi or nolib");
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
