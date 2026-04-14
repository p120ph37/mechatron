/**
 * Memory subsystem — pure FFI implementation.
 *
 * Linux: parses /proc/PID/maps and performs IO via libc.process_vm_readv /
 * libc.process_vm_writev.  Windows: VirtualQueryEx + ReadProcessMemory /
 * WriteProcessMemory + VirtualProtectEx.  macOS: throws.
 *
 * Mirrors the napi-rs `memory_*` exports.  All addresses cross the FFI
 * boundary as JS numbers (f64), matching the napi adapter — values up to
 * 2^53 are exact, which covers all current 64-bit user-mode ranges.
 */

import * as fs from "fs";

import { libc, libcFFI, _SC_PAGESIZE, makeIovec, makeRemoteIovec } from "./linux";
import { kernel32, winFFI } from "./win";
import {
  libc as mac, macFFI,
  VM_REGION_BASIC_INFO_64, VM_REGION_BASIC_INFO_COUNT_64,
  VM_PROT_READ, VM_PROT_WRITE, VM_PROT_EXECUTE,
  MAC_MIN_VM, MAC_MAX_VM_64,
  PROC_PIDT_SHORTBSDINFO, _SC_PAGESIZE as MAC_SC_PAGESIZE,
} from "./mac";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── Region shape (matches napi region_to_obj) ──────────────────────────

export interface RegionInfo {
  valid: boolean;
  bound: boolean;
  start: number;
  stop: number;
  size: number;
  readable: boolean;
  writable: boolean;
  executable: boolean;
  access: number;
  private: boolean;
  guarded: boolean;
}

function emptyRegion(): RegionInfo {
  return {
    valid: false, bound: false, start: 0, stop: 0, size: 0,
    readable: false, writable: false, executable: false,
    access: 0, private: false, guarded: false,
  };
}

// ── Flags ─────────────────────────────────────────────────────────────

const FLAG_DEFAULT     = 0;
const FLAG_SKIP_ERRORS = 1;
const FLAG_AUTO_ACCESS = 2;

// ── Linux internals ───────────────────────────────────────────────────

function isProcValid(pid: number): boolean {
  return pid > 0 && fs.existsSync(`/proc/${pid}`);
}

