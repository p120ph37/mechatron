/**
 * Window subsystem — pure FFI implementation.
 *
 * Linux: full EWMH window management via libX11 (state, bounds, frame
 * extents, title, enumeration, activation).
 * Windows: Win32 window management via user32.dll (state, bounds, title,
 * enumeration, activation).
 */

import {
  x11, ffi as x11ffi, getDisplay,
  atom, getWindowProperty, getWindowAttributes,
  sendClientMessage, IsViewable, PropModeReplace, CurrentTime,
} from "./x11";
import { user32, winFFI, w2js, js2w } from "./win";
import { getBunFFI, cstr, type Pointer } from "./bun";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";

// ── Atom helpers (lazy/cached) ───────────────────────────────────────

function A(name: string, onlyIfExists = true): bigint { return atom(name, onlyIfExists); }

const STATE_TOPMOST  = 0;
const STATE_MINIMIZE = 1;
const STATE_MAXIMIZE = 2;

// ── Validity ─────────────────────────────────────────────────────────

function winIsValid(handle: number): boolean {
  if (handle === 0) return false;
  const X = x11();
  const d = getDisplay();
  if (!X || !d) return false;
  const wmPid = A("_NET_WM_PID");
  if (wmPid === 0n) return false;
  const r = getWindowProperty(BigInt(handle), wmPid);
  if (!r) return false;
  X.XFree(r.data);
  return true;
}

// ── State predicates ────────────────────────────────────────────────

function getWmState(win: bigint, setting: number): boolean {
  const X = x11();
  const F = x11ffi();
  if (!X || !F) return false;
  const wmState = A("_NET_WM_STATE");
  const wmAbove = A("_NET_WM_STATE_ABOVE");
  const wmHidden = A("_NET_WM_STATE_HIDDEN");
  const wmHmax = A("_NET_WM_STATE_MAXIMIZED_HORZ");
  const wmVmax = A("_NET_WM_STATE_MAXIMIZED_VERT");
  if (wmState === 0n || wmAbove === 0n || wmVmax === 0n || wmHmax === 0n || wmHidden === 0n) return false;
  const r = getWindowProperty(win, wmState);
  if (!r) return false;
  let test1 = false, test2 = false;
  for (let i = 0n; i < r.nitems; i++) {
    const a = F.read.u64(Number(r.data), Number(i) * 8);
    switch (setting) {
      case STATE_TOPMOST:
        if (a === wmAbove) { test1 = true; test2 = true; }
        break;
      case STATE_MINIMIZE:
        if (a === wmHidden) { test1 = true; test2 = true; }
        break;
      case STATE_MAXIMIZE:
        if (a === wmHmax) test1 = true;
        if (a === wmVmax) test2 = true;
        break;
    }
    if (test1 && test2) break;
  }
  X.XFree(r.data);
  return test1 && test2;
}

function setWmState(win: bigint, setting: number, state: boolean): void {
  const X = x11();
  const d = getDisplay();
  if (!X || !d) return;
  const attr = getWindowAttributes(win);

  if (setting === STATE_MINIMIZE) {
    if (state) {
      if (!attr) return;
      const screenNum = X.XScreenNumberOfScreen(attr.screen);
      X.XIconifyWindow(d, win, screenNum);
    } else {
      windowSetActiveInternal(win);
    }
    return;
  }

  const wmState = A("_NET_WM_STATE");
  const wmAbove = A("_NET_WM_STATE_ABOVE");
  const wmHmax = A("_NET_WM_STATE_MAXIMIZED_HORZ");
  const wmVmax = A("_NET_WM_STATE_MAXIMIZED_VERT");
  if (wmState === 0n || wmAbove === 0n || wmVmax === 0n || wmHmax === 0n || !attr) return;

  const screenNum = X.XScreenNumberOfScreen(attr.screen);
  const longs: bigint[] = [BigInt(state ? 1 : 0), 0n, 0n, 0n, 0n];
  if (setting === STATE_TOPMOST) {
    longs[1] = wmAbove;
  } else if (setting === STATE_MAXIMIZE) {
    longs[1] = wmHmax;
    longs[2] = wmVmax;
  } else {
    return;
  }
  sendClientMessage(screenNum, win, wmState, longs);
}

