/**
 * ffi mouse backend — main-thread async proxy to mouse-worker.ts for
 * non-Linux platforms (macOS, Windows).
 *
 * Linux is served by napi[x11/portal/gext] or nolib[x11/portal/gext/vt];
 * ffi has no Linux backend.
 */

import { createDispatcher } from "./_dispatch";

if (process.platform === "linux") {
  throw new Error("ffi/mouse: not available on Linux — use napi or nolib");
}
if (!["win32", "darwin"].includes(process.platform)) {
  throw new Error("ffi/mouse: unsupported platform");
}

const d = createDispatcher(require.resolve("./mouse-worker"));

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