function parseMaps(pid: number): RegionInfo[] {
  const out: RegionInfo[] = [];
  let txt: string;
  try { txt = fs.readFileSync(`/proc/${pid}/maps`, "utf8"); }
  catch { return out; }
  for (const line of txt.split("\n")) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [s, e] = parts[0].split("-");
    if (!s || !e) continue;
    const start = parseInt(s, 16);
    const stop = parseInt(e, 16);
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

function linuxRead(pid: number, addr: number, buf: Uint8Array): number {
  const c = libc();
  const F = libcFFI();
  if (!c || !F || pid <= 0 || buf.length === 0) return 0;
  const local = makeIovec(F, buf);
  const remote = makeRemoteIovec(BigInt(addr), buf.length);
  const n = c.process_vm_readv(pid, F.ptr(local.iov) as any, 1n, F.ptr(remote) as any, 1n, 0n);
  return n < 0n ? 0 : Number(n);
}

function linuxWrite(pid: number, addr: number, buf: Uint8Array): number {
  const c = libc();
  const F = libcFFI();
  if (!c || !F || pid <= 0 || buf.length === 0) return 0;
  const local = makeIovec(F, buf);
  const remote = makeRemoteIovec(BigInt(addr), buf.length);
  const n = c.process_vm_writev(pid, F.ptr(local.iov) as any, 1n, F.ptr(remote) as any, 1n, 0n);
  return n < 0n ? 0 : Number(n);
}

// ── macOS internals ───────────────────────────────────────────────────

function macGetTask(pid: number): number {
  const m = mac();
  const F = macFFI();
  if (!m || !F || pid <= 0) return 0;
  const self = m.mach_task_self();
  const out = new Uint32Array(1);
  if (m.task_for_pid(self, pid, F.ptr(out)) !== 0) return 0;
  return out[0];
}

function macProcessExists(pid: number): boolean {
  const m = mac();
  const F = macFFI();
  if (!m || !F || pid <= 0) return false;
  if (m.kill(pid, 0) === 0) return true;
  // Fallback: proc_pidpath returns > 0 if the pid is valid.
  const buf = new Uint8Array(16);
  return m.proc_pidpath(pid, F.ptr(buf), buf.length) > 0;
}

/**
 * Read a single VM region using `mach_vm_region`.  Returns a RegionInfo
 * whose `bound` flag is true when the queried address falls within the
 * region, or false when `mach_vm_region` skipped past an unmapped gap.
 */
function macGetRegion(task: number, address: number): RegionInfo {
  const r = emptyRegion();
  if (task === 0) return r;
  const m = mac();
  const F = macFFI();
  if (!m || !F) return r;

  const base = new BigUint64Array(1);
  const size = new BigUint64Array(1);
  // vm_region_basic_info_64: 9 u32-words = 36 bytes.
  const info = new Uint8Array(36);
  const count = new Uint32Array([VM_REGION_BASIC_INFO_COUNT_64]);
  const port = new Uint32Array(1);
  base[0] = BigInt(address);
  if (m.mach_vm_region(
    task, F.ptr(base), F.ptr(size),
    VM_REGION_BASIC_INFO_64,
    F.ptr(info), F.ptr(count), F.ptr(port),
  ) !== 0) return r;

  const iv = new DataView(info.buffer);
  const protection = iv.getInt32(0, true);
  const shared = iv.getUint32(12, true);
  const start = Number(base[0]);
  const stop = start + Number(size[0]);

  if (stop > MAC_MAX_VM_64) return r;

  r.valid = true;
  r.start = address;
  if (start <= address && address < stop) {
    r.bound = true;
    r.stop = stop;
    r.size = stop - address;
    r.access = protection >>> 0;
    r.readable = (protection & VM_PROT_READ) !== 0;
    r.writable = (protection & VM_PROT_WRITE) !== 0;
    r.executable = (protection & VM_PROT_EXECUTE) !== 0;
    r.private = shared === 0;
  } else {
    // Unbound gap — address sits before this region.
    r.stop = start;
    r.size = start - address;
  }
  return r;
}

function macRead(task: number, address: number, buf: Uint8Array): number {
  const m = mac();
  const F = macFFI();
  if (!m || !F || task === 0 || buf.length === 0) return 0;
  const outSize = new BigUint64Array(1);
  const r = m.mach_vm_read_overwrite(
    task, BigInt(address), BigInt(buf.length),
    BigInt(F.ptr(buf) as any), F.ptr(outSize),
  );
  return r === 0 ? Number(outSize[0]) : 0;
}

function macWrite(task: number, address: number, buf: Uint8Array): number {
  const m = mac();
  const F = macFFI();
  if (!m || !F || task === 0 || buf.length === 0) return 0;
  const r = m.mach_vm_write(task, BigInt(address), BigInt(F.ptr(buf) as any), buf.length);
  return r === 0 ? buf.length : 0;
}

/** Walk all VM regions, returning those that intersect [start, stop). */
function macQueryRegions(task: number, start: number, stop: number): RegionInfo[] {
  const out: RegionInfo[] = [];
  if (task === 0) return out;
  let addr = Math.max(start, 0);
  for (;;) {
    if (addr >= stop) break;
    const r = macGetRegion(task, addr);
    if (!r.valid) break;
    if (r.bound) out.push(r);
    if (r.stop === 0 || r.stop <= addr) break;
    addr = r.stop;
  }
  return out;
}

// ── Windows internals ─────────────────────────────────────────────────

const PROCESS_QUERY_INFORMATION         = 0x0400;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_VM_READ                   = 0x0010;
const PROCESS_VM_WRITE                  = 0x0020;
const PROCESS_VM_OPERATION              = 0x0008;

const PAGE_NOACCESS          = 0x01;
const PAGE_READONLY          = 0x02;
const PAGE_READWRITE         = 0x04;
const PAGE_WRITECOPY         = 0x08;
const PAGE_EXECUTE           = 0x10;
const PAGE_EXECUTE_READ      = 0x20;
const PAGE_EXECUTE_READWRITE = 0x40;
const PAGE_EXECUTE_WRITECOPY = 0x80;
const PAGE_GUARD             = 0x100;

const MEM_COMMIT  = 0x1000;
const MEM_PRIVATE = 0x20000;

const MBI_SIZE = 48;

function winOpen(pid: number, access: number): bigint {
  const k = kernel32();
  if (!k || pid <= 0) return 0n;
  return BigInt(k.OpenProcess(access, 0, pid) as any);
}

function winClose(h: bigint): void {
  const k = kernel32();
  if (k && h !== 0n) k.CloseHandle(h);
}

function winProtectFlags(p: number): { readable: boolean; writable: boolean; executable: boolean; guarded: boolean; access: number } {
  const readable = (p & (PAGE_READONLY | PAGE_READWRITE | PAGE_EXECUTE_READ
    | PAGE_EXECUTE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_WRITECOPY)) !== 0;
  const writable = (p & (PAGE_READWRITE | PAGE_EXECUTE_READWRITE
    | PAGE_WRITECOPY | PAGE_EXECUTE_WRITECOPY)) !== 0;
  const executable = (p & (PAGE_EXECUTE | PAGE_EXECUTE_READ
    | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) !== 0;
  const guarded = (p & PAGE_GUARD) !== 0;
  let access = 0;
  if (readable)   access |= 1;
  if (writable)   access |= 2;
  if (executable) access |= 4;
  return { readable, writable, executable, guarded, access };
}

interface MBI {
  baseAddress: number;
  regionSize: number;
  state: number;
  protect: number;
  type: number;
}

function winQuery(h: bigint, addr: number): MBI | null {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F) return null;
  const buf = new Uint8Array(MBI_SIZE);
  const ret = k.VirtualQueryEx(h, BigInt(addr), F.ptr(buf), BigInt(MBI_SIZE));
  if (ret === 0n) return null;
  const dv = new DataView(buf.buffer);
  return {
    baseAddress: Number(dv.getBigUint64(0, true)),
    regionSize:  Number(dv.getBigUint64(24, true)),
    state:       dv.getUint32(32, true),
    protect:     dv.getUint32(36, true),
    type:        dv.getUint32(40, true),
  };
}

function winQueryRegions(pid: number, start: number, stop: number): RegionInfo[] {
  const out: RegionInfo[] = [];
  const h = winOpen(pid, PROCESS_QUERY_INFORMATION);
  if (h === 0n) return out;
  try {
    let addr = start;
    for (;;) {
      if (addr >= stop) break;
      const mbi = winQuery(h, addr);
      if (!mbi) break;
      const regionStart = mbi.baseAddress;
      const regionSize = mbi.regionSize;
      const regionEnd = regionStart + regionSize;
      if (mbi.state === MEM_COMMIT) {
        const f = winProtectFlags(mbi.protect);
        out.push({
          valid: true, bound: true,
          start: regionStart, stop: regionEnd, size: regionSize,
          readable: f.readable, writable: f.writable, executable: f.executable,
          access: f.access, private: mbi.type === MEM_PRIVATE, guarded: f.guarded,
        });
      }
      const next = regionEnd;
      if (next <= mbi.baseAddress) break;
      addr = next;
    }
  } finally {
    winClose(h);
  }
  return out;
}

function winRead(pid: number, addr: number, buf: Uint8Array): number {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F) return 0;
  const h = winOpen(pid, PROCESS_VM_READ);
  if (h === 0n) return 0;
  try {
    const n = new BigUint64Array(1);
    const ok = k.ReadProcessMemory(h, BigInt(addr), F.ptr(buf), BigInt(buf.length), F.ptr(n));
    return ok !== 0 ? Number(n[0]) : 0;
  } finally {
    winClose(h);
  }
}

