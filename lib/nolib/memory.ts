/**
 * nolib memory backend — pure TypeScript, no native libraries.
 *
 * Linux only: /proc/pid/mem for read/write, /proc/pid/maps for region
 * enumeration.  Read/write via /proc/pid/mem requires same-user or
 * CAP_SYS_PTRACE.
 */

import { promises as fsp, type promises as Fsp } from "fs";

type FileHandle = Fsp.FileHandle;

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

async function parseMaps(pid: number): Promise<RegionInfo[]> {
  let txt: string;
  try { txt = await fsp.readFile(`/proc/${pid}/maps`, "utf8"); }
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

async function procRead(pid: number, addr: bigint, buf: Uint8Array): Promise<number> {
  if (buf.length === 0) return 0;
  let fh: FileHandle;
  try { fh = await fsp.open(`/proc/${pid}/mem`, "r"); }
  catch { return 0; }
  try {
    const { bytesRead } = await fh.read(buf, 0, buf.length, Number(addr));
    return bytesRead;
  } catch {
    return 0;
  } finally {
    try { await fh.close(); } catch {}
  }
}

async function procReadFh(fh: FileHandle, addr: bigint, buf: Uint8Array): Promise<number> {
  if (buf.length === 0) return 0;
  try {
    const { bytesRead } = await fh.read(buf, 0, buf.length, Number(addr));
    return bytesRead;
  } catch {
    return 0;
  }
}

async function procWrite(pid: number, addr: bigint, buf: Uint8Array): Promise<number> {
  if (buf.length === 0) return 0;
  let fh: FileHandle;
  try { fh = await fsp.open(`/proc/${pid}/mem`, "r+"); }
  catch { return 0; }
  try {
    const { bytesWritten } = await fh.write(buf, 0, buf.length, Number(addr));
    return bytesWritten;
  } catch {
    return 0;
  } finally {
    try { await fh.close(); } catch {}
  }
}

async function procWriteFh(fh: FileHandle, addr: bigint, buf: Uint8Array): Promise<number> {
  if (buf.length === 0) return 0;
  try {
    const { bytesWritten } = await fh.write(buf, 0, buf.length, Number(addr));
    return bytesWritten;
  } catch {
    return 0;
  }
}

// Read AT_PAGESZ from /proc/self/auxv
let cachedPageSize = 0;
async function getPageSize(): Promise<number> {
  if (cachedPageSize > 0) return cachedPageSize;
  try {
    const buf = await fsp.readFile("/proc/self/auxv");
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

export async function memory_isValid(pid: number): Promise<boolean> {
  if (pid <= 0) return false;
  try {
    await fsp.access(`/proc/${pid}`);
    return true;
  } catch {
    return false;
  }
}

export async function memory_getRegion(pid: number, address: bigint): Promise<RegionInfo> {
  const regions = await parseMaps(pid);
  for (const r of regions) {
    if (address >= r.start && address < r.stop) return r;
  }
  return emptyRegion();
}

export async function memory_getRegions(pid: number, start?: bigint, stop?: bigint): Promise<RegionInfo[]> {
  const startAddr = start ?? 0n;
  const stopAddr = stop ?? BigInt(Number.MAX_SAFE_INTEGER);
  const regions = await parseMaps(pid);
  return regions.filter(r => r.stop > startAddr && r.start < stopAddr);
}

export async function memory_setAccess(_pid: number, _regionStart: bigint, _readable: boolean, _writable: boolean, _executable: boolean): Promise<boolean> {
  return false;
}

export async function memory_setAccessFlags(_pid: number, _regionStart: bigint, _flags: number): Promise<boolean> {
  return false;
}

export async function memory_getPtrSize(pid: number): Promise<number> {
  if (!(await memory_isValid(pid))) return 0;
  try {
    const fh = await fsp.open(`/proc/${pid}/exe`, "r");
    try {
      const hdr = Buffer.alloc(5);
      await fh.read(hdr, 0, 5, 0);
      if (hdr[0] === 0x7F && hdr[1] === 0x45 && hdr[2] === 0x4C && hdr[3] === 0x46) {
        return hdr[4] === 2 ? 8 : 4;
      }
    } finally {
      try { await fh.close(); } catch {}
    }
  } catch {}
  return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
}

export async function memory_getMinAddress(pid: number): Promise<bigint> {
  const regions = await parseMaps(pid);
  return regions.length > 0 ? regions[0].start : 0n;
}

export async function memory_getMaxAddress(pid: number): Promise<bigint> {
  const regions = await parseMaps(pid);
  return regions.length > 0 ? regions[regions.length - 1].stop : 0n;
}

export async function memory_getPageSize(_pid: number): Promise<number> {
  return getPageSize();
}

export async function memory_readData(pid: number, address: bigint, length: number, flags?: number): Promise<Buffer | null> {
  const len = length | 0;
  if (len <= 0) return null;
  const f = flags === undefined ? FLAG_DEFAULT : flags;

  if (f === FLAG_DEFAULT) {
    const buf = new Uint8Array(len);
    const got = await procRead(pid, address, buf);
    return got > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  }

  // FLAG_SKIP_ERRORS / FLAG_AUTO_ACCESS (auto_access degrades to skip on Linux)
  let fh: FileHandle;
  try { fh = await fsp.open(`/proc/${pid}/mem`, "r"); }
  catch { return null; }
  try {
    const buf = new Uint8Array(len);
    const stop = address + BigInt(len);
    const regions = await parseMaps(pid);
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
        const n = await procReadFh(fh, a, slice);
        if (n > 0) buf.set(slice.subarray(0, n), offset);
      }
      bytes += regionLen;
      a = end;
      idx++;
    }
    bytes += Number(stop > a ? stop - a : 0n);
    return bytes > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  } finally {
    try { await fh.close(); } catch {}
  }
}

export async function memory_writeData(pid: number, address: bigint, data: Buffer | Uint8Array, flags?: number): Promise<number> {
  const f = flags === undefined ? FLAG_DEFAULT : flags;
  const buf: Uint8Array = data;
  const len = buf.length;
  if (len === 0) return 0;

  if (f === FLAG_DEFAULT) return procWrite(pid, address, buf);

  let fh: FileHandle;
  try { fh = await fsp.open(`/proc/${pid}/mem`, "r+"); }
  catch { return 0; }
  try {
    const stop = address + BigInt(len);
    const regions = await parseMaps(pid);
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
        await procWriteFh(fh, a, buf.subarray(offset, offset + regionLen));
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Number(stop > a ? stop - a : 0n);
    return bytes;
  } finally {
    try { await fh.close(); } catch {}
  }
}

export async function memory_find(
  pid: number, pattern: string,
  start?: bigint, stop?: bigint,
  limit?: number, _flags?: string,
): Promise<bigint[]> {
  const startAddr = start ?? 0n;
  const stopAddr = stop ?? BigInt(Number.MAX_SAFE_INTEGER);
  const max = limit && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
  const pat = parsePattern(pattern);
  const out: bigint[] = [];
  if (pat.length === 0) return out;

  const regions = await parseMaps(pid);
  const CHUNK_CAP = 256 * 1024 * 1024;

  let fh: FileHandle;
  try { fh = await fsp.open(`/proc/${pid}/mem`, "r"); }
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
      const got = await procReadFh(fh, readStart, buf);
      if (got <= 0) continue;
      const hits = findInBuffer(buf, got, pat);
      for (const off of hits) {
        if (out.length >= max) break;
        out.push(readStart + BigInt(off));
      }
    }
  } finally {
    try { await fh.close(); } catch {}
  }
  return out;
}

// Sync because the public API (Memory.addressOf) is synchronous, matching
// the napi-rs export.  Pointer extraction must run on the calling thread
// anyway — a worker thread address would be unrelated to the caller's
// Buffer.
export function memory_bufferAddress(buf: Buffer): bigint {
  // Pure-TS has no way to obtain a Buffer's native address; defer to bun:ffi's
  // pointer-extraction primitive (lib/ffi/bun.ts:bp), the one ffi function
  // that has no nolib equivalent.  Under Node.js, bun:ffi is unavailable and
  // this throws — that's a fundamental runtime limitation, not a missing
  // implementation.
  const { getBunFFI, bp } = require("../ffi/bun") as typeof import("../ffi/bun");
  if (!getBunFFI()) {
    throw new Error("memory_bufferAddress: requires Bun runtime (bun:ffi for pointer access)");
  }
  return bp(buf);
}
