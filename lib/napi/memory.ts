/**
 * napi memory backend — loads @mechatronic/napi-memory .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("memory");

export const memory_isValid: (pid: number) => boolean = native.memory_isValid;
export const memory_getRegions: (pid: number, start?: bigint, stop?: bigint) => any[] = native.memory_getRegions;
export const memory_getRegion: (pid: number, address: bigint) => any | null = native.memory_getRegion;
export const memory_getPageSize: (pid: number) => number = native.memory_getPageSize;
export const memory_getMinAddress: (pid: number) => bigint = native.memory_getMinAddress;
export const memory_getMaxAddress: (pid: number) => bigint = native.memory_getMaxAddress;
export const memory_getPtrSize: (pid: number) => number = native.memory_getPtrSize;
export const memory_readData: (pid: number, address: bigint, size: number, flags?: number) => Buffer | null = native.memory_readData;
export const memory_writeData: (pid: number, address: bigint, data: Buffer, flags?: number) => number = native.memory_writeData;
export const memory_find: (pid: number, pattern: string, start?: bigint, stop?: bigint, limit?: number, flags?: string) => bigint[] = native.memory_find;
export const memory_setAccess: (pid: number, address: bigint, readable: boolean, writable: boolean, executable: boolean) => boolean = native.memory_setAccess;
export const memory_setAccessFlags: (pid: number, address: bigint, flags: number) => boolean = native.memory_setAccessFlags;
