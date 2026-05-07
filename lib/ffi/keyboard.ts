/**
 * ffi keyboard backend — main-thread async proxy to keyboard-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./keyboard-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics; the synchronous FFI implementation lives in
 * ./keyboard-impl.ts and runs inside the worker.
 */

import { createDispatcher } from "./_dispatch";

// ffi/keyboard requires libraries that only exist on linux/win32/darwin.
// The worker performs the deeper availability check (libXtst / uinput on
// Linux) and will throw on first call if those libs aren't loadable.
if (!["linux", "win32", "darwin"].includes(process.platform)) {
  throw new Error("ffi/keyboard: unsupported platform");
}

const d = createDispatcher(require.resolve("./keyboard-worker"));

export const keyboard_press = (keycode: number): Promise<void> =>
  d.call("keyboard_press", [keycode]);
export const keyboard_release = (keycode: number): Promise<void> =>
  d.call("keyboard_release", [keycode]);
export const keyboard_getKeyState = (keycode: number): Promise<boolean> =>
  d.call("keyboard_getKeyState", [keycode]);