function windowSetActiveInternal(win: bigint): void {
  const X = x11();
  const d = getDisplay();
  if (!X || !d) return;
  const wmActive = A("_NET_ACTIVE_WINDOW");
  const attr = getWindowAttributes(win);
  if (wmActive !== 0n && attr) {
    const screenNum = X.XScreenNumberOfScreen(attr.screen);
    sendClientMessage(screenNum, win, wmActive, [2n, CurrentTime, 0n, 0n, 0n]);
  }
  X.XMapWindow(d, win);
  X.XRaiseWindow(d, win);
}

// ── Frame / client / title ──────────────────────────────────────────

function getFrame(win: bigint): { left: number; top: number; right: number; bottom: number } {
  const X = x11();
  const F = x11ffi();
  if (!X || !F) return { left: 0, top: 0, right: 0, bottom: 0 };
  const wmExtents = A("_NET_FRAME_EXTENTS");
  if (wmExtents === 0n) return { left: 0, top: 0, right: 0, bottom: 0 };
  const r = getWindowProperty(win, wmExtents);
  if (!r) return { left: 0, top: 0, right: 0, bottom: 0 };
  if (r.nitems !== 4n) { X.XFree(r.data); return { left: 0, top: 0, right: 0, bottom: 0 }; }
  const rData = Number(r.data);
  const left   = Number(F.read.u64(rData, 0));
  const right  = Number(F.read.u64(rData, 8));
  const top    = Number(F.read.u64(rData, 16));
  const bottom = Number(F.read.u64(rData, 24));
  X.XFree(r.data);
  // Returns (left, top, leftPlusRight, topPlusBottom) for caller convenience
  return { left, top, right: left + right, bottom: top + bottom };
}

function getTitle(win: bigint): string {
  const X = x11();
  const F = x11ffi();
  if (!X || !F) return "";
  const wmName = A("_NET_WM_NAME");
  if (wmName !== 0n) {
    const r = getWindowProperty(win, wmName);
    if (r && r.nitems > 0n) {
      const s = new (F as any).CString(r.data) as string;
      X.XFree(r.data);
      if (s) return s;
    } else if (r) {
      X.XFree(r.data);
    }
  }
  const xaWmName = atom("WM_NAME", false);
  if (xaWmName !== 0n) {
    const r = getWindowProperty(win, xaWmName);
    if (r) {
      const s = new (F as any).CString(r.data) as string;
      X.XFree(r.data);
      return s;
    }
  }
  return "";
}

function getPid(win: bigint): number {
  const X = x11();
  const F = x11ffi();
  if (!X || !F) return 0;
  const wmPid = A("_NET_WM_PID");
  if (wmPid === 0n) return 0;
  const r = getWindowProperty(win, wmPid);
  if (!r) return 0;
  const v = Number(F.read.u64(Number(r.data), 0) & 0xFFFFFFFFn);
  X.XFree(r.data);
  return v;
}

function getClient(win: bigint): { x: number; y: number; w: number; h: number } {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d) return { x: 0, y: 0, w: 0, h: 0 };
  const attr = getWindowAttributes(win);
  if (!attr) return { x: 0, y: 0, w: 0, h: 0 };
  const root = X.XDefaultRootWindow(d);
  const xRet = new Int32Array(1);
  const yRet = new Int32Array(1);
  const childRet = new BigUint64Array(1);
  X.XTranslateCoordinates(d, win, root, 0, 0, F.ptr(xRet), F.ptr(yRet), F.ptr(childRet));
  return { x: xRet[0], y: yRet[0], w: attr.width, h: attr.height };
}

// ── Enumeration ─────────────────────────────────────────────────────

function makeRegex(s?: string): RegExp | null {
  if (!s) return null;
  try { return new RegExp(s); } catch { return null; }
}

