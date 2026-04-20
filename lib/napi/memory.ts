/**
 * napi memory backend — loads @mechatronic/napi-memory .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("memory");

export const memory_isValid: (pid: number) => boolean = native.memory_isValid;
export const memory_getRegions: (pid: number, start?: number, stop?: number) => any[] = native.memory_getRegions;
export const memory_getRegion: (pid: number, address: number) => any | null = native.memory_getRegion;
export const memory_getPageSize: (pid: number) => number = native.memory_getPageSize;
export const memory_getMinAddress: (pid: number) => number = native.memory_getMinAddress;
export const memory_getMaxAddress: (pid: number) => number = native.memory_getMaxAddress;
export const memory_getPtrSize: (pid: number) => number = native.memory_getPtrSize;
export const memory_readData: (pid: number, address: number, size: number, flags?: number) => Buffer | null = native.memory_readData;
export const memory_writeData: (pid: number, address: number, data: Buffer, flags?: number) => number = native.memory_writeData;
export const memory_find: (pid: number, pattern: string, start?: number, stop?: number, limit?: number, flags?: string) => number[] = native.memory_find;
export const memory_setAccess: (pid: number, address: number, readable: boolean, writable: boolean, executable: boolean) => boolean = native.memory_setAccess;
export const memory_setAccessFlags: (pid: number, address: number, flags: number) => boolean = native.memory_setAccessFlags;
export const memory_createCache: (pid: number, address: number, size: number, blockSize: number, maxBlocks?: number, flags?: number) => boolean = native.memory_createCache;
export const memory_clearCache: (pid: number) => void = native.memory_clearCache;
export const memory_deleteCache: (pid: number) => void = native.memory_deleteCache;
export const memory_isCaching: (pid: number) => boolean = native.memory_isCaching;
export const memory_getCacheSize: (pid: number) => number = native.memory_getCacheSize;
