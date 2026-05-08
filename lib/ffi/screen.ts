/**
 * ffi screen backend — main-thread async proxy to screen-worker.ts for
 * non-Linux platforms (macOS, Windows).
 *
 * On Linux this base file throws so the backend resolver picks up the
 * variant-specific entry (ffi/screen-x11 for X11, ffi/screen-portal for
 * PipeWire).  Mirrors the napi screen variant split.
 */

import { createDispatcher } from "./_dispatch";
import type { ScreenInfo } from "./screen-impl";
export type { ScreenInfo } from "./screen-impl";

if (process.platform === "linux") {
  throw new Error(
    "ffi/screen: use ffi/screen-x11 (linux x11) or ffi/screen-portal (linux pipewire) variant on linux",
  );
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
