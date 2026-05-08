/**
 * ffi mouse backend (x11 variant) — Linux-only main-thread async proxy.
 *
 * Mirrors mouse.ts but spawns the variant-specific worker
 * (mouse-x11-worker.ts) which only loads the X11/uinput implementation.
 * The base mouse.ts throws on Linux to steer the backend resolver here
 * for `ffi[x11]` (and to ffi/mouse-portal for `ffi[portal]`).
 */

import { createDispatcher } from "./_dispatch";
import { isXTestAvailable } from "./x11";
import { uinputSelected } from "./uinput";

if (process.platform !== "linux") {
  throw new Error("ffi/mouse-x11: linux-only variant");
}

// Fail-fast on the main thread before spawning the worker.  The worker
// would otherwise throw asynchronously on first call, at which point
// the backend resolver has already committed to this variant.
if (!isXTestAvailable() && !uinputSelected()) {
  throw new Error("ffi/mouse-x11: requires libXtst or uinput");
}

const d = createDispatcher(require.resolve("./mouse-x11-worker"));

export const mouse_press = (button: number): Promise<void> =>
  d.call("mouse_press", [button]);
export const mouse_release = (button: number): Promise<void> =>
  d.call("mouse_release", [button]);
export const mouse_scrollH = (amount: number): Promise<void> =>
  d.call("mouse_scrollH", [amount]);
export const mouse_scrollV = (amount: number): Promise<void> =>
  d.call("mouse_scrollV", [amount]);
export const mouse_getPos = (): Promise<{ x: number; y: number }> =>
  d.call("mouse_getPos", []);
export const mouse_setPos = (x: number, y: number): Promise<void> =>
  d.call("mouse_setPos", [x, y]);
export const mouse_getButtonState = (button: number): Promise<boolean> =>
  d.call("mouse_getButtonState", [button]);
