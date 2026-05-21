/**
 * napi process backend — loads @mechatronic/napi-process .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("process");

export const process_open: (pid: number) => Promise<boolean> = native.process_open;
export const process_close: (pid: number) => Promise<void> = native.process_close;
export const process_isValid: (pid: number) => Promise<boolean> = native.process_isValid;
export const process_is64Bit: (pid: number) => Promise<boolean> = native.process_is64Bit;
export const process_isDebugged: (pid: number) => Promise<boolean> = native.process_isDebugged;
export const process_getHandle: (pid: number) => Promise<number> = native.process_getHandle;
export const process_getName: (pid: number) => Promise<string> = native.process_getName;
export const process_getPath: (pid: number) => Promise<string> = native.process_getPath;
export const process_exit: (pid: number) => Promise<void> = native.process_exit;
export const process_kill: (pid: number) => Promise<void> = native.process_kill;
export const process_hasExited: (pid: number) => Promise<boolean> = native.process_hasExited;
export const process_getCurrent: () => Promise<number> = native.process_getCurrent;
export const process_isSys64Bit: () => Promise<boolean> = native.process_isSys64Bit;
export const process_getList: (regex?: string) => Promise<number[]> = native.process_getList;
export const process_getModules: (pid: number, regex?: string) => Promise<any[]> = native.process_getModules;
export const process_getSegments: (pid: number, base: bigint) => Promise<any[]> = native.process_getSegments;
