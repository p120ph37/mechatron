/**
 * ffi keyboard backend (x11 variant) — Linux-only main-thread async proxy.
 *
 * Mirrors keyboard.ts but spawns the variant-specific worker
 * (keyboard-x11-worker.ts), which only loads the X11/uinput
 * implementation.  The base keyboard.ts throws on Linux to steer the
 * backend resolver here for `ffi[x11]` (and to ffi/keyboard-portal for
 * `ffi[portal]` on libei-capable systems).
 */

import { createDispatcher } from "./_dispatch";
import { isXTestAvailable } from "./x11";
import { uinputSelected } from "./uinput";

if (process.platform !== "linux") {
  throw new Error("ffi/keyboard-x11: linux-only variant");
}

// Fail-fast on the main thread before spawning the worker.  The worker
// would otherwise throw the same message asynchronously on first call,
// at which point the backend resolver has already committed to this
// variant and cannot fall back.
if (!isXTestAvailable() && !uinputSelected()) {
  throw new Error("ffi/keyboard-x11: requires libXtst or uinput");
}

const d = createDispatcher(require.resolve("./keyboard-x11-worker"));

export const keyboard_press = (keycode: number): Promise<void> =>
  d.call("keyboard_press", [keycode]);
export const keyboard_release = (keycode: number): Promise<void> =>
  d.call("keyboard_release", [keycode]);
export const keyboard_getKeyState = (keycode: number): Promise<boolean> =>
  d.call("keyboard_getKeyState", [keycode]);