function winWrite(pid: number, addr: number, buf: Uint8Array): number {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F) return 0;
  const h = winOpen(pid, PROCESS_VM_WRITE | PROCESS_VM_OPERATION);
  if (h === 0n) return 0;
  try {
    const n = new BigUint64Array(1);
    const ok = k.WriteProcessMemory(h, BigInt(addr), F.ptr(buf), BigInt(buf.length), F.ptr(n));
    return ok !== 0 ? Number(n[0]) : 0;
  } finally {
    winClose(h);
  }
}

function winSysInfo(): { pageSize: number; minAddr: number; maxAddr: number } {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F) return { pageSize: 4096, minAddr: 0, maxAddr: 0 };
  const buf = new Uint8Array(48);
  k.GetSystemInfo(F.ptr(buf));
  const dv = new DataView(buf.buffer);
  // SYSTEM_INFO on 64-bit:
  //   wProcessorArchitecture(u16@0)
  //   wReserved(u16@2)
  //   dwPageSize(u32@4)
  //   lpMinimumApplicationAddress(ptr@8)
  //   lpMaximumApplicationAddress(ptr@16)
  return {
    pageSize: dv.getUint32(4, true),
    minAddr:  Number(dv.getBigUint64(8, true)),
    maxAddr:  Number(dv.getBigUint64(16, true)),
  };
}