function enumWindows(win: bigint, re: RegExp | null, pidFilter: number, out: number[]): void {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d) return;
  const attr = getWindowAttributes(win);
  if (attr && attr.map_state === IsViewable) {
    if (winIsValid(Number(win))) {
      const matchPid = pidFilter === 0 || getPid(win) === pidFilter;
      if (matchPid) {
        let ok = true;
        if (re) {
          const t = getTitle(win);
          ok = re.test(t);
        }
        if (ok) out.push(Number(win));
      }
    }
  }
  const root = new BigUint64Array(1);
  const parent = new BigUint64Array(1);
  const children = new BigUint64Array(1);
  const ncount = new Uint32Array(1);
  if (X.XQueryTree(d, win, F.ptr(root), F.ptr(parent), F.ptr(children), F.ptr(ncount)) !== 0) {
    const ptr = children[0];
    const n = ncount[0];
    if (ptr !== 0n && n > 0) {
      for (let i = 0; i < n; i++) {
        // Bun's read.u64 rejects bigint pointer args; see process.ts:438.
        const child = F.read.u64(Number(ptr), i * 8);
        enumWindows(child, re, pidFilter, out);
      }
      X.XFree(ptr);
    }
  }
}

// ── Win32 constants ─────────────────────────────────────────────────

const WM_CLOSE      = 0x0010;
const GWL_STYLE      = -16;
const GWL_EXSTYLE    = -20;
const WS_CAPTION     = 0x00C00000;
const WS_EX_TOPMOST  = 0x00000008;
const SW_MAXIMIZE    = 3;
const SW_MINIMIZE    = 6;
const SW_RESTORE     = 9;
const SWP_NOMOVE     = 0x0002;
const SWP_NOSIZE     = 0x0001;
// HWND_TOPMOST = -1, HWND_NOTOPMOST = -2 as signed → unsigned bigint
const HWND_TOPMOST    = BigInt(-1) & 0xFFFFFFFFFFFFFFFFn;
const HWND_NOTOPMOST  = BigInt(-2) & 0xFFFFFFFFFFFFFFFFn;

// ── Win32 helper functions ──────────────────────────────────────────

function win_isValid(handle: number): boolean {
  if (handle === 0) return false;
  const u = user32();
  if (!u) return false;
  return u.IsWindow(BigInt(handle)) !== 0;
}

function win_close(handle: number): void {
  const u = user32();
  if (!u) return;
  u.PostMessageW(BigInt(handle), WM_CLOSE, 0n, 0n);
}

function win_isTopMost(handle: number): boolean {
  const u = user32();
  if (!u) return false;
  const exStyle = u.GetWindowLongW(BigInt(handle), GWL_EXSTYLE);
  return (exStyle & WS_EX_TOPMOST) !== 0;
}

function win_isBorderless(handle: number): boolean {
  const u = user32();
  if (!u) return false;
  const style = u.GetWindowLongW(BigInt(handle), GWL_STYLE);
  return (style & WS_CAPTION) === 0;
}

function win_isMinimized(handle: number): boolean {
  const u = user32();
  if (!u) return false;
  return u.IsIconic(BigInt(handle)) !== 0;
}

function win_isMaximized(handle: number): boolean {
  const u = user32();
  if (!u) return false;
  return u.IsZoomed(BigInt(handle)) !== 0;
}

