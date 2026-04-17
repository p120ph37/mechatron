/**
 * Process subsystem — pure FFI implementation.
 *
 * Linux: /proc filesystem (read via Node `fs`) + libc.kill().  Windows: psapi
 * + kernel32.  macOS: libproc (proc_pidpath/proc_name/proc_listallpids) +
 * mach (task_for_pid, task_info/TASK_DYLD_INFO, task_get_exception_ports).
 *
 * Mirrors the napi-rs `process_*` exports (js_name) one-for-one so the
 * unified loader can swap in this module transparently.
 */

import * as fs from "fs";
import * as path from "path";

import { libc, libcFFI, SIGTERM, SIGKILL } from "./linux";
import {
  user32, kernel32, psapi, winFFI,
  w2js, js2w,
} from "./win";
import { getXConnection } from "./xconn";
import type { XConnection } from "../x11proto/conn";
import {
  libc as mac, macFFI, bufToStr,
  TASK_DYLD_INFO, TASK_DYLD_INFO_COUNT,
  EXC_MASK_ALL, EXC_MASK_RESOURCE, EXC_MASK_GUARD, EXC_TYPES_COUNT,
} from "./mac";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

interface ModuleEntry { valid: boolean; name: string; path: string; base: number; size: number; pid: number; }

// ── Helpers (Linux) ─────────────────────────────────────────────────────

interface LinuxProcInfo {
  name: string;
  path: string;
  is64: boolean;
}

function procInfo(pid: number): LinuxProcInfo | null {
  if (pid <= 0) return null;
  const dir = `/proc/${pid}`;
  if (!fs.existsSync(dir)) return null;
  let p = "";
  let name = "";
  let is64 = process.arch === "x64" || process.arch === "arm64";
  try {
    p = fs.readlinkSync(`/proc/${pid}/exe`);
    name = path.basename(p);
  } catch { /* permissions */ }
  try {
    const fd = fs.openSync(`/proc/${pid}/exe`, "r");
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46) {
      is64 = buf[4] === 2;
    }
  } catch { /* permissions */ }
  return { name, path: p, is64 };
}

function procHasExited(pid: number): boolean {
  if (pid <= 0) return true;
  return !fs.existsSync(`/proc/${pid}`);
}

// ── Helpers (Windows) ──────────────────────────────────────────────────

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_QUERY_INFORMATION         = 0x0400;
const PROCESS_VM_READ                   = 0x0010;
const PROCESS_VM_WRITE                  = 0x0020;
const PROCESS_VM_OPERATION              = 0x0008;
const PROCESS_TERMINATE                 = 0x0001;
const PROCESS_NAME_WIN32                = 0;
const STILL_ACTIVE                      = 259;
const LIST_MODULES_ALL                  = 0x03;
const WM_CLOSE                          = 0x0010;

function winOpenProcess(pid: number, access: number): bigint {
  const k = kernel32();
  if (!k || pid <= 0) return 0n;
  const h = k.OpenProcess(access, 0, pid);
  return BigInt(h as any);
}

function winCloseHandle(h: bigint): void {
  const k = kernel32();
  if (k && h !== 0n) k.CloseHandle(h);
}

function winGetPath(pid: number): string {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F) return "";
  const h = winOpenProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION);
  if (h === 0n) return "";
  try {
    const buf = new Uint16Array(1024);
    const size = new Uint32Array([buf.length]);
    if (k.QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, F.ptr(buf), F.ptr(size)) !== 0) {
      return w2js(buf, size[0]).replace(/\\/g, "/");
    }
    return "";
  } finally {
    winCloseHandle(h);
  }
}

function winGetName(pid: number): string {
  const p = winGetPath(pid);
  if (!p) return "";
  return p.substring(p.lastIndexOf("/") + 1);
}

function winHasExited(pid: number): boolean {
  const k = kernel32();
  const F = winFFI();
  if (!k || !F || pid <= 0) return true;
  const h = winOpenProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION);
  if (h === 0n) return true;
  try {
    const code = new Uint32Array(1);
    if (k.GetExitCodeProcess(h, F.ptr(code)) !== 0) {
      return code[0] !== STILL_ACTIVE;
    }
    return true;
  } finally {
    winCloseHandle(h);
  }
}

