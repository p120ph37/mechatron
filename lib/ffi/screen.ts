/**
 * ffi screen backend — main-thread async proxy to screen-worker.ts for
 * non-Linux platforms (macOS, Windows).
 *
 * Linux is served by napi[x11/portal] or nolib[x11/portal/vt]; ffi has
 * no Linux backend.
 */

import { createDispatcher } from "./_dispatch";
import type { ScreenInfo } from "./screen-impl";
export type { ScreenInfo } from "./screen-impl";

if (process.platform === "linux") {
  throw new Error("ffi/screen: not available on Linux — use napi or nolib");
}
if (!["win32", "darwin"].includes(process.platform)) {
  throw new Error("ffi/screen: unsupported platform");
}

const d = createDispatcher(require.resolve("./screen-worker"));

export const screen_synchronize = (): Promise<ScreenInfo[] | null> =>
  d.call("screen_synchronize", []);
export const screen_grabScreen = (
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> =>
  d.call("screen_grabScreen", [x, y, w, h, windowHandle]);