// ── Pattern parsing ───────────────────────────────────────────────────

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

// ── NAPI-compatible exports ───────────────────────────────────────────

export function memory_isValid(pid: number): boolean {
  if (IS_LINUX) return isProcValid(pid);
  if (IS_WIN) {
    const h = winOpen(pid, PROCESS_QUERY_LIMITED_INFORMATION);
    if (h === 0n) return false;
    winClose(h);
    return true;
  }
  if (IS_MAC) return macProcessExists(pid);
  return false;
}

export function memory_getRegion(pid: number, address: number): RegionInfo {
  if (IS_LINUX) {
    const regions = parseMaps(pid);
    for (const r of regions) {
      if (address >= r.start && address < r.stop) return r;
    }
    return emptyRegion();
  }
  if (IS_WIN) {
    const h = winOpen(pid, PROCESS_QUERY_INFORMATION);
    if (h === 0n) return emptyRegion();
    try {
      const mbi = winQuery(h, address);
      if (!mbi) return emptyRegion();
      const start = mbi.baseAddress;
      const size = mbi.regionSize;
      if (mbi.state !== MEM_COMMIT) {
        return {
          valid: true, bound: false,
          start, stop: start + size, size,
          readable: false, writable: false, executable: false,
          access: 0, private: false, guarded: false,
        };
      }
      const f = winProtectFlags(mbi.protect);
      return {
        valid: true, bound: true,
        start, stop: start + size, size,
        readable: f.readable, writable: f.writable, executable: f.executable,
        access: f.access, private: mbi.type === MEM_PRIVATE, guarded: f.guarded,
      };
    } finally {
      winClose(h);
    }
  }
  if (IS_MAC) {
    const task = macGetTask(pid);
    if (task === 0) return emptyRegion();
    return macGetRegion(task, address);
  }
  return emptyRegion();
}

export function memory_getRegions(pid: number, start?: number, stop?: number): RegionInfo[] {
  const startAddr = start || 0;
  const stopAddr = stop || Number.MAX_SAFE_INTEGER;
  if (IS_LINUX) {
    return parseMaps(pid).filter(r => r.stop > startAddr && r.start < stopAddr);
  }
  if (IS_WIN) {
    return winQueryRegions(pid, startAddr, stopAddr);
  }
  if (IS_MAC) {
    const task = macGetTask(pid);
    if (task === 0) return [];
    return macQueryRegions(task, startAddr, Math.min(stopAddr, MAC_MAX_VM_64));
  }
  return [];
}

