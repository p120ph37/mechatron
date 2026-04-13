/**
 * Process subsystem — pure FFI implementation.
 *
 * Linux: /proc filesystem (read via Node `fs`) + libc.kill().  Windows: psapi
 * + kernel32.  macOS: not implemented (throws).
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
import {
  x11, ffi as x11ffi, getDisplay,
  atom, getWindowProperty, getWindowAttributes, IsViewable,
} from "./x11";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";

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

// ── Linux X11 window enumeration (PID-filtered) ────────────────────────

function makeRegex(s?: string): RegExp | null {
  if (!s) return null;
  try { return new RegExp(s); } catch { return null; }
}

function getWindowPid(win: bigint): number {
  const wmPid = atom("_NET_WM_PID");
  if (wmPid === 0n) return 0;
  const r = getWindowProperty(win, wmPid);
  if (!r || r.nitems === 0n) return 0;
  const F = x11ffi();
  const X = x11();
  if (!F || !X) return 0;
  // Property is CARDINAL/32 → first value is a long.  Read it.
  const pid = Number(F.read.u64(r.data, 0) & 0xFFFFFFFFn);
  X.XFree(r.data);
  return pid;
}

function getWindowTitle(win: bigint): string {
  const X = x11();
  const F = x11ffi();
  if (!X || !F) return "";
  const wmName = atom("_NET_WM_NAME");
  if (wmName !== 0n) {
    const r = getWindowProperty(win, wmName);
    if (r && r.nitems > 0n) {
      const s = new (F as any).CString(r.data) as string;
      X.XFree(r.data);
      if (s) return s;
    }
  }
  const xaWmName = atom("WM_NAME", false);
  if (xaWmName !== 0n) {
    const r = getWindowProperty(win, xaWmName);
    if (r && r.nitems > 0n) {
      const s = new (F as any).CString(r.data) as string;
      X.XFree(r.data);
      return s;
    }
  }
  return "";
}

function winIsValid(win: bigint): boolean {
  if (win === 0n) return false;
  const wmPid = atom("_NET_WM_PID");
  if (wmPid === 0n) return false;
  const r = getWindowProperty(win, wmPid);
  if (!r) return false;
  const X = x11();
  if (X) X.XFree(r.data);
  return true;
}

function enumWindows(win: bigint, re: RegExp | null, pidFilter: number, out: number[]): void {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d) return;
  const attr = getWindowAttributes(win);
  if (attr && attr.map_state === IsViewable && winIsValid(win)) {
    const pid = pidFilter === 0 ? -1 : getWindowPid(win);
    if (pidFilter === 0 || pid === pidFilter) {
      let ok = true;
      if (re) {
        const t = getWindowTitle(win);
        ok = re.test(t);
      }
      if (ok) out.push(Number(win));
    }
  }
  // recurse via XQueryTree
  const root = new BigUint64Array(1);
  const parent = new BigUint64Array(1);
  const children = new BigUint64Array(1); // pointer
  const ncount = new Uint32Array(1);
  if (X.XQueryTree(d, win, F.ptr(root), F.ptr(parent), F.ptr(children), F.ptr(ncount)) !== 0) {
    const ptr = children[0];
    const n = ncount[0];
    if (ptr !== 0n && n > 0) {
      for (let i = 0; i < n; i++) {
        const child = F.read.u64(ptr, i * 8);
        enumWindows(child, re, pidFilter, out);
      }
      X.XFree(ptr);
    }
  }
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
  return 0;
}

export function process_getName(pid: number): string {
  if (IS_LINUX) return procInfo(pid)?.name || "";
  if (IS_WIN) return winGetName(pid);
  return "";
}

export function process_getPath(pid: number): string {
  if (IS_LINUX) return procInfo(pid)?.path || "";
  if (IS_WIN) return winGetPath(pid);
  return "";
}

export function process_exit(pid: number): void {
  if (IS_LINUX) {
    const c = libc();
    if (c && pid > 0) c.kill(pid, SIGTERM);
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
  return true;
}

interface ModuleEntry { valid: boolean; name: string; path: string; base: number; size: number; pid: number; }

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

export function process_getWindows(pid: number, regexStr?: string): number[] {
  if (!IS_LINUX) return [];
  const X = x11();
  const d = getDisplay();
  if (!X || !d) return [];
  const re = makeRegex(regexStr);
  const out: number[] = [];
  const root = X.XDefaultRootWindow(d);
  enumWindows(root, re, pid, out);
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
  return process.pid;
}

export function process_isSys64Bit(): boolean {
  if (IS_LINUX) {
    // posix uname not bound here; rely on os.arch which returns the kernel arch
    const a = process.arch;
    return a === "x64" || a === "arm64";
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
