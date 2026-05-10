/**
 * ffi clipboard backend (portal variant) — Linux-only main-thread async
 * proxy to the dedicated clipboard-portal-worker.ts.
 *
 * Mirrors napi[portal]'s background-thread architecture: the worker owns
 * a Wayland display connection and talks wl_data_device / zwlr_data_control
 * to manage clipboard state.  Background selection events are handled
 * asynchronously by the worker while the main thread is busy.
 *
 * The base clipboard.ts throws on Linux so the backend resolver routes
 * here for `ffi[portal]`.  See clipboard-portal-worker.ts for the
 * Wayland protocol implementation.
 */

import { Worker } from "worker_threads";
import { loadWayland } from "./wayland";

if (process.platform !== "linux") {
  throw new Error("ffi/clipboard-portal: linux-only variant");
}

const isWayland = !!process.env.WAYLAND_DISPLAY
  || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
if (!isWayland) {
  throw new Error("ffi/clipboard-portal: requires Wayland session");
}

if (!loadWayland()) {
  throw new Error("ffi/clipboard-portal: requires libwayland-client");
}

let _worker: Worker | null = null;
let _nextReqId = 1;
const _pending = new Map<number, (result: any) => void>();

function ensureWorker(): Worker | null {
  if (_worker) return _worker;
  try {
    _worker = new Worker(require.resolve("./clipboard-portal-worker"));
  } catch {
    return null;
  }
  _worker.on("message", (data: any) => {
    const { id, result } = data;
    const r = _pending.get(id);
    if (r) {
      _pending.delete(id);
      r(result);
      if (_pending.size === 0) _worker?.unref();
    }
  });
  _worker.on("error", () => { /* swallow — worker crashes drop pending ops */ });
  _worker.unref();
  return _worker;
}

function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = _nextReqId++;
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