export function memory_setAccess(pid: number, regionStart: number, readable: boolean, writable: boolean, executable: boolean): boolean {
  if (IS_LINUX) return false;
  if (IS_MAC) {
    let access = 0;
    if (readable)   access |= VM_PROT_READ;
    if (writable)   access |= VM_PROT_WRITE;
    if (executable) access |= VM_PROT_EXECUTE;
    return memory_setAccessFlags(pid, regionStart, access);
  }
  if (IS_WIN) {
    let access: number;
    if (executable) {
      if (writable) access = PAGE_EXECUTE_READWRITE;
      else if (readable) access = PAGE_EXECUTE_READ;
      else access = PAGE_EXECUTE;
    } else if (writable) access = PAGE_READWRITE;
    else if (readable) access = PAGE_READONLY;
    else access = PAGE_NOACCESS;
    return memory_setAccessFlags(pid, regionStart, access);
  }
  return false;
}

export function memory_setAccessFlags(pid: number, regionStart: number, flags: number): boolean {
  if (IS_LINUX) return false;
  if (IS_MAC) {
    const m = mac();
    if (!m) return false;
    const task = macGetTask(pid);
    if (task === 0) return false;
    const region = macGetRegion(task, regionStart);
    if (!region.valid || !region.bound) return false;
    return m.mach_vm_protect(task, BigInt(region.start), BigInt(region.size), 0, flags | 0) === 0;
  }
  if (IS_WIN) {
    const k = kernel32();
    const F = winFFI();
    if (!k || !F) return false;
    const h = winOpen(pid, PROCESS_VM_OPERATION);
    if (h === 0n) return false;
    try {
      const mbi = winQuery(h, regionStart);
      if (!mbi || mbi.state !== MEM_COMMIT) return false;
      const oldProt = new Uint32Array(1);
      const ok = k.VirtualProtectEx(h, BigInt(mbi.baseAddress), BigInt(mbi.regionSize), flags >>> 0, F.ptr(oldProt));
      return ok !== 0;
    } finally {
      winClose(h);
    }
  }
  return false;
}

export function memory_getPtrSize(pid: number): number {
  if (IS_MAC) {
    const m = mac();
    const F = macFFI();
    if (!m || !F || pid <= 0) return 0;
    // proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO=13, 0, buf, 232) fills a
    // 232-byte proc_bsdshortinfo.  Bit 0x04 of pbsi_flags (@offset 48) is
    // P_LP64; on modern arm64 macOS the kernel doesn't reliably set it,
    // so treat any successful call as 64-bit.
    const buf = new Uint8Array(232);
    const ret = m.proc_pidinfo(pid, PROC_PIDT_SHORTBSDINFO, 0n, F.ptr(buf), buf.length);
    if (ret > 0) {
      const flags = new DataView(buf.buffer).getUint32(48, true);
      if ((flags & 0x04) !== 0) return 8;
      // Fall back to "64-bit on modern macOS".
      return 8;
    }
    return 8;
  }
  if (IS_LINUX) {
    if (!isProcValid(pid)) return 0;
    try {
      const fd = fs.openSync(`/proc/${pid}/exe`, "r");
      const buf = Buffer.alloc(5);
      fs.readSync(fd, buf, 0, 5, 0);
      fs.closeSync(fd);
      if (buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46) {
        return buf[4] === 2 ? 8 : 4;
      }
    } catch { /* fall through */ }
    return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
  }
  if (IS_WIN) {
    const k = kernel32();
    const F = winFFI();
    if (!k || !F) return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
    const h = winOpen(pid, PROCESS_QUERY_LIMITED_INFORMATION);
    if (h === 0n) return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
    try {
      const wow = new Int32Array(1);
      if (k.IsWow64Process(h, F.ptr(wow)) !== 0) return wow[0] !== 0 ? 4 : 8;
      return process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
    } finally {
      winClose(h);
    }
  }
  return 0;
}