// ── Helpers (macOS) ────────────────────────────────────────────────────

// Mach port of the target process's task.  Requires the calling process to
// have the `com.apple.security.cs.debugger` entitlement (or be root, or be
// running a signed debugger target); otherwise `task_for_pid` returns a
// non-zero error and we fall back to "task == 0" paths that still let PID
// enumeration / paths / names work.
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
  if (!m || pid <= 0) return false;
  // kill(pid, 0) → 0 if we can signal, -1 otherwise.  EPERM means process
  // exists but we lack permission; ESRCH means no such process.  We don't
  // have a clean way to read errno from libSystem via bun:ffi, so accept
  // both "exists" and "permission denied" cases by treating any outcome
  // from proc_pidpath as authoritative — if proc_pidpath returns > 0, the
  // PID is valid regardless of whether kill() succeeded.
  if (m.kill(pid, 0) === 0) return true;
  // kill failed — check whether it's EPERM (process exists but permission
  // denied) by probing proc_pidpath, which doesn't require a task port.
  const buf = new Uint8Array(16);
  const F = macFFI();
  if (!F) return false;
  return m.proc_pidpath(pid, F.ptr(buf), buf.length) > 0;
}

function macGetPath(pid: number): string {
  const m = mac();
  const F = macFFI();
  if (!m || !F || pid <= 0) return "";
  const PATH_MAX = 1024;
  const buf = new Uint8Array(PATH_MAX);
  const len = m.proc_pidpath(pid, F.ptr(buf), buf.length);
  return len > 0 ? bufToStr(buf, len) : "";
}

function macGetName(pid: number): string {
  const m = mac();
  const F = macFFI();
  if (!m || !F || pid <= 0) return "";
  const buf = new Uint8Array(256);
  const len = m.proc_name(pid, F.ptr(buf), buf.length);
  if (len > 0) return bufToStr(buf, len);
  const p = macGetPath(pid);
  return p ? p.substring(p.lastIndexOf("/") + 1) : "";
}

function macIsDebugged(pid: number): boolean {
  const m = mac();
  const F = macFFI();
  if (!m || !F) return false;
  const task = macGetTask(pid);
  if (task === 0) return false;
  const masks = new Uint32Array(EXC_TYPES_COUNT);
  const ports = new Uint32Array(EXC_TYPES_COUNT);
  const behaviors = new Uint32Array(EXC_TYPES_COUNT);
  const flavors = new Uint32Array(EXC_TYPES_COUNT);
  const count = new Uint32Array(1);
  const excMask = (EXC_MASK_ALL & ~(EXC_MASK_RESOURCE | EXC_MASK_GUARD)) >>> 0;
  if (m.task_get_exception_ports(
    task, excMask,
    F.ptr(masks), F.ptr(count),
    F.ptr(ports), F.ptr(behaviors), F.ptr(flavors),
  ) !== 0) return false;
  const n = count[0];
  for (let i = 0; i < n; i++) {
    const p = ports[i];
    if (p !== 0 && p !== 0xFFFFFFFF) return true;
  }
  return false;
}

