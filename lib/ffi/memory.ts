/**
 * ffi memory backend — main-thread async proxy to memory-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./memory-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics; the synchronous FFI implementation lives in ./memory-impl.ts
 * and runs inside the worker.
 *
 * Exception: `memory_bufferAddress` is re-exported synchronously from
 * the impl module. Buffer pointer addresses are only meaningful in the
 * calling thread/process, so this op must NOT be routed through the
 * worker.
 */

import { createDispatcher } from "./_dispatch";
import type { RegionInfo } from "./memory-impl";
export type { RegionInfo } from "./memory-impl";

const d = createDispatcher(require.resolve("./memory-worker"));

export const memory_isValid = (pid: number): Promise<boolean> =>
  d.call("memory_isValid", [pid]);
export const memory_getRegion = (pid: number, address: bigint): Promise<RegionInfo> =>
  d.call("memory_getRegion", [pid, address]);
export const memory_getRegions = (pid: number, start?: bigint, stop?: bigint): Promise<RegionInfo[]> =>
  d.call("memory_getRegions", [pid, start, stop]);
export const memory_setAccess = (
  pid: number, regionStart: bigint,
  readable: boolean, writable: boolean, executable: boolean,
): Promise<boolean> =>
  d.call("memory_setAccess", [pid, regionStart, readable, writable, executable]);
export const memory_setAccessFlags = (pid: number, regionStart: bigint, flags: number): Promise<boolean> =>
  d.call("memory_setAccessFlags", [pid, regionStart, flags]);
export const memory_getPtrSize = (pid: number): Promise<number> =>
  d.call("memory_getPtrSize", [pid]);
export const memory_getMinAddress = (pid: number): Promise<bigint> =>
  d.call("memory_getMinAddress", [pid]);
export const memory_getMaxAddress = (pid: number): Promise<bigint> =>
  d.call("memory_getMaxAddress", [pid]);
export const memory_getPageSize = (pid: number): Promise<number> =>
  d.call("memory_getPageSize", [pid]);
export const memory_find = (
  pid: number, pattern: string,
  start?: bigint, stop?: bigint,
  limit?: number, flags?: string,
): Promise<bigint[]> =>
  d.call("memory_find", [pid, pattern, start, stop, limit, flags]);
export const memory_readData = async (
  pid: number, address: bigint, length: number, flags?: number,
): Promise<Buffer | null> => {
  // Worker postMessage demotes Buffer to Uint8Array (structured clone).
  // Re-wrap so callers retain the Buffer API (.copy etc).
  const u8 = await d.call<Uint8Array | null>("memory_readData", [pid, address, length, flags]);
  return u8 ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) : null;
};
export const memory_writeData = (
  pid: number, address: bigint, data: Buffer | Uint8Array, flags?: number,
): Promise<number> =>
  d.call("memory_writeData", [pid, address, data, flags]);

// Pure pointer math — must run on the calling thread, never via the worker.
export { memory_bufferAddress } from "./memory-impl";
