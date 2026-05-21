/**
 * ffi window backend — main-thread async proxy to window-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./window-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics (AsyncTask::compute runs off the main JS thread); the
 * synchronous FFI implementation lives in ./window-impl.ts and runs
 * inside the worker.
 */

import { createDispatcher } from "./_dispatch";

const d = createDispatcher(require.resolve("./window-worker"));

export const window_isValid = (handle: bigint): Promise<boolean> =>
  d.call("window_isValid", [handle]);
export const window_close = (handle: bigint): Promise<void> =>
  d.call("window_close", [handle]);
export const window_isTopMost = (handle: bigint): Promise<boolean> =>
  d.call("window_isTopMost", [handle]);
export const window_isBorderless = (handle: bigint): Promise<boolean> =>
  d.call("window_isBorderless", [handle]);
export const window_isMinimized = (handle: bigint): Promise<boolean> =>
  d.call("window_isMinimized", [handle]);
export const window_isMaximized = (handle: bigint): Promise<boolean> =>
  d.call("window_isMaximized", [handle]);

export const window_setTopMost = (handle: bigint, topMost: boolean): Promise<void> =>
  d.call("window_setTopMost", [handle, topMost]);
export const window_setBorderless = (handle: bigint, borderless: boolean): Promise<void> =>
  d.call("window_setBorderless", [handle, borderless]);
export const window_setMinimized = (handle: bigint, minimized: boolean): Promise<void> =>
  d.call("window_setMinimized", [handle, minimized]);
export const window_setMaximized = (handle: bigint, maximized: boolean): Promise<void> =>
  d.call("window_setMaximized", [handle, maximized]);

export const window_getProcess = (handle: bigint): Promise<number> =>
  d.call("window_getProcess", [handle]);
export const window_getPID = (handle: bigint): Promise<number> =>
  d.call("window_getPID", [handle]);
export const window_getHandle = (handle: bigint): Promise<bigint> =>
  d.call("window_getHandle", [handle]);
export const window_setHandle = (handle: bigint, newHandle: bigint): Promise<boolean> =>
  d.call("window_setHandle", [handle, newHandle]);

export const window_getTitle = (handle: bigint): Promise<string> =>
  d.call("window_getTitle", [handle]);
export const window_setTitle = (handle: bigint, title: string): Promise<void> =>
  d.call("window_setTitle", [handle, title]);

export const window_getBounds = (handle: bigint): Promise<{ x: number; y: number; w: number; h: number }> =>
  d.call("window_getBounds", [handle]);
export const window_setBounds = (handle: bigint, x: number, y: number, w: number, h: number): Promise<void> =>
  d.call("window_setBounds", [handle, x, y, w, h]);
export const window_getClient = (handle: bigint): Promise<{ x: number; y: number; w: number; h: number }> =>
  d.call("window_getClient", [handle]);
export const window_setClient = (handle: bigint, x: number, y: number, w: number, h: number): Promise<void> =>
  d.call("window_setClient", [handle, x, y, w, h]);

export const window_mapToClient = (handle: bigint, x: number, y: number): Promise<{ x: number; y: number }> =>
  d.call("window_mapToClient", [handle, x, y]);
export const window_mapToScreen = (handle: bigint, x: number, y: number): Promise<{ x: number; y: number }> =>
  d.call("window_mapToScreen", [handle, x, y]);

export const window_getList = (regexStr?: string): Promise<bigint[]> =>
  d.call("window_getList", [regexStr]);
export const window_getActive = (): Promise<bigint> =>
  d.call("window_getActive", []);
export const window_setActive = (handle: bigint): Promise<void> =>
  d.call("window_setActive", [handle]);

export const window_isAxEnabled = (prompt?: boolean): Promise<boolean> =>
  d.call("window_isAxEnabled", [prompt]);