function macGetModules(pid: number, re: RegExp | null): ModuleEntry[] {
  const out: ModuleEntry[] = [];
  const m = mac();
  const F = macFFI();
  if (!m || !F) return out;
  const task = macGetTask(pid);
  if (task === 0) return out;

  // TASK_DYLD_INFO — count is in "natural_t" (u32) units of 4 bytes each;
  // the struct is 24 bytes so TASK_DYLD_INFO_COUNT = 6.  But we want to
  // transfer two u64s + one i32 = 20 bytes; we zero the last 4 bytes and
  // let task_info overwrite only what it needs.
  const dyld = new BigUint64Array(3); // 24 bytes
  const dyldCount = new Uint32Array([TASK_DYLD_INFO_COUNT]);
  if (m.task_info(task, TASK_DYLD_INFO, F.ptr(dyld), F.ptr(dyldCount)) !== 0) return out;
  const allImageInfoAddr = dyld[0];
  const allImageInfoSize = dyld[1];
  if (allImageInfoAddr === 0n || allImageInfoSize === 0n) return out;

  // Read dyld_all_image_infos.  We only need version(u32), count(u32),
  // array(u64) — the first 16 bytes — but let's read up to 64 bytes to be
  // safe on newer dyld layouts.
  const headerSize = 16;
  const readSize = Number(allImageInfoSize) < headerSize ? Number(allImageInfoSize) : headerSize;
  const header = new Uint8Array(headerSize);
  const outSize = new BigUint64Array(1);
  if (m.mach_vm_read_overwrite(
    task, allImageInfoAddr, BigInt(readSize),
    BigInt(F.ptr(header) as any), F.ptr(outSize),
  ) !== 0 || outSize[0] < BigInt(readSize)) return out;
  const hdv = new DataView(header.buffer);
  const imgCount = hdv.getUint32(4, true);
  // array pointer is u64 at offset 8
  const arrayAddr = hdv.getBigUint64(8, true);
  if (imgCount === 0 || arrayAddr === 0n) return out;

  // Read ImageInfo64[count]: { addr:u64, path:u64, date:u64 } = 24 bytes each.
  const infoStride = 24;
  const infosBytes = infoStride * imgCount;
  const infos = new Uint8Array(infosBytes);
  const outInfos = new BigUint64Array(1);
  if (m.mach_vm_read_overwrite(
    task, arrayAddr, BigInt(infosBytes),
    BigInt(F.ptr(infos) as any), F.ptr(outInfos),
  ) !== 0 || outInfos[0] < BigInt(infosBytes)) return out;
  const idv = new DataView(infos.buffer);

  // First entry is the executable itself; use proc_pidpath for name/path
  const procPath = macGetPath(pid);

  const PATH_MAX = 1024;
  const pathBuf = new Uint8Array(PATH_MAX);
  const outPath = new BigUint64Array(1);

  interface Row { addr: bigint; name: string; p: string; }
  const rows: Row[] = [];
  for (let i = 0; i < imgCount; i++) {
    const off = i * infoStride;
    const addr = idv.getBigUint64(off, true);
    const pathAddr = idv.getBigUint64(off + 8, true);

    let resolved = "";
    let name = "";
    if (i === 0 && procPath) {
      resolved = procPath;
      name = procPath.substring(procPath.lastIndexOf("/") + 1);
    } else {
      if (pathAddr === 0n) continue;
      outPath[0] = 0n;
      if (m.mach_vm_read_overwrite(
        task, pathAddr, BigInt(PATH_MAX),
        BigInt(F.ptr(pathBuf) as any), F.ptr(outPath),
      ) !== 0 || outPath[0] === 0n) continue;
      const raw = bufToStr(pathBuf, Number(outPath[0]));
      if (!raw) continue;
      // Resolve via realpath (frees the returned buffer).
      try {
        const cstrBuf = new TextEncoder().encode(raw);
        const zeroTerm = new Uint8Array(cstrBuf.length + 1);
        zeroTerm.set(cstrBuf);
        const rp = m.realpath(F.ptr(zeroTerm), null);
        if (rp && (rp as any) !== 0n) {
          // Read the returned C string via the FFI CString helper.
          // `new CString(ptr)` returns a String-wrapper object; coerce to
          // a primitive string (otherwise `typeof` reports "object").
          const CString = (F as any).CString;
          resolved = CString ? String(new CString(rp)) : raw;
          m.free(rp);
        } else {
          resolved = raw;
        }
      } catch { resolved = raw; }
      name = resolved.substring(resolved.lastIndexOf("/") + 1);
    }

    if (re && !re.test(name)) continue;
    rows.push({ addr, name, p: resolved });
  }

  // Sort + dedupe by address, matching the napi implementation.
  rows.sort((a, b) => (a.addr < b.addr ? -1 : a.addr > b.addr ? 1 : 0));
  let lastAddr: bigint | null = null;
  for (const r of rows) {
    if (lastAddr !== null && r.addr === lastAddr) continue;
    lastAddr = r.addr;
    out.push({ valid: true, name: r.name, path: r.p, base: Number(r.addr), size: 0, pid });
  }
  return out;
}

