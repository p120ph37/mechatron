/**
 * nolib memory backend — pure TypeScript, no native libraries.
 *
 * Linux only: /proc/pid/mem for read/write, /proc/pid/maps for region
 * enumeration.  Read/write via /proc/pid/mem requires same-user or
 * CAP_SYS_PTRACE.
 */

import { openSync, readSync, writeSync, closeSync, readFileSync, existsSync } from "fs";

if (process.platform !== "linux") {
  throw new Error("nolib/memory: requires Linux");
}

// ── Region shape (matches napi/ffi RegionInfo) ───────────────────────

export interface RegionInfo {
  valid: boolean;
  bound: boolean;
  start: bigint;
  stop: bigint;
  size: bigint;
  readable: boolean;
  writable: boolean;
  executable: boolean;
  access: number;
  private: boolean;
  guarded: boolean;
}

function emptyRegion(): RegionInfo {
  return {
    valid: false, bound: false, start: 0n, stop: 0n, size: 0n,
    readable: false, writable: false, executable: false,
    access: 0, private: false, guarded: false,
  };
}

// ── Flags ────────────────────────────────────────────────────────────

const FLAG_DEFAULT     = 0;
const FLAG_SKIP_ERRORS = 1;
const FLAG_AUTO_ACCESS = 2;

// ── Internal helpers ─────────────────────────────────────────────────

function parseMaps(pid: number): RegionInfo[] {
  let txt: string;
  try { txt = readFileSync(`/proc/${pid}/maps`, "utf8"); }
  catch { return []; }
  const out: RegionInfo[] = [];
  for (const line of txt.split("\n")) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [s, e] = parts[0].split("-");
    if (!s || !e) continue;
    const start = BigInt("0x" + s);
    const stop = BigInt("0x" + e);
    const perms = parts[1] || "";
    const readable = perms.includes("r");
    const writable = perms.includes("w");
    const executable = perms.includes("x");
    const isPrivate = perms.includes("p");
    let access = 0;
    if (readable)   access |= 1;
    if (writable)   access |= 2;
    if (executable) access |= 4;
    out.push({
      valid: true, bound: true, start, stop, size: stop - start,
      readable, writable, executable, access,
      private: isPrivate, guarded: false,
    });
  }
  return out;
}

function procRead(pid: number, addr: bigint, buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let fd: number;
  try { fd = openSync(`/proc/${pid}/mem`, "r"); }
  catch { return 0; }
  try {
    return readSync(fd, buf, 0, buf.length, Number(addr));
  } catch {
    return 0;
  } finally {
    closeSync(fd);
  }
}

function procReadFd(fd: number, addr: bigint, buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  try {
    return readSync(fd, buf, 0, buf.length, Number(addr));
  } catch {
    return 0;
  }
}

function procWrite(pid: number, addr: bigint, buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let fd: number;
  try { fd = openSync(`/proc/${pid}/mem`, "r+"); }
  catch { return 0; }
  try {
    return writeSync(fd, buf, 0, buf.length, Number(addr));
  } catch {
    return 0;
  } finally {
    closeSync(fd);
  }
}

function procWriteFd(fd: number, addr: bigint, buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  try {
    return writeSync(fd, buf, 0, buf.length, Number(addr));
  } catch {
    return 0;
  }
}

// Read AT_PAGESZ from /proc/self/auxv
let cachedPageSize = 0;
function getPageSize(): number {
  if (cachedPageSize > 0) return cachedPageSize;
  try {
    const buf = readFileSync("/proc/self/auxv");
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const is64 = process.arch === "x64" || process.arch === "arm64";
    const entrySize = is64 ? 16 : 8;
    const AT_PAGESZ = 6;
    for (let i = 0; i + entrySize <= buf.length; i += entrySize) {
      const type = is64 ? Number(dv.getBigUint64(i, true)) : dv.getUint32(i, true);
      if (type === 0) break;
      if (type === AT_PAGESZ) {
        cachedPageSize = is64 ? Number(dv.getBigUint64(i + 8, true)) : dv.getUint32(i + 4, true);
        return cachedPageSize;
      }
    }
  } catch {}
  cachedPageSize = 4096;
  return cachedPageSize;
}

// ── Pattern parsing ──────────────────────────────────────────────────

function parsePattern(pattern: string): (number | null)[] {
  const out: (number | null)[] = [];
  for (const tok of pattern.split(/\s+/)) {
    if (!tok) continue;
    if (tok === "??" || tok === "?") { out.push(null); continue; }
    const v = parseInt(tok, 16);
    if (!Number.isNaN(v) && v >= 0 && v <= 0xFF) out.push(v);
  }
  return out;
}