export function memory_getMinAddress(pid: number): number {
  if (IS_LINUX) {
    const regions = parseMaps(pid);
    return regions.length > 0 ? regions[0].start : 0;
  }
  if (IS_WIN) return winSysInfo().minAddr;
  if (IS_MAC) return MAC_MIN_VM;
  return 0;
}

export function memory_getMaxAddress(pid: number): number {
  if (IS_LINUX) {
    const regions = parseMaps(pid);
    return regions.length > 0 ? regions[regions.length - 1].stop : 0;
  }
  if (IS_WIN) return winSysInfo().maxAddr;
  if (IS_MAC) return MAC_MAX_VM_64;
  return 0;
}

export function memory_getPageSize(_pid: number): number {
  if (IS_LINUX) {
    const c = libc();
    if (!c) return 4096;
    return Number(c.sysconf(_SC_PAGESIZE));
  }
  if (IS_WIN) return winSysInfo().pageSize;
  if (IS_MAC) {
    const m = mac();
    return m ? Number(m.sysconf(MAC_SC_PAGESIZE)) : 16384;
  }
  return 4096;
}

export function memory_find(
  pid: number, pattern: string,
  start?: number, stop?: number,
  limit?: number, _flags?: string,
): number[] {
  const startAddr = start || 0;
  const stopAddr = stop || Number.MAX_SAFE_INTEGER;
  const max = limit && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
  const pat = parsePattern(pattern);
  const out: number[] = [];
  if (pat.length === 0) return out;

  const macTask = IS_MAC ? macGetTask(pid) : 0;
  const regions = IS_LINUX ? parseMaps(pid)
    : IS_WIN ? winQueryRegions(pid, startAddr, stopAddr)
    : IS_MAC ? macQueryRegions(macTask, startAddr, Math.min(stopAddr, MAC_MAX_VM_64))
    : [];

  const reader = IS_LINUX ? linuxRead
    : IS_WIN ? winRead
    : IS_MAC ? ((_pid: number, addr: number, buf: Uint8Array) => macRead(macTask, addr, buf))
    : null;
  if (!reader) return out;

  const CHUNK_CAP = 256 * 1024 * 1024;

  for (const region of regions) {
    if (out.length >= max) break;
    if (!region.readable) continue;
    if (region.stop <= startAddr || region.start >= stopAddr) continue;
    const readStart = Math.max(region.start, startAddr);
    const readEnd = Math.min(region.stop, stopAddr);
    const readSize = readEnd - readStart;
    if (readSize <= 0 || readSize > CHUNK_CAP) continue;
    const buf = new Uint8Array(readSize);
    const got = reader(pid, readStart, buf);
    if (got <= 0) continue;
    const hits = findInBuffer(buf, got, pat);
    for (const off of hits) {
      if (out.length >= max) break;
      out.push(readStart + off);
    }
  }
  return out;
}