function macGetList(re: RegExp | null): number[] {
  const m = mac();
  const F = macFFI();
  const out: number[] = [];
  if (!m || !F) return out;
  // First call with null to get count
  const count = m.proc_listallpids(null, 0);
  if (count <= 0) return out;
  const bufI32 = new Int32Array(count + 64);
  const bufBytes = bufI32.byteLength;
  const actual = m.proc_listallpids(F.ptr(bufI32), bufBytes);
  if (actual <= 0) return out;
  const n = (actual / 4) | 0;
  for (let i = 0; i < n; i++) {
    const pid = bufI32[i];
    if (pid <= 0) continue;
    if (re) {
      const name = macGetName(pid);
      if (!name || !re.test(name)) continue;
    }
    out.push(pid);
  }
  return out;
}

// ── Linux X11 window enumeration (PID-filtered) ────────────────────────

function makeRegex(s?: string): RegExp | null {
  if (!s) return null;
  try { return new RegExp(s); } catch { return null; }
}

async function xGetWindowPid(c: XConnection, win: number): Promise<number> {
  const wmPid = await c.internAtom("_NET_WM_PID", true);
  if (wmPid === 0) return 0;
  try {
    const gp = await c.getProperty({ window: win, property: wmPid });
    if (gp.format !== 32 || gp.value.length < 4) return 0;
    return gp.value.readUInt32LE(0);
  } catch {
    return 0;
  }
}

async function xGetWindowTitle(c: XConnection, win: number): Promise<string> {
  const wmName = await c.internAtom("_NET_WM_NAME", true);
  if (wmName !== 0) {
    try {
      const gp = await c.getProperty({ window: win, property: wmName });
      if (gp.value.length > 0) return gp.value.toString("utf8");
    } catch {}
  }
  const xaWmName = await c.internAtom("WM_NAME", false);
  if (xaWmName !== 0) {
    try {
      const gp = await c.getProperty({ window: win, property: xaWmName });
      if (gp.value.length > 0) return gp.value.toString("utf8");
    } catch {}
  }
  return "";
}

async function xWinIsValid(c: XConnection, win: number): Promise<boolean> {
  if (win === 0) return false;
  const wmPid = await c.internAtom("_NET_WM_PID", true);
  if (wmPid === 0) return false;
  try {
    const gp = await c.getProperty({ window: win, property: wmPid });
    return gp.format !== 0 && gp.value.length > 0;
  } catch {
    return false;
  }
}

async function xEnumWindows(
  c: XConnection, win: number, re: RegExp | null, pidFilter: number, out: number[],
): Promise<void> {
  try {
    const attr = await c.getWindowAttributes(win);
    if (attr.mapState === 2 && await xWinIsValid(c, win)) {
      const pid = pidFilter === 0 ? -1 : await xGetWindowPid(c, win);
      if (pidFilter === 0 || pid === pidFilter) {
        let ok = true;
        if (re) {
          const t = await xGetWindowTitle(c, win);
          ok = re.test(t);
        }
        if (ok) out.push(win);
      }
    }
  } catch {}
  try {
    const qt = await c.queryTree(win);
    for (const child of qt.children) {
      await xEnumWindows(c, child, re, pidFilter, out);
    }
  } catch {}
}

// ── NAPI-compatible exports ────────────────────────────────────────────

export function process_open(pid: number): boolean {
  if (IS_LINUX) return procInfo(pid) !== null;
  if (IS_WIN) {
    const access = PROCESS_VM_OPERATION | PROCESS_VM_READ
      | PROCESS_QUERY_INFORMATION | PROCESS_VM_WRITE | PROCESS_TERMINATE;
    const h = winOpenProcess(pid, access);
    if (h === 0n) return false;
    winCloseHandle(h);
    return true;
  }
  if (IS_MAC) return macProcessExists(pid);
  throw new Error("process: not implemented on this platform");
}

