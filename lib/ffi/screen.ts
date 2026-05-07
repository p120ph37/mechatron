/**
 * ffi screen backend — main-thread async proxy to screen-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./screen-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics; the synchronous FFI implementation lives in
 * ./screen-impl.ts and runs inside the worker.
 */

import { createDispatcher } from "./_dispatch";
import type { ScreenInfo } from "./screen-impl";
export type { ScreenInfo } from "./screen-impl";

// ffi/screen requires libraries that only exist on linux/win32/darwin.
// The worker performs the deeper availability check (libX11 on Linux)
// and will throw on first call if those libs aren't loadable.
if (!["linux", "win32", "darwin"].includes(process.platform)) {
  throw new Error("ffi/screen: unsupported platform");
}

const d = createDispatcher(require.resolve("./screen-worker"));

export const screen_synchronize = (): Promise<ScreenInfo[] | null> =>
  d.call("screen_synchronize", []);
export const screen_grabScreen = (
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> =>
  d.call("screen_grabScreen", [x, y, w, h, windowHandle]);
