/**
 * Generic Worker-based async dispatcher for FFI subsystems.
 *
 * Mirrors napi[*]'s libuv worker-pool semantics: each subsystem's FFI
 * implementation runs in a dedicated `worker_threads.Worker`; the main
 * thread posts `{ id, op, args }` messages and resolves a Promise per
 * id when the worker posts back `{ id, result }` or `{ id, error }`.
 *
 * Each subsystem owns one worker that holds its dlopen'd library
 * handles and module-level caches. The worker is spawned lazily on
 * first call and is `.unref()`-ed when idle so it doesn't keep the
 * process alive.
 *
 * The clipboard subsystem has its own bespoke worker (clipboard-worker.ts)
 * because it must run an X event loop to answer SelectionRequest events
 * asynchronously; this generic dispatcher is for the simpler subsystems
 * whose operations are one-shot synchronous FFI calls.
 */

import { Worker } from "worker_threads";

export interface Dispatcher {
  call<T = any>(op: string, args?: unknown[]): Promise<T>;
}

interface PendingEntry {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export function createDispatcher(workerPath: string): Dispatcher {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, PendingEntry>();

  function ensure(): Worker {
    if (worker) return worker;
    worker = new Worker(workerPath);
    worker.on("message", (data: { id: number; result?: any; error?: string }) => {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error !== undefined) {
        entry.reject(new Error(data.error));
      } else {
        entry.resolve(data.result);
      }
      if (pending.size === 0) worker?.unref();
    });
    worker.on("error", (err: Error) => {
      // Worker crashed — reject all pending and reset.
      const entries = [...pending.values()];
      pending.clear();
      worker = null;
      for (const e of entries) e.reject(err);
    });
    worker.unref();
    return worker;
  }

  function call<T>(op: string, args: unknown[] = []): Promise<T> {
    const w = ensure();
    const id = nextId++;
    if (pending.size === 0) w.ref();
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, op, args });
    });
  }

  return { call };
}

/**
 * Worker-side message loop. Imports the synchronous implementation
 * module and dispatches `{ id, op, args }` requests to the matching
 * exported function, posting back `{ id, result }` or `{ id, error }`.
 *
 * Usage in a `<sub>-worker.ts`:
 *   import * as impl from "./<sub>-impl";
 *   import { runWorker } from "./_dispatch";
 *   runWorker(impl);
 */
export function runWorker(impl: Record<string, any>): void {
  const { parentPort } = require("worker_threads");
  if (!parentPort) {
    throw new Error("runWorker must be called from a Worker context");
  }
  parentPort.on("message", async (msg: { id: number; op: string; args: unknown[] }) => {
    try {
      const fn = impl[msg.op];
      if (typeof fn !== "function") {
        throw new Error(`unknown op: ${msg.op}`);
      }
      const result = await fn(...(msg.args ?? []));
      parentPort.postMessage({ id: msg.id, result });
    } catch (err: any) {
      parentPort.postMessage({ id: msg.id, error: err?.message || String(err) });
    }
  });
}