function findInBuffer(buf: Uint8Array, len: number, pat: (number | null)[]): number[] {
  const hits: number[] = [];
  if (pat.length === 0 || pat.length > len) return hits;
  const last = len - pat.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < pat.length; j++) {
      const p = pat[j];
      if (p !== null && buf[i + j] !== p) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

// ── NAPI-compatible exports ──────────────────────────────────────────

export function memory_isValid(pid: number): boolean {
  return pid > 0 && existsSync(`/proc/${pid}`);
}

export function memory_getRegion(pid: number, address: bigint): RegionInfo {
  const regions = parseMaps(pid);
  for (const r of regions) {
    if (address >= r.start && address < r.stop) return r;
  }
  return emptyRegion();
}

export function memory_getRegions(pid: number, start?: bigint, stop?: bigint): RegionInfo[] {
  const startAddr = start ?? 0n;
  const stopAddr = stop ?? BigInt(Number.MAX_SAFE_INTEGER);
  return parseMaps(pid).filter(r => r.stop > startAddr && r.start < stopAddr);
}

export function memory_setAccess(_pid: number, _regionStart: bigint, _readable: boolean, _writable: boolean, _executable: boolean): boolean {
  return false;
}

export function memory_setAccessFlags(_pid: number, _regionStart: bigint, _flags: number): boolean {
  return false;
}

export function memory_getPtrSize(pid: number): number {
  if (!memory_isValid(pid)) return 0;
  try {
    const fd = openSync(`/proc/${pid}/exe`, "r");
    try {
      const hdr = Buffer.alloc(5);
      readSync(fd, hdr, 0, 5, 0);
      if (hdr[0] === 0x7F && hdr[1] === 0x45 && hdr[2] === 0x4C && hdr[3] === 0x46) {
        return hdr[4] === 2 ? 8 : 4;
      }
    } finally {
      closeSync(fd);
    }
  } catch {}
  return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
}

export function memory_getMinAddress(pid: number): bigint {
  const regions = parseMaps(pid);
  return regions.length > 0 ? regions[0].start : 0n;
}

export function memory_getMaxAddress(pid: number): bigint {
  const regions = parseMaps(pid);
  return regions.length > 0 ? regions[regions.length - 1].stop : 0n;
}

export function memory_getPageSize(_pid: number): number {
  return getPageSize();
}

export function memory_readData(pid: number, address: bigint, length: number, flags?: number): Buffer | null {
  const len = length | 0;
  if (len <= 0) return null;
  const f = flags === undefined ? FLAG_DEFAULT : flags;

  if (f === FLAG_DEFAULT) {
    const buf = new Uint8Array(len);
    const got = procRead(pid, address, buf);
    return got > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  }

  // FLAG_SKIP_ERRORS / FLAG_AUTO_ACCESS (auto_access degrades to skip on Linux)
  let fd: number;
  try { fd = openSync(`/proc/${pid}/mem`, "r"); }
  catch { return null; }
  try {
    const buf = new Uint8Array(len);
    const stop = address + BigInt(len);
    const regions = parseMaps(pid);
    let bytes = 0;
    let a = address;
    let idx = 0;
    while (a < stop && idx < regions.length) {
      while (idx < regions.length && regions[idx].stop <= a) idx++;
      if (idx >= regions.length) break;
      const region = regions[idx];
      if (region.start > a) {
        const gapEnd = region.start < stop ? region.start : stop;
        bytes += Number(gapEnd - a);
        a = gapEnd;
        continue;
      }
      const end = region.stop < stop ? region.stop : stop;
      const regionLen = Number(end - a);
      const offset = Number(a - address);
      if (region.readable) {
        const slice = new Uint8Array(regionLen);
        const n = procReadFd(fd, a, slice);
        if (n > 0) buf.set(slice.subarray(0, n), offset);
      }
      bytes += regionLen;
      a = end;
      idx++;
    }
    bytes += Number(stop > a ? stop - a : 0n);
    return bytes > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  } finally {
    closeSync(fd);
  }
}

export function memory_writeData(pid: number, address: bigint, data: Buffer | Uint8Array, flags?: number): number {
  const f = flags === undefined ? FLAG_DEFAULT : flags;
  const buf: Uint8Array = data;
  const len = buf.length;
  if (len === 0) return 0;

  if (f === FLAG_DEFAULT) return procWrite(pid, address, buf);

  let fd: number;
  try { fd = openSync(`/proc/${pid}/mem`, "r+"); }
  catch { return 0; }
  try {
    const stop = address + BigInt(len);
    const regions = parseMaps(pid);
    let bytes = 0;
    let a = address;
    for (const region of regions) {
      if (a >= stop) break;
      if (region.stop <= a) continue;
      if (region.start > a) {
        const gapEnd = region.start < stop ? region.start : stop;
        bytes += Number(gapEnd - a);
        a = gapEnd;
      }
      if (a >= stop) break;
      const end = region.stop < stop ? region.stop : stop;
      const regionLen = Number(end - a);
      const offset = Number(a - address);
      if (region.writable) {
        procWriteFd(fd, a, buf.subarray(offset, offset + regionLen));
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Number(stop > a ? stop - a : 0n);
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export function memory_find(
  pid: number, pattern: string,
  start?: bigint, stop?: bigint,
  limit?: number, _flags?: string,
): bigint[] {
  const startAddr = start ?? 0n;
  const stopAddr = stop ?? BigInt(Number.MAX_SAFE_INTEGER);
  const max = limit && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
  const pat = parsePattern(pattern);
  const out: bigint[] = [];
  if (pat.length === 0) return out;

  const regions = parseMaps(pid);
  const CHUNK_CAP = 256 * 1024 * 1024;

  let fd: number;
  try { fd = openSync(`/proc/${pid}/mem`, "r"); }
  catch { return out; }
  try {
    for (const region of regions) {
      if (out.length >= max) break;
      if (!region.readable) continue;
      if (region.stop <= startAddr || region.start >= stopAddr) continue;
      const readStart = region.start > startAddr ? region.start : startAddr;
      const readEnd = region.stop < stopAddr ? region.stop : stopAddr;
      const readSize = Number(readEnd - readStart);
      if (readSize <= 0 || readSize > CHUNK_CAP) continue;
      const buf = new Uint8Array(readSize);
      const got = procReadFd(fd, readStart, buf);
      if (got <= 0) continue;
      const hits = findInBuffer(buf, got, pat);
      for (const off of hits) {
        if (out.length >= max) break;
        out.push(readStart + BigInt(off));
      }
    }
  } finally {
    closeSync(fd);
  }
  return out;
}
