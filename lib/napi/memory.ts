/**
 * napi memory backend — loads @mechatronic/napi-memory .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("memory");

export const memory_isValid: (pid: number) => Promise<boolean> = native.memory_isValid;
export const memory_getRegions: (pid: number, start?: bigint, stop?: bigint) => Promise<any[]> = native.memory_getRegions;
export const memory_getRegion: (pid: number, address: bigint) => Promise<any | null> = native.memory_getRegion;
export const memory_getPageSize: (pid: number) => Promise<number> = native.memory_getPageSize;
export const memory_getMinAddress: (pid: number) => Promise<bigint> = native.memory_getMinAddress;
export const memory_getMaxAddress: (pid: number) => Promise<bigint> = native.memory_getMaxAddress;
export const memory_getPtrSize: (pid: number) => Promise<number> = native.memory_getPtrSize;
export const memory_readData: (pid: number, address: bigint, size: number, flags?: number) => Promise<Buffer | null> = native.memory_readData;
export const memory_writeData: (pid: number, address: bigint, data: Buffer, flags?: number) => Promise<number> = native.memory_writeData;
export const memory_find: (pid: number, pattern: string, start?: bigint, stop?: bigint, limit?: number, flags?: string) => Promise<bigint[]> = native.memory_find;
export const memory_setAccess: (pid: number, address: bigint, readable: boolean, writable: boolean, executable: boolean) => Promise<boolean> = native.memory_setAccess;
export const memory_setAccessFlags: (pid: number, address: bigint, flags: number) => Promise<boolean> = native.memory_setAccessFlags;
export const memory_bufferAddress: (buf: Buffer) => bigint = native.memory_bufferAddress;
