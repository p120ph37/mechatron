/**
 * ffi clipboard backend (x11 variant) — Linux-only main-thread async
 * proxy to the dedicated clipboard-worker.ts.
 *
 * Mirrors napi[x11]'s background-thread architecture: the worker owns
 * an X display connection and runs the ICCCM CLIPBOARD selection
 * protocol, answering SelectionRequest events asynchronously while the
 * main thread is busy.  See clipboard-worker.ts for the X event loop.
 *
 * The base clipboard.ts throws on Linux so the backend resolver routes
 * here for `ffi[x11]`.  Wayland support is a future ffi[portal] variant.
 */

import { Worker } from "worker_threads";
import { getDisplay } from "./x11";

if (process.platform !== "linux") {
  throw new Error("ffi/clipboard-x11: linux-only variant");
}

// Fail-fast on the main thread before spawning the worker.  The worker
// would otherwise fail asynchronously on first call, at which point
// the backend resolver has already committed to this variant.
if (!getDisplay()) {
  throw new Error("ffi/clipboard-x11: requires libX11");
}

let _worker: Worker | null = null;
let _nextReqId = 1;
const _pending = new Map<number, (result: any) => void>();

function ensureWorker(): Worker | null {
  if (_worker) return _worker;
  try {
    // Bun resolves the .ts source directly; Node loads the compiled .js.
    _worker = new Worker(require.resolve("./clipboard-worker"));
  } catch {
    return null;
  }
  _worker.on("message", (data: any) => {
    const { id, result } = data;
    const r = _pending.get(id);
    if (r) {
      _pending.delete(id);
      r(result);
      // Idle: don't keep the process alive solely for the worker.
      if (_pending.size === 0) _worker?.unref();
    }
  });
  _worker.on("error", () => { /* swallow — worker crashes drop pending ops */ });
  // Start unref'd — only ref while a request is in flight.
  _worker.unref();
  return _worker;
}

function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = _nextReqId++;
  // Ref the worker so the main loop waits for the response.
  if (_pending.size === 0) w.ref();
  return new Promise<T | null>((resolve) => {
    _pending.set(id, resolve as (r: any) => void);
    w.postMessage({ id, op, args });
  });
}

export async function clipboard_clear(): Promise<boolean> {
  return (await call<boolean>("clear")) === true;
}

export async function clipboard_hasText(): Promise<boolean> {
  return (await call<boolean>("hasText")) === true;
}

export async function clipboard_getText(): Promise<string> {
  return (await call<string>("getText")) ?? "";
}

export async function clipboard_setText(text: string): Promise<boolean> {
  return (await call<boolean>("setText", { text })) === true;
}

export async function clipboard_hasImage(): Promise<boolean> {
  return (await call<boolean>("hasImage")) === true;
}

export async function clipboard_getImage(): Promise<{ width: number; height: number; data: Uint32Array } | null> {
  return await call<{ width: number; height: number; data: Uint32Array }>("getImage");
}

export async function clipboard_setImage(width: number, height: number, data: Uint32Array): Promise<boolean> {
  return (await call<boolean>("setImage", { width, height, data })) === true;
}

export async function clipboard_getSequence(): Promise<number> {
  return (await call<number>("sequence")) ?? 0;
}