export function process_close(_pid: number): void { /* no-op */ }

export function process_isValid(pid: number): boolean {
  if (IS_LINUX) return procInfo(pid) !== null;
  if (IS_WIN) {
    const h = winOpenProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION);
    if (h === 0n) return false;
    winCloseHandle(h);
    return true;
  }
  if (IS_MAC) return macProcessExists(pid);
  return false;
}

export function process_is64Bit(pid: number): boolean {
  if (IS_LINUX) {
    const i = procInfo(pid);
    return i ? i.is64 : false;
  }
  if (IS_WIN) {
    const k = kernel32();
    const F = winFFI();
    if (!k || !F) return false;
    const h = winOpenProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION);
    if (h === 0n) return false;
    try {
      const wow = new Int32Array(1);
      if (k.IsWow64Process(h, F.ptr(wow)) !== 0) return wow[0] === 0;
      return process.arch === "x64" || process.arch === "arm64";
    } finally {
      winCloseHandle(h);
    }
  }
  if (IS_MAC) return true; // macOS dropped 32-bit processes in Catalina
  return false;
}

export function process_isDebugged(pid: number): boolean {
  if (IS_LINUX) {
    try {
      const txt = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      for (const line of txt.split("\n")) {
        if (line.startsWith("TracerPid:")) {
          return line.substring("TracerPid:".length).trim() !== "0";
        }
      }
    } catch { /* not found */ }
    return false;
  }
  if (IS_WIN) {
    const k = kernel32();
    const F = winFFI();
    if (!k || !F) return false;
    const h = winOpenProcess(pid, PROCESS_QUERY_INFORMATION);
    if (h === 0n) return false;
    try {
      const dbg = new Int32Array(1);
      if (k.CheckRemoteDebuggerPresent(h, F.ptr(dbg)) !== 0) return dbg[0] !== 0;
      return false;
    } finally {
      winCloseHandle(h);
    }
  }
  if (IS_MAC) return macIsDebugged(pid);
  return false;
}

export function process_getPID(pid: number): number {
  return pid;
}

export function process_getHandle(pid: number): number {
  if (IS_WIN) {
    const h = winOpenProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION);
    if (h === 0n) return 0;
    const v = Number(h);
    winCloseHandle(h);
    return v;
  }
  if (IS_MAC) return macGetTask(pid);
  return 0;
}

export function process_getName(pid: number): string {
  if (IS_LINUX) return procInfo(pid)?.name || "";
  if (IS_WIN) return winGetName(pid);
  if (IS_MAC) return macGetName(pid);
  return "";
}

export function process_getPath(pid: number): string {
  if (IS_LINUX) return procInfo(pid)?.path || "";
  if (IS_WIN) return winGetPath(pid);
  if (IS_MAC) return macGetPath(pid);
  return "";
}

export function process_exit(pid: number): void {
  if (IS_LINUX) {
    const c = libc();
    if (c && pid > 0) c.kill(pid, SIGTERM);
    return;
  }
  if (IS_MAC) {
    const m = mac();
    if (m && pid > 0) m.kill(pid, SIGTERM);
    return;
  }
  if (IS_WIN) {
    // Post WM_CLOSE to all top-level windows belonging to the process.
    const u = user32();
    const F = winFFI();
    if (!u || !F || pid <= 0) return;
    const T = (F as any).FFIType;
    const cb = (F as any).JSCallback
      ? new (F as any).JSCallback(
          (hwnd: bigint, _lp: bigint) => {
            const winPid = new Uint32Array(1);
            u.GetWindowThreadProcessId(hwnd, F.ptr(winPid));
            if (winPid[0] === pid) {
              u.PostMessageW(hwnd, WM_CLOSE, 0n, 0n);
            }
            return 1;
          },
          { args: [T.u64, T.u64], returns: T.i32 },
        )
      : null;
    if (cb) {
      try {
        u.EnumWindows(cb.ptr, 0n);
      } finally {
        cb.close && cb.close();
      }
    }
    return;
  }
}