function win_setTopMost(handle: number, topMost: boolean): void {
  const u = user32();
  if (!u) return;
  const hWndInsertAfter = topMost ? HWND_TOPMOST : HWND_NOTOPMOST;
  u.SetWindowPos(BigInt(handle), hWndInsertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
}

function win_setBorderless(handle: number, borderless: boolean): void {
  const u = user32();
  if (!u) return;
  const hWnd = BigInt(handle);
  let style = u.GetWindowLongW(hWnd, GWL_STYLE);
  if (borderless) {
    style = style & ~WS_CAPTION;
  } else {
    style = style | WS_CAPTION;
  }
  u.SetWindowLongW(hWnd, GWL_STYLE, style);
}

function win_setMinimized(handle: number, minimized: boolean): void {
  const u = user32();
  if (!u) return;
  u.ShowWindow(BigInt(handle), minimized ? SW_MINIMIZE : SW_RESTORE);
}

function win_setMaximized(handle: number, maximized: boolean): void {
  const u = user32();
  if (!u) return;
  u.ShowWindow(BigInt(handle), maximized ? SW_MAXIMIZE : SW_RESTORE);
}

function win_getPid(handle: number): number {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return 0;
  const pidBuf = new Uint32Array(1);
  u.GetWindowThreadProcessId(BigInt(handle), F.ptr(pidBuf));
  return pidBuf[0];
}

function win_getTitle(handle: number): string {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return "";
  const hWnd = BigInt(handle);
  const len = u.GetWindowTextLengthW(hWnd);
  if (len <= 0) return "";
  const buf = new Uint16Array(len + 1);
  const copied = u.GetWindowTextW(hWnd, F.ptr(buf), len + 1);
  return w2js(buf, copied);
}

function win_setTitle(handle: number, title: string): void {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return;
  const buf = js2w(title);
  u.SetWindowTextW(BigInt(handle), F.ptr(buf));
}

function win_getBounds(handle: number): { x: number; y: number; w: number; h: number } {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return { x: 0, y: 0, w: 0, h: 0 };
  const rect = new Int32Array(4); // left, top, right, bottom
  u.GetWindowRect(BigInt(handle), F.ptr(rect));
  return { x: rect[0], y: rect[1], w: rect[2] - rect[0], h: rect[3] - rect[1] };
}

function win_setBounds(handle: number, x: number, y: number, w: number, h: number): void {
  const u = user32();
  if (!u) return;
  u.MoveWindow(BigInt(handle), x, y, w, h, 1);
}

function win_getClient(handle: number): { x: number; y: number; w: number; h: number } {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return { x: 0, y: 0, w: 0, h: 0 };
  const hWnd = BigInt(handle);
  // Get client rect (relative to client area, so left/top are 0)
  const clientRect = new Int32Array(4);
  u.GetClientRect(hWnd, F.ptr(clientRect));
  const w = clientRect[2] - clientRect[0];
  const h = clientRect[3] - clientRect[1];
  // Get client origin in screen coordinates
  const pt = new Int32Array(2); // {x: 0, y: 0}
  u.ClientToScreen(hWnd, F.ptr(pt));
  return { x: pt[0], y: pt[1], w, h };
}

function win_setClient(handle: number, x: number, y: number, w: number, h: number): void {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return;
  const hWnd = BigInt(handle);
  const style = u.GetWindowLongW(hWnd, GWL_STYLE);
  const exStyle = u.GetWindowLongW(hWnd, GWL_EXSTYLE);
  // Build a RECT from the desired client area
  const rect = new Int32Array(4);
  rect[0] = x;      // left
  rect[1] = y;      // top
  rect[2] = x + w;  // right
  rect[3] = y + h;  // bottom
  u.AdjustWindowRectEx(F.ptr(rect), style, 0, exStyle);
  u.MoveWindow(hWnd, rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1], 1);
}

function win_mapToClient(handle: number, x: number, y: number): { x: number; y: number } {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return { x, y };
  const pt = new Int32Array(2);
  pt[0] = x;
  pt[1] = y;
  u.ScreenToClient(BigInt(handle), F.ptr(pt));
  return { x: pt[0], y: pt[1] };
}

function win_mapToScreen(handle: number, x: number, y: number): { x: number; y: number } {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return { x, y };
  const pt = new Int32Array(2);
  pt[0] = x;
  pt[1] = y;
  u.ClientToScreen(BigInt(handle), F.ptr(pt));
  return { x: pt[0], y: pt[1] };
}

function win_getList(regexStr?: string): number[] {
  const u = user32();
  const F = getBunFFI();
  if (!u || !F) return [];
  const re = makeRegex(regexStr);
  const out: number[] = [];
  const T = F.FFIType;
  const cb = new F.JSCallback(
    (hWnd: bigint, _lParam: bigint): number => {
      if (u.IsWindowVisible(hWnd) !== 0) {
        const handle = Number(hWnd);
        if (re) {
          const title = win_getTitle(handle);
          if (re.test(title)) out.push(handle);
        } else {
          out.push(handle);
        }
      }
      return 1; // continue enumeration
    },
    { args: [T.u64, T.u64], returns: T.i32 },
  );
  u.EnumWindows(cb.ptr, 0n);
  cb.close();
  return out;
}

function win_getActive(): number {
  const u = user32();
  if (!u) return 0;
  return Number(u.GetForegroundWindow());
}

function win_setActive(handle: number): void {
  const u = user32();
  if (!u) return;
  u.SetForegroundWindow(BigInt(handle));
}

