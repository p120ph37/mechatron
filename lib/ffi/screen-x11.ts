/**
 * ffi screen backend (x11 variant) — Linux-only main-thread async proxy.
 *
 * Mirrors screen.ts but spawns the variant-specific worker
 * (screen-x11-worker.ts) which only loads the X11 implementation.  The
 * base screen.ts throws on Linux to steer the backend resolver here for
 * `ffi[x11]` (and to ffi/screen-portal for `ffi[portal]`).
 */

import { createDispatcher } from "./_dispatch";
import { getDisplay } from "./x11";
import type { ScreenInfo } from "./screen-x11-impl";
export type { ScreenInfo } from "./screen-x11-impl";

if (process.platform !== "linux") {
  throw new Error("ffi/screen-x11: linux-only variant");
}

// Fail-fast on the main thread before spawning the worker.  The worker
// would otherwise throw asynchronously on first call, at which point
// the backend resolver has already committed to this variant.
if (!getDisplay()) {
  throw new Error("ffi/screen-x11: requires libX11");
}

const d = createDispatcher(require.resolve("./screen-x11-worker"));

export const screen_synchronize = (): Promise<ScreenInfo[] | null> =>
  d.call("screen_synchronize", []);
export const screen_grabScreen = (
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> =>
  d.call("screen_grabScreen", [x, y, w, h, windowHandle]);