export function process_kill(pid: number): void {
  if (IS_LINUX) {
    const c = libc();
    if (c && pid > 0) c.kill(pid, SIGKILL);
    return;
  }
  if (IS_MAC) {
    const m = mac();
    if (m && pid > 0) m.kill(pid, SIGKILL);
    return;
  }
  if (IS_WIN) {
    const k = kernel32();
    if (!k) return;
    const h = winOpenProcess(pid, PROCESS_TERMINATE);
    if (h === 0n) return;
    try { k.TerminateProcess(h, 0xFFFFFFFF); }
    finally { winCloseHandle(h); }
    return;
  }
}

export function process_hasExited(pid: number): boolean {
  if (IS_LINUX) return procHasExited(pid);
  if (IS_WIN) return winHasExited(pid);
  if (IS_MAC) return !macProcessExists(pid);
  return true;
}

export function process_getModules(pid: number, regexStr?: string): ModuleEntry[] {
  const re = makeRegex(regexStr);
  const out: ModuleEntry[] = [];

  if (IS_LINUX) {
    let txt: string;
    try { txt = fs.readFileSync(`/proc/${pid}/maps`, "utf8"); }
    catch { return out; }
    const seen = new Set<string>();
    for (const line of txt.split("\n")) {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;
      const pStr = parts.slice(5).join(" ").trim();
      if (!pStr || pStr.startsWith("[")) continue;
      if (seen.has(pStr)) continue;
      seen.add(pStr);
      const name = path.basename(pStr);
      if (re && !re.test(name)) continue;
      const [s, e] = parts[0].split("-");
      const base = parseInt(s, 16);
      const end = parseInt(e, 16);
      out.push({ valid: true, name, path: pStr, base, size: end - base, pid });
    }
    return out;
  }

  if (IS_MAC) return macGetModules(pid, re);

  if (IS_WIN) {
    const k = kernel32();
    const ps = psapi();
    const F = winFFI();
    if (!k || !ps || !F) return out;
    const h = winOpenProcess(pid, PROCESS_QUERY_INFORMATION | PROCESS_VM_READ);
    if (h === 0n) return out;
    try {
      const HMODULE_SIZE = 8;
      const hmods = new BigUint64Array(1024);
      const needed = new Uint32Array(1);
      if (ps.EnumProcessModulesEx(h, F.ptr(hmods), hmods.byteLength, F.ptr(needed), LIST_MODULES_ALL) === 0) return out;
      const count = Math.min(needed[0] / HMODULE_SIZE | 0, hmods.length);
      for (let i = 0; i < count; i++) {
        const hmod = hmods[i];
        const nameBuf = new Uint16Array(512);
        const len = ps.GetModuleFileNameExW(h, hmod, F.ptr(nameBuf), nameBuf.length);
        if (len === 0) continue;
        const fullPath = w2js(nameBuf, len).replace(/\\/g, "/");
        const name = fullPath.substring(fullPath.lastIndexOf("/") + 1);
        if (re && !re.test(name)) continue;
        // MODULEINFO: lpBaseOfDll(ptr), SizeOfImage(u32), EntryPoint(ptr) — 24 bytes
        const mi = new ArrayBuffer(24);
        const mi8 = new Uint8Array(mi);
        if (ps.GetModuleInformation(h, hmod, F.ptr(mi8), 24) === 0) continue;
        const dv = new DataView(mi);
        const base = Number(dv.getBigUint64(0, true));
        const size = dv.getUint32(8, true);
        out.push({ valid: true, name, path: fullPath, base, size, pid });
      }
      return out;
    } finally {
      winCloseHandle(h);
    }
  }
  return out;
}

export async function process_getWindows(pid: number, regexStr?: string): Promise<number[]> {
  if (!IS_LINUX) return [];
  const c = await getXConnection();
  if (!c) return [];
  const re = makeRegex(regexStr);
  const out: number[] = [];
  const root = c.info.screens[0]?.root ?? 0;
  await xEnumWindows(c, root, re, pid, out);
  return out;
}

