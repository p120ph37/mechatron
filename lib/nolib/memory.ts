/**
 * nolib memory backend — pure TypeScript, no native libraries.
 *
 * Linux: /proc/pid/mem for read/write, /proc/pid/maps for region enumeration.
 * Read/write via /proc/pid/mem requires same-user or CAP_SYS_PTRACE.
 * Other platforms: not available.
 */

import { openSync, readSync, writeSync, closeSync, readFileSync } from "fs";

const IS_LINUX = process.platform === "linux";
const PAGE_SIZE = 4096;

interface RegionInfo {
  valid: boolean;
  base: number;
  size: number;
  readable: boolean;
  writable: boolean;
  executable: boolean;
  private: boolean;
  guarded: boolean;
}

function parseRegions(pid: number): RegionInfo[] {
  let content: string;
  try {
    content = readFileSync(`/proc/${pid}/maps`, "utf8");
  } catch {
    return [];
  }
  const regions: RegionInfo[] = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    const m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+([rwxps-]{4})/);
    if (!m) continue;
    const base = parseInt(m[1], 16);
    const end = parseInt(m[2], 16);
    const perms = m[3];
    regions.push({
      valid: true,
      base,
      size: end - base,
      readable: perms[0] === "r",
      writable: perms[1] === "w",
      executable: perms[2] === "x",
      private: perms[3] === "p",
      guarded: false,
    });
  }
  return regions;
}

export function memory_isValid(pid: number): boolean {
  try {
    return require("fs").existsSync(`/proc/${pid}`);
  } catch {
    return false;
  }
}

export function memory_getRegions(pid: number): RegionInfo[] {
  return parseRegions(pid);
}

export function memory_getRegion(pid: number, address: number): RegionInfo {
  const regions = parseRegions(pid);
  for (const r of regions) {
    if (address >= r.base && address < r.base + r.size) return r;
  }
  return { valid: false, base: 0, size: 0, readable: false, writable: false, executable: false, private: false, guarded: false };
}

export function memory_getPageSize(): number {
  return PAGE_SIZE;
}

export function memory_getMinAddress(): number {
  return PAGE_SIZE;
}

export function memory_getMaxAddress(): number {
  return process.arch === "x64" || process.arch === "arm64"
    ? 0x7FFFFFFFFFFF
    : 0xBFFFFFFF;
}

export function memory_getPtrSize(pid: number): number {
  // Check if target is 64-bit via /proc/pid/exe ELF header
  try {
    const fd = openSync(`/proc/${pid}/exe`, "r");
    const hdr = Buffer.alloc(5);
    readSync(fd, hdr, 0, 5, 0);
    closeSync(fd);
    if (hdr[0] === 0x7f && hdr[1] === 0x45 && hdr[2] === 0x4c && hdr[3] === 0x46) {
      return hdr[4] === 2 ? 8 : 4; // EI_CLASS: 2=64bit, 1=32bit
    }
  } catch {}
  return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
}

export function memory_readData(pid: number, address: number, size: number, flags?: number): Buffer | null {
  try {
    const fd = openSync(`/proc/${pid}/mem`, "r");
    const buf = Buffer.alloc(size);
    const bytesRead = readSync(fd, buf, 0, size, address);
    closeSync(fd);
    return bytesRead > 0 ? buf.subarray(0, bytesRead) : null;
  } catch {
    return null;
  }
}

export function memory_writeData(pid: number, address: number, data: Buffer, flags?: number): number {
  try {
    const fd = openSync(`/proc/${pid}/mem`, "w");
    const written = writeSync(fd, data, 0, data.length, address);
    closeSync(fd);
    return written;
  } catch {
    return 0;
  }
}

export function memory_find(
  pid: number, pattern: Buffer, start: number, end: number, flags?: number,
): number {
  const regions = parseRegions(pid);
  for (const r of regions) {
    if (!r.readable) continue;
    const rEnd = r.base + r.size;
    if (rEnd <= start || r.base >= end) continue;
    const scanStart = Math.max(r.base, start);
    const scanEnd = Math.min(rEnd, end);
    const chunk = memory_readData(pid, scanStart, scanEnd - scanStart);
    if (!chunk) continue;
    const idx = chunk.indexOf(pattern);
    if (idx >= 0) return scanStart + idx;
  }
  return 0;
}

export function memory_setAccess(_pid: number, _address: number, _size: number, _access: number): boolean {
  // Can't change memory protection without mprotect/mach_vm_protect
  return false;
}

export function memory_setAccessFlags(_pid: number, _address: number, _size: number, _flags: number): boolean {
  return false;
}

export function memory_createCache(_pid: number, _address: number, _size: number, _blockSize: number, _maxBlocks?: number, _flags?: number): boolean {
  return false;
}

export function memory_clearCache(_pid: number): void {}

export function memory_deleteCache(_pid: number): void {}

export function memory_isCaching(_pid: number): boolean {
  return false;
}

export function memory_getCacheSize(_pid: number): number {
  return 0;
}

if (!IS_LINUX) {
  throw new Error("nolib/memory: requires Linux");
}
