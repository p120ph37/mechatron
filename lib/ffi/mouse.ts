/**
 * ffi mouse backend — main-thread async proxy to mouse-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./mouse-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics; the synchronous FFI implementation lives in
 * ./mouse-impl.ts and runs inside the worker.
 */

import { createDispatcher } from "./_dispatch";

// ffi/mouse requires libraries that only exist on linux/win32/darwin.
// The worker performs the deeper availability check (libXtst / uinput on
// Linux) and will throw on first call if those libs aren't loadable.
if (!["linux", "win32", "darwin"].includes(process.platform)) {
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