// ── NAPI-compatible exports ─────────────────────────────────────────

export function window_isValid(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle);
  if (IS_WIN) return win_isValid(handle);
  return false;
}

export function window_close(handle: number): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    const X = x11();
    const d = getDisplay();
    if (!X || !d) return;
    X.XDestroyWindow(d, BigInt(handle));
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_close(handle);
  }
}

export function window_isTopMost(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle) && getWmState(BigInt(handle), STATE_TOPMOST);
  if (IS_WIN) return win_isValid(handle) && win_isTopMost(handle);
  return false;
}

export function window_isBorderless(handle: number): boolean {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return false;
    const X = x11();
    const F = x11ffi();
    if (!X || !F) return false;
    const wmHints = A("_MOTIF_WM_HINTS");
    if (wmHints === 0n) return false;
    const r = getWindowProperty(BigInt(handle), wmHints);
    if (!r) return false;
    // _MOTIF_WM_HINTS: flags(ulong), funcs(ulong), decorations(ulong) at offset 16
    const decorations = F.read.u64(Number(r.data), 16);
    X.XFree(r.data);
    return decorations === 0n;
  }
  if (IS_WIN) return win_isValid(handle) && win_isBorderless(handle);
  return false;
}

export function window_isMinimized(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle) && getWmState(BigInt(handle), STATE_MINIMIZE);
  if (IS_WIN) return win_isValid(handle) && win_isMinimized(handle);
  return false;
}

export function window_isMaximized(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle) && getWmState(BigInt(handle), STATE_MAXIMIZE);
  if (IS_WIN) return win_isValid(handle) && win_isMaximized(handle);
  return false;
}

export function window_setTopMost(handle: number, topMost: boolean): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    setWmState(BigInt(handle), STATE_TOPMOST, topMost);
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setTopMost(handle, topMost);
  }
}

export function window_setBorderless(handle: number, borderless: boolean): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    const X = x11();
    const F = x11ffi();
    const d = getDisplay();
    if (!X || !F || !d) return;
    const wmHints = A("_MOTIF_WM_HINTS");
    if (wmHints === 0n) return;
    // 5 ulong/long values: flags=2 (MWM_HINTS_DECORATIONS), funcs=0,
    // decorations=(borderless?0:1), mode=0, stat=0
    const buf = new BigUint64Array(5);
    buf[0] = 2n;
    buf[1] = 0n;
    buf[2] = borderless ? 0n : 1n;
    buf[3] = 0n;
    buf[4] = 0n;
    X.XChangeProperty(d, BigInt(handle), wmHints, wmHints, 32, PropModeReplace, F.ptr(buf), 5);
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setBorderless(handle, borderless);
  }
}

export function window_setMinimized(handle: number, minimized: boolean): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    setWmState(BigInt(handle), STATE_MINIMIZE, minimized);
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setMinimized(handle, minimized);
  }
}

export function window_setMaximized(handle: number, maximized: boolean): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    setWmState(BigInt(handle), STATE_MINIMIZE, false);
    setWmState(BigInt(handle), STATE_MAXIMIZE, maximized);
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setMaximized(handle, maximized);
  }
}

export function window_getProcess(handle: number): number {
  if (IS_LINUX) return winIsValid(handle) ? getPid(BigInt(handle)) : 0;
  if (IS_WIN) return win_isValid(handle) ? win_getPid(handle) : 0;
  return 0;
}

export function window_getPID(handle: number): number {
  return window_getProcess(handle);
}

export function window_getHandle(handle: number): number { return handle; }

export function window_setHandle(_handle: number, newHandle: number): boolean {
  if (newHandle === 0) return true;
  if (IS_LINUX) return winIsValid(newHandle);
  if (IS_WIN) return win_isValid(newHandle);
  return false;
}

export function window_getTitle(handle: number): string {
  if (IS_LINUX) return winIsValid(handle) ? getTitle(BigInt(handle)) : "";
  if (IS_WIN) return win_isValid(handle) ? win_getTitle(handle) : "";
  return "";
}

export function window_setTitle(handle: number, title: string): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    const X = x11();
    const F = x11ffi();
    const d = getDisplay();
    if (!X || !F || !d) return;
    X.XStoreName(d, BigInt(handle), F.ptr(cstr(title)));
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setTitle(handle, title);
  }
}