export function memory_readData(pid: number, address: number, length: number, flags?: number): Buffer | null {
  const len = length | 0;
  if (len <= 0) return null;
  const f = flags === undefined ? FLAG_DEFAULT : flags;

  if (IS_LINUX) {
    if (f === FLAG_DEFAULT) {
      const buf = new Uint8Array(len);
      const got = linuxRead(pid, address, buf);
      return got > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
    }
    // SKIP_ERRORS / AUTO_ACCESS
    const buf = new Uint8Array(len);
    const stop = address + len;
    const regions = parseMaps(pid);
    let bytes = 0;
    let a = address;
    let idx = 0;
    while (a < stop && idx < regions.length) {
      while (idx < regions.length && regions[idx].stop <= a) idx++;
      if (idx >= regions.length) break;
      const region = regions[idx];
      if (region.start > a) {
        const gapEnd = Math.min(region.start, stop);
        bytes += gapEnd - a;
        a = gapEnd;
        continue;
      }
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      if (region.readable) {
        const slice = new Uint8Array(regionLen);
        const n = linuxRead(pid, a, slice);
        if (n > 0) buf.set(slice.subarray(0, n), offset);
      }
      bytes += regionLen;
      a = end;
      idx++;
    }
    bytes += Math.max(0, stop - a);
    return bytes > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  }

  if (IS_MAC) {
    const task = macGetTask(pid);
    if (task === 0) return null;
    if (f === FLAG_DEFAULT) {
      const buf = new Uint8Array(len);
      const got = macRead(task, address, buf);
      return got > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
    }
    // SkipErrors / AutoAccess — walk regions one at a time via mach_vm_region.
    const m = mac();
    const buf = new Uint8Array(len);
    const stop = address + len;
    let bytes = 0;
    let a = address;
    while (a < stop) {
      const region = macGetRegion(task, a);
      if (!region.valid) break;
      if (!region.bound) {
        const gapEnd = Math.min(region.stop, stop);
        bytes += gapEnd - a;
        a = gapEnd;
        if (a === 0 || region.stop === 0) break;
        continue;
      }
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      let readable = region.readable;
      if (!readable && f === FLAG_AUTO_ACCESS && m) {
        if (m.mach_vm_protect(task, BigInt(region.start), BigInt(region.size), 0, VM_PROT_READ) === 0) {
          readable = true;
          const slice = new Uint8Array(regionLen);
          const n = macRead(task, a, slice);
          if (n > 0) buf.set(slice.subarray(0, n), offset);
          m.mach_vm_protect(task, BigInt(region.start), BigInt(region.size), 0, region.access | 0);
        }
      } else if (readable) {
        const slice = new Uint8Array(regionLen);
        const n = macRead(task, a, slice);
        if (n > 0) buf.set(slice.subarray(0, n), offset);
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Math.max(0, stop - a);
    return bytes > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  }

  if (IS_WIN) {
    if (f === FLAG_DEFAULT) {
      const buf = new Uint8Array(len);
      const got = winRead(pid, address, buf);
      return got > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
    }
    const buf = new Uint8Array(len);
    const stop = address + len;
    const regions = winQueryRegions(pid, address, stop);
    let bytes = 0;
    let a = address;
    for (const region of regions) {
      if (a >= stop) break;
      if (region.start > a) {
        const gapEnd = Math.min(region.start, stop);
        bytes += gapEnd - a;
        a = gapEnd;
      }
      if (a >= stop) break;
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      let readable = region.readable;
      if (!readable && f === FLAG_AUTO_ACCESS) {
        const k = kernel32();
        const F = winFFI();
        if (k && F) {
          const h = winOpen(pid, PROCESS_VM_OPERATION);
          if (h !== 0n) {
            try {
              const oldProt = new Uint32Array(1);
              if (k.VirtualProtectEx(h, BigInt(a), BigInt(regionLen), PAGE_READONLY, F.ptr(oldProt)) !== 0) {
                readable = true;
                const slice = new Uint8Array(regionLen);
                const n = winRead(pid, a, slice);
                if (n > 0) buf.set(slice.subarray(0, n), offset);
                k.VirtualProtectEx(h, BigInt(a), BigInt(regionLen), oldProt[0], F.ptr(oldProt));
              }
            } finally {
              winClose(h);
            }
          }
        }
      } else if (readable) {
        const slice = new Uint8Array(regionLen);
        const n = winRead(pid, a, slice);
        if (n > 0) buf.set(slice.subarray(0, n), offset);
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Math.max(0, stop - a);
    return bytes > 0 ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : null;
  }

  throw new Error("memory: not implemented on this platform");
}

export function memory_writeData(pid: number, address: number, data: Buffer | Uint8Array, flags?: number): number {
  const f = flags === undefined ? FLAG_DEFAULT : flags;
  const buf: Uint8Array = data;
  const len = buf.length;
  if (len === 0) return 0;

  if (IS_LINUX) {
    if (f === FLAG_DEFAULT) return linuxWrite(pid, address, buf);
    const stop = address + len;
    const regions = parseMaps(pid);
    let bytes = 0;
    let a = address;
    for (const region of regions) {
      if (a >= stop) break;
      if (region.stop <= a) continue;
      if (region.start > a) {
        const gapEnd = Math.min(region.start, stop);
        bytes += gapEnd - a;
        a = gapEnd;
      }
      if (a >= stop) break;
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      if (region.writable) {
        linuxWrite(pid, a, buf.subarray(offset, offset + regionLen));
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Math.max(0, stop - a);
    return bytes;
  }

  if (IS_MAC) {
    const task = macGetTask(pid);
    if (task === 0) return 0;
    if (f === FLAG_DEFAULT) return macWrite(task, address, buf);
    const m = mac();
    const stop = address + len;
    let bytes = 0;
    let a = address;
    while (a < stop) {
      const region = macGetRegion(task, a);
      if (!region.valid) break;
      if (!region.bound) {
        const gapEnd = Math.min(region.stop, stop);
        bytes += gapEnd - a;
        a = gapEnd;
        if (a === 0 || region.stop === 0) break;
        continue;
      }
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      let writable = region.writable;
      if (!writable && f === FLAG_AUTO_ACCESS && m) {
        if (m.mach_vm_protect(task, BigInt(region.start), BigInt(region.size), 0, VM_PROT_READ | VM_PROT_WRITE) === 0) {
          writable = true;
          macWrite(task, a, buf.subarray(offset, offset + regionLen));
          m.mach_vm_protect(task, BigInt(region.start), BigInt(region.size), 0, region.access | 0);
        }
      } else if (writable) {
        macWrite(task, a, buf.subarray(offset, offset + regionLen));
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Math.max(0, stop - a);
    return bytes;
  }

  if (IS_WIN) {
    if (f === FLAG_DEFAULT) return winWrite(pid, address, buf);
    const stop = address + len;
    const regions = winQueryRegions(pid, address, stop);
    let bytes = 0;
    let a = address;
    for (const region of regions) {
      if (a >= stop) break;
      if (region.start > a) {
        const gapEnd = Math.min(region.start, stop);
        bytes += gapEnd - a;
        a = gapEnd;
      }
      if (a >= stop) break;
      const end = Math.min(region.stop, stop);
      const regionLen = end - a;
      const offset = a - address;
      let writable = region.writable;
      if (!writable && f === FLAG_AUTO_ACCESS) {
        const k = kernel32();
        const F = winFFI();
        if (k && F) {
          const h = winOpen(pid, PROCESS_VM_OPERATION);
          if (h !== 0n) {
            try {
              const oldProt = new Uint32Array(1);
              if (k.VirtualProtectEx(h, BigInt(a), BigInt(regionLen), PAGE_READWRITE, F.ptr(oldProt)) !== 0) {
                writable = true;
                winWrite(pid, a, buf.subarray(offset, offset + regionLen));
                k.VirtualProtectEx(h, BigInt(a), BigInt(regionLen), oldProt[0], F.ptr(oldProt));
              }
            } finally {
              winClose(h);
            }
          }
        }
      } else if (writable) {
        winWrite(pid, a, buf.subarray(offset, offset + regionLen));
      }
      bytes += regionLen;
      a = end;
    }
    bytes += Math.max(0, stop - a);
    return bytes;
  }

  throw new Error("memory: not implemented on this platform");
}

// ── Cache stubs (match napi behavior) ─────────────────────────────────

export function memory_createCache(_pid: number, _addr: number, _size: number, _block: number, _max?: number, _flags?: number): boolean { return false; }
export function memory_clearCache(_pid: number): void { /* no-op */ }
export function memory_deleteCache(_pid: number): void { /* no-op */ }
export function memory_isCaching(_pid: number): boolean { return false; }
export function memory_getCacheSize(_pid: number): number { return 0; }