export function process_getList(regexStr?: string): number[] {
  const re = makeRegex(regexStr);
  const out: number[] = [];

  if (IS_LINUX) {
    let entries: string[];
    try { entries = fs.readdirSync("/proc"); }
    catch { return out; }
    for (const ent of entries) {
      if (!/^\d+$/.test(ent)) continue;
      const pid = parseInt(ent, 10);
      if (pid <= 0) continue;
      if (re) {
        const info = procInfo(pid);
        if (!info || !re.test(info.name)) continue;
      }
      out.push(pid);
    }
    return out;
  }

  if (IS_MAC) return macGetList(re);

  if (IS_WIN) {
    const ps = psapi();
    const F = winFFI();
    if (!ps || !F) return out;
    const buf = new Uint32Array(4096);
    const needed = new Uint32Array(1);
    if (ps.EnumProcesses(F.ptr(buf), buf.byteLength, F.ptr(needed)) === 0) return out;
    const count = needed[0] / 4 | 0;
    for (let i = 0; i < count; i++) {
      const pid = buf[i];
      if (pid <= 0) continue;
      if (re) {
        const name = winGetName(pid);
        if (!name || !re.test(name)) continue;
      }
      out.push(pid);
    }
    return out;
  }
  return out;
}

export function process_getCurrent(): number {
  if (IS_LINUX) {
    const c = libc();
    return c ? c.getpid() : process.pid;
  }
  if (IS_WIN) {
    const k = kernel32();
    return k ? k.GetCurrentProcessId() : process.pid;
  }
  if (IS_MAC) {
    const m = mac();
    return m ? m.getpid() : process.pid;
  }
  return process.pid;
}

export function process_isSys64Bit(): boolean {
  if (IS_LINUX) {
    // posix uname not bound here; rely on os.arch which returns the kernel arch
    const a = process.arch;
    return a === "x64" || a === "arm64";
  }
  if (IS_MAC) {
    const m = mac();
    const F = macFFI();
    if (!m || !F) return process.arch === "x64" || process.arch === "arm64";
    // `struct utsname` on macOS has 5 fields of 256 chars each = 1280 bytes;
    // machine is the 5th field at offset 4*256.  We zero-fill and read back.
    const buf = new Uint8Array(1280);
    if (m.uname(F.ptr(buf)) !== 0) return process.arch === "x64" || process.arch === "arm64";
    const machine = bufToStr(buf.subarray(4 * 256), 256);
    return machine === "x86_64" || machine === "aarch64" || machine === "arm64";
  }
  if (IS_WIN) {
    const k = kernel32();
    const F = winFFI();
    if (!k || !F) return process.arch === "x64" || process.arch === "arm64";
    // SYSTEM_INFO is 48 bytes; wProcessorArchitecture is at offset 0
    const buf = new Uint8Array(48);
    k.GetNativeSystemInfo(F.ptr(buf));
    const dv = new DataView(buf.buffer);
    const arch = dv.getUint16(0, true);
    return arch === 9 /* AMD64 */ || arch === 12 /* ARM64 */;
  }
  return false;
}

interface SegmentEntry { valid: boolean; base: number; size: number; name: string; }

export function process_getSegments(pid: number, base: number): SegmentEntry[] {
  if (!IS_LINUX) return [];
  const out: SegmentEntry[] = [];
  let txt: string;
  try { txt = fs.readFileSync(`/proc/${pid}/maps`, "utf8"); }
  catch { return out; }

  // Locate module path matching the base address
  let modulePath = "";
  for (const line of txt.split("\n")) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const [s] = parts[0].split("-");
    const start = parseInt(s, 16);
    if (start === base) {
      modulePath = parts.slice(5).join(" ").trim();
      break;
    }
  }
  if (!modulePath) return out;

  for (const line of txt.split("\n")) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const pStr = parts.slice(5).join(" ").trim();
    if (pStr !== modulePath) continue;
    const [s, e] = parts[0].split("-");
    const start = parseInt(s, 16);
    const end = parseInt(e, 16);
    out.push({ valid: true, base: start, size: end - start, name: parts[1] });
  }
  return out;
}