export function window_getBounds(handle: number): { x: number; y: number; w: number; h: number } {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return { x: 0, y: 0, w: 0, h: 0 };
    const c = getClient(BigInt(handle));
    const f = getFrame(BigInt(handle));
    return { x: c.x - f.left, y: c.y - f.top, w: c.w + f.right, h: c.h + f.bottom };
  }
  if (IS_WIN) return win_isValid(handle) ? win_getBounds(handle) : { x: 0, y: 0, w: 0, h: 0 };
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function window_setBounds(handle: number, x: number, y: number, w: number, h: number): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    const X = x11();
    const d = getDisplay();
    if (!X || !d) return;
    const f = getFrame(BigInt(handle));
    const ww = Math.max(1, w - f.right);
    const hh = Math.max(1, h - f.bottom);
    X.XMoveResizeWindow(d, BigInt(handle), x, y, ww, hh);
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setBounds(handle, x, y, w, h);
  }
}

export function window_getClient(handle: number): { x: number; y: number; w: number; h: number } {
  if (IS_LINUX) return winIsValid(handle) ? getClient(BigInt(handle)) : { x: 0, y: 0, w: 0, h: 0 };
  if (IS_WIN) return win_isValid(handle) ? win_getClient(handle) : { x: 0, y: 0, w: 0, h: 0 };
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function window_setClient(handle: number, x: number, y: number, w: number, h: number): void {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return;
    const X = x11();
    const d = getDisplay();
    if (!X || !d) return;
    X.XMoveResizeWindow(d, BigInt(handle), x, y, Math.max(1, w), Math.max(1, h));
  } else if (IS_WIN) {
    if (!win_isValid(handle)) return;
    win_setClient(handle, x, y, w, h);
  }
}

export function window_mapToClient(handle: number, x: number, y: number): { x: number; y: number } {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return { x, y };
    const c = getClient(BigInt(handle));
    return { x: x - c.x, y: y - c.y };
  }
  if (IS_WIN) return win_isValid(handle) ? win_mapToClient(handle, x, y) : { x, y };
  return { x, y };
}

export function window_mapToScreen(handle: number, x: number, y: number): { x: number; y: number } {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return { x, y };
    const c = getClient(BigInt(handle));
    return { x: x + c.x, y: y + c.y };
  }
  if (IS_WIN) return win_isValid(handle) ? win_mapToScreen(handle, x, y) : { x, y };
  return { x, y };
}

export function window_getList(regexStr?: string): number[] {
  if (IS_LINUX) {
    const X = x11();
    const d = getDisplay();
    if (!X || !d) return [];
    const re = makeRegex(regexStr);
    const out: number[] = [];
    const root = X.XDefaultRootWindow(d);
    enumWindows(root, re, 0, out);
    return out;
  }
  if (IS_WIN) return win_getList(regexStr);
  return [];
}

export function window_getActive(): number {
  if (IS_LINUX) {
    const X = x11();
    const F = x11ffi();
    const d = getDisplay();
    if (!X || !F || !d) return 0;
    const wmActive = A("_NET_ACTIVE_WINDOW");
    if (wmActive === 0n) return 0;
    const root = X.XDefaultRootWindow(d);
    const r = getWindowProperty(root, wmActive);
    if (!r) return 0;
    const win = F.read.u64(Number(r.data), 0);
    X.XFree(r.data);
    return Number(win);
  }
  if (IS_WIN) return win_getActive();
  return 0;
}

export function window_setActive(handle: number): void {
  if (handle === 0) return;
  if (IS_LINUX) {
    windowSetActiveInternal(BigInt(handle));
  } else if (IS_WIN) {
    win_setActive(handle);
  }
}

export function window_isAxEnabled(prompt?: boolean): boolean {
  if (IS_LINUX || IS_WIN) return true;
  return false;
}

if (!IS_LINUX && !IS_WIN) {
  throw new Error("ffi/window: requires Linux with libX11 or Windows with user32.dll");
}
if (IS_LINUX && !getDisplay()) {
  throw new Error("ffi/window: requires Linux with libX11 (no display available)");
}
