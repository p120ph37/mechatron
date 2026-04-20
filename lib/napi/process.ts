/**
 * napi process backend — loads @mechatronic/napi-process .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("process");

export const process_open: (pid: number) => boolean = native.process_open;
export const process_close: (pid: number) => void = native.process_close;
export const process_isValid: (pid: number) => boolean = native.process_isValid;
export const process_is64Bit: (pid: number) => boolean = native.process_is64Bit;
export const process_isDebugged: (pid: number) => boolean = native.process_isDebugged;
export const process_getHandle: (pid: number) => number = native.process_getHandle;
export const process_getName: (pid: number) => string = native.process_getName;
export const process_getPath: (pid: number) => string = native.process_getPath;
export const process_exit: (pid: number) => void = native.process_exit;
export const process_kill: (pid: number) => void = native.process_kill;
export const process_hasExited: (pid: number) => boolean = native.process_hasExited;
export const process_getCurrent: () => number = native.process_getCurrent;
export const process_isSys64Bit: () => boolean = native.process_isSys64Bit;
export const process_getList: (regex?: string) => number[] = native.process_getList;
export const process_getWindows: (pid: number, regex?: string) => number[] = native.process_getWindows;
export const process_getModules: (pid: number, regex?: string) => any[] = native.process_getModules;
export const process_getSegments: (pid: number, base: number) => any[] = native.process_getSegments;
