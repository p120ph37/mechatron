/**
 * ffi process backend — main-thread async proxy to process-worker.ts.
 *
 * Each export posts an `{ op, args }` message to the dedicated worker
 * thread (see ./process-worker.ts) and resolves a Promise when the
 * worker posts back a result. This mirrors napi[*]'s libuv worker-pool
 * semantics (AsyncTask::compute runs off the main JS thread); the
 * synchronous FFI implementation lives in ./process-impl.ts and runs
 * inside the worker.
 */

import { createDispatcher } from "./_dispatch";
import type { ModuleEntry, SegmentEntry } from "./process-impl";
export type { ModuleEntry, SegmentEntry } from "./process-impl";

const d = createDispatcher(require.resolve("./process-worker"));

export const process_open = (pid: number): Promise<boolean> =>
  d.call("process_open", [pid]);
export const process_close = (pid: number): Promise<void> =>
  d.call("process_close", [pid]);
export const process_isValid = (pid: number): Promise<boolean> =>
  d.call("process_isValid", [pid]);
export const process_is64Bit = (pid: number): Promise<boolean> =>
  d.call("process_is64Bit", [pid]);
export const process_isDebugged = (pid: number): Promise<boolean> =>
  d.call("process_isDebugged", [pid]);
export const process_getPID = (pid: number): Promise<number> =>
  d.call("process_getPID", [pid]);
export const process_getHandle = (pid: number): Promise<number> =>
  d.call("process_getHandle", [pid]);
export const process_getName = (pid: number): Promise<string> =>
  d.call("process_getName", [pid]);
export const process_getPath = (pid: number): Promise<string> =>
  d.call("process_getPath", [pid]);
export const process_exit = (pid: number): Promise<void> =>
  d.call("process_exit", [pid]);
export const process_kill = (pid: number): Promise<void> =>
  d.call("process_kill", [pid]);
export const process_hasExited = (pid: number): Promise<boolean> =>
  d.call("process_hasExited", [pid]);
export const process_getModules = (pid: number, regexStr?: string): Promise<ModuleEntry[]> =>
  d.call("process_getModules", [pid, regexStr]);
export const process_getList = (regexStr?: string): Promise<number[]> =>
  d.call("process_getList", [regexStr]);
export const process_getCurrent = (): Promise<number> =>
  d.call("process_getCurrent", []);
export const process_isSys64Bit = (): Promise<boolean> =>
  d.call("process_isSys64Bit", []);
export const process_getSegments = (pid: number, base: bigint): Promise<SegmentEntry[]> =>
  d.call("process_getSegments", [pid, base]);
