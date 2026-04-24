/**
 * Window subsystem — pure FFI implementation.
 *
 * Linux: full EWMH window management via libX11 (state, bounds, frame
 * extents, title, enumeration, activation).
 * Windows: Win32 window management via user32.dll (state, bounds, title,
 * enumeration, activation).
 * macOS: CoreGraphics CGWindowList for read-only enumeration; Accessibility
 * framework for mutation (loaded separately to isolate Bun FFI crashes).
 */

import {
  x11, ffi as x11ffi, getDisplay,
  atom, getWindowProperty, getWindowAttributes,
  sendClientMessage, IsViewable, PropModeReplace, CurrentTime,
} from "./x11";
import { user32, winFFI, w2js, js2w } from "./win";
import { getBunFFI, bp, cstr, type Pointer } from "./bun";
import {
  cg, cf, ax, macFFI, cfStringFromJS, cfStringToJS, cfBool,
  kCFNumberSInt32Type, kCFNumberFloat64Type,
  kCGWindowListOptionOnScreenOnly, kCGWindowListExcludeDesktopElements, kCGNullWindowID,
  kAXValueCGPointType, kAXValueCGSizeType,
} from "./mac";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

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
    { args: [T.u64, T.i64], returns: T.i32 },
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

// ── macOS: CGWindowList-based enumeration ───────────────────────────
//
// CF dictionary values (CFNumber, CFString) can be tagged pointers with
// the high bit set.  bun:ffi's T.ptr rejects bigints above 2^63, so
// the CF access functions use T.i64 args/returns for pointer-typed
// values.  The signed bigint preserves the full 64-bit pattern — at
// the ABI level, signed and unsigned integers occupy the same register.

let _cgKeys: { number: bigint; layer: bigint; name: bigint } | null = null;
let _cgKeysInit = false;

function getCGKeys() {
  if (_cgKeysInit) return _cgKeys;
  _cgKeysInit = true;
  const n = cfStringFromJS("kCGWindowNumber");
  const l = cfStringFromJS("kCGWindowLayer");
  const nm = cfStringFromJS("kCGWindowName");
  if (!n || !l || !nm) return null;
  _cgKeys = { number: n, layer: l, name: nm };
  return _cgKeys;
}

const _numBuf = new Int32Array(1);
const _sType = BigInt(kCFNumberSInt32Type);

function mac_getList(regexStr?: string): number[] {
  const C = cg();
  const CF = cf();
  if (!C || !CF) return [];

  const keys = getCGKeys();
  if (!keys) return [];

  const option = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
  const infoList = C.CGWindowListCopyWindowInfo(option, kCGNullWindowID);
  if (!infoList) return [];

  const re = makeRegex(regexStr);
  const out: number[] = [];

  try {
    const count = Number(CF.CFArrayGetCount(infoList));

    for (let i = 0; i < count; i++) {
      const dict = CF.CFArrayGetValueAtIndex(infoList, BigInt(i));
      if (!dict) continue;

      const layerRef = CF.CFDictionaryGetValue(dict, keys.layer);
      if (layerRef) {
        _numBuf[0] = -1;
        CF.CFNumberGetValue(layerRef, _sType, bp(_numBuf));
        if (_numBuf[0] !== 0) continue;
      }

      const numRef = CF.CFDictionaryGetValue(dict, keys.number);
      if (!numRef) continue;
      _numBuf[0] = 0;
      CF.CFNumberGetValue(numRef, _sType, bp(_numBuf));
      const winId = _numBuf[0];
      if (winId <= 0) continue;

      if (re) {
        const nameRef = CF.CFDictionaryGetValue(dict, keys.name);
        if (!nameRef) continue;
        const title = cfStringToJS(nameRef);
        if (!re.test(title)) continue;
      }

      out.push(winId);
    }
  } finally {
    CF.CFRelease(infoList);
  }

  return out;
}

// ── macOS: CGWindowList per-window info lookup ─────────────────────
//
// Several read-only queries (isValid, getTitle, getBounds, getPid) just
// need to look up a single window's metadata in the CGWindowList.  This
// helper runs the query and passes the matching CFDictionary to a
// callback, handling CFRelease of the underlying CFArray.

let _cgExtraKeys: {
  pid: bigint; bounds: bigint;
  bx: bigint; by: bigint; bw: bigint; bh: bigint;
} | null = null;
let _cgExtraKeysInit = false;

function getCGExtraKeys() {
  if (_cgExtraKeysInit) return _cgExtraKeys;
  _cgExtraKeysInit = true;
  const pid = cfStringFromJS("kCGWindowOwnerPID");
  const bounds = cfStringFromJS("kCGWindowBounds");
  const bx = cfStringFromJS("X");
  const by = cfStringFromJS("Y");
  const bw = cfStringFromJS("Width");
  const bh = cfStringFromJS("Height");
  if (!pid || !bounds || !bx || !by || !bw || !bh) return null;
  _cgExtraKeys = { pid, bounds, bx, by, bw, bh };
  return _cgExtraKeys;
}

function mac_withWindowDict<T>(handle: number, fn: (dict: bigint) => T, fallback: T): T {
  if (handle <= 0) return fallback;
  const C = cg();
  const CF = cf();
  if (!C || !CF) return fallback;

  const keys = getCGKeys();
  if (!keys) return fallback;

  const infoList = C.CGWindowListCopyWindowInfo(0, kCGNullWindowID);
  if (!infoList) return fallback;

  try {
    const count = Number(CF.CFArrayGetCount(infoList));
    for (let i = 0; i < count; i++) {
      const dict = CF.CFArrayGetValueAtIndex(infoList, BigInt(i));
      if (!dict) continue;
      const numRef = CF.CFDictionaryGetValue(dict, keys.number);
      if (!numRef) continue;
      _numBuf[0] = 0;
      CF.CFNumberGetValue(numRef, _sType, bp(_numBuf));
      if (_numBuf[0] === handle) return fn(dict);
    }
  } finally {
    CF.CFRelease(infoList);
  }
  return fallback;
}

function mac_isValid(handle: number): boolean {
  return mac_withWindowDict(handle, () => true, false);
}

function mac_getTitle(handle: number): string {
  const keys = getCGKeys();
  if (!keys) return "";
  return mac_withWindowDict(handle, (dict) => {
    const CF = cf()!;
    const nameRef = CF.CFDictionaryGetValue(dict, keys.name);
    if (!nameRef) return "";
    return cfStringToJS(nameRef);
  }, "");
}

function mac_getPid(handle: number): number {
  const extra = getCGExtraKeys();
  if (!extra) return 0;
  return mac_withWindowDict(handle, (dict) => {
    const CF = cf()!;
    const pidRef = CF.CFDictionaryGetValue(dict, extra.pid);
    if (!pidRef) return 0;
    _numBuf[0] = 0;
    CF.CFNumberGetValue(pidRef, _sType, bp(_numBuf));
    return _numBuf[0];
  }, 0);
}

const _f64Buf = new Float64Array(2);

function mac_getBoundsFromDict(dict: bigint): { x: number; y: number; w: number; h: number } {
  const CF = cf()!;
  const extra = getCGExtraKeys()!;
  const boundsDict = CF.CFDictionaryGetValue(dict, extra.bounds);
  if (!boundsDict) return { x: 0, y: 0, w: 0, h: 0 };
  const f64Type = BigInt(kCFNumberFloat64Type);
  let x = 0, y = 0, w = 0, h = 0;
  const xRef = CF.CFDictionaryGetValue(boundsDict, extra.bx);
  if (xRef) { CF.CFNumberGetValue(xRef, f64Type, bp(_f64Buf)); x = _f64Buf[0]; }
  const yRef = CF.CFDictionaryGetValue(boundsDict, extra.by);
  if (yRef) { CF.CFNumberGetValue(yRef, f64Type, bp(_f64Buf)); y = _f64Buf[0]; }
  const wRef = CF.CFDictionaryGetValue(boundsDict, extra.bw);
  if (wRef) { CF.CFNumberGetValue(wRef, f64Type, bp(_f64Buf)); w = _f64Buf[0]; }
  const hRef = CF.CFDictionaryGetValue(boundsDict, extra.bh);
  if (hRef) { CF.CFNumberGetValue(hRef, f64Type, bp(_f64Buf)); h = _f64Buf[0]; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function mac_getBounds(handle: number): { x: number; y: number; w: number; h: number } {
  if (!getCGExtraKeys()) return { x: 0, y: 0, w: 0, h: 0 };
  return mac_withWindowDict(handle, mac_getBoundsFromDict, { x: 0, y: 0, w: 0, h: 0 });
}

// ── macOS: AX-based window manipulation ────────────────────────────
//
// Mutation operations require the Accessibility API (AXUIElement).
// To get the AXUIElement for a given CGWindowID we:
//   1. Look up the owning PID from CGWindowList
//   2. Create an AXUIElement for that application
//   3. Read its kAXWindowsAttribute (CFArray of AXUIElements)
//   4. Match each AX window's CGWindowID via _AXUIElementGetWindow
//
// Every AXUIElement and CFArray created here follows the Create Rule
// and must be CFRelease'd.

let _axAttrs: {
  windows: bigint; focusedWindow: bigint; title: bigint;
  minimized: bigint; fullscreen: bigint; position: bigint;
  size: bigint; closeButton: bigint; focusedApp: bigint;
  frontmost: bigint; raise: bigint; press: bigint;
} | null = null;
let _axAttrsInit = false;

function getAXAttrs() {
  if (_axAttrsInit) return _axAttrs;
  _axAttrsInit = true;
  const windows = cfStringFromJS("AXWindows");
  const focusedWindow = cfStringFromJS("AXFocusedWindow");
  const title = cfStringFromJS("AXTitle");
  const minimized = cfStringFromJS("AXMinimized");
  const fullscreen = cfStringFromJS("AXFullScreen");
  const position = cfStringFromJS("AXPosition");
  const size = cfStringFromJS("AXSize");
  const closeButton = cfStringFromJS("AXCloseButton");
  const focusedApp = cfStringFromJS("AXFocusedApplication");
  const frontmost = cfStringFromJS("AXFrontmost");
  const raise = cfStringFromJS("AXRaise");
  const press = cfStringFromJS("AXPress");
  if (!windows || !focusedWindow || !title || !minimized || !fullscreen ||
      !position || !size || !closeButton || !focusedApp || !frontmost ||
      !raise || !press) return null;
  _axAttrs = {
    windows, focusedWindow, title, minimized, fullscreen,
    position, size, closeButton, focusedApp, frontmost, raise, press,
  };
  return _axAttrs;
}

const _axOutBuf = new BigInt64Array(1);
const _widBuf = new Uint32Array(1);

function mac_withAXWindow<T>(handle: number, fn: (axWin: bigint) => T, fallback: T): T {
  const AX = ax();
  const CF = cf();
  if (!AX || !CF) return fallback;
  const attrs = getAXAttrs();
  if (!attrs) return fallback;

  const pid = mac_getPid(handle);
  if (pid <= 0) return fallback;

  const appElem = AX.AXUIElementCreateApplication(pid);
  if (!appElem) return fallback;

  try {
    _axOutBuf[0] = 0n;
    if (AX.AXUIElementCopyAttributeValue(appElem, attrs.windows, bp(_axOutBuf)) !== 0) return fallback;
    const windowsArray = _axOutBuf[0];
    if (!windowsArray) return fallback;

    try {
      const count = Number(CF.CFArrayGetCount(windowsArray));
      for (let i = 0; i < count; i++) {
        const axWin = CF.CFArrayGetValueAtIndex(windowsArray, BigInt(i));
        if (!axWin) continue;
        _widBuf[0] = 0;
        if (AX._AXUIElementGetWindow(axWin, bp(_widBuf)) === 0 && _widBuf[0] === handle) {
          return fn(axWin);
        }
      }
    } finally {
      CF.CFRelease(windowsArray);
    }
  } finally {
    CF.CFRelease(appElem);
  }
  return fallback;
}

function mac_axGetBool(axWin: bigint, attr: bigint): boolean {
  const AX = ax();
  const CF = cf();
  if (!AX || !CF) return false;
  _axOutBuf[0] = 0n;
  if (AX.AXUIElementCopyAttributeValue(axWin, attr, bp(_axOutBuf)) !== 0) return false;
  const val = _axOutBuf[0];
  if (!val) return false;
  return CF.CFBooleanGetValue(val) !== 0;
}

function mac_isMinimized(handle: number): boolean {
  const attrs = getAXAttrs();
  if (!attrs) return false;
  return mac_withAXWindow(handle, (axWin) => mac_axGetBool(axWin, attrs.minimized), false);
}

function mac_isMaximized(handle: number): boolean {
  const attrs = getAXAttrs();
  if (!attrs) return false;
  return mac_withAXWindow(handle, (axWin) => mac_axGetBool(axWin, attrs.fullscreen), false);
}

function mac_close(handle: number): void {
  const attrs = getAXAttrs();
  if (!attrs) return;
  mac_withAXWindow(handle, (axWin) => {
    const AX = ax()!;
    const CF = cf()!;
    _axOutBuf[0] = 0n;
    if (AX.AXUIElementCopyAttributeValue(axWin, attrs.closeButton, bp(_axOutBuf)) !== 0) return;
    const btn = _axOutBuf[0];
    if (!btn) return;
    AX.AXUIElementPerformAction(btn, attrs.press);
    CF.CFRelease(btn);
  }, undefined);
}

function mac_setTitle(handle: number, title: string): void {
  const attrs = getAXAttrs();
  if (!attrs) return;
  mac_withAXWindow(handle, (axWin) => {
    const AX = ax()!;
    const CF = cf()!;
    const cfTitle = cfStringFromJS(title);
    if (!cfTitle) return;
    AX.AXUIElementSetAttributeValue(axWin, attrs.title, cfTitle);
    CF.CFRelease(cfTitle);
  }, undefined);
}

function mac_setMinimized(handle: number, minimized: boolean): void {
  const attrs = getAXAttrs();
  if (!attrs) return;
  mac_withAXWindow(handle, (axWin) => {
    ax()!.AXUIElementSetAttributeValue(axWin, attrs.minimized, cfBool(minimized));
  }, undefined);
}

function mac_setMaximized(handle: number, maximized: boolean): void {
  const attrs = getAXAttrs();
  if (!attrs) return;
  mac_withAXWindow(handle, (axWin) => {
    ax()!.AXUIElementSetAttributeValue(axWin, attrs.fullscreen, cfBool(maximized));
  }, undefined);
}

function mac_setBounds(handle: number, x: number, y: number, w: number, h: number): void {
  const attrs = getAXAttrs();
  if (!attrs) return;
  mac_withAXWindow(handle, (axWin) => {
    const AX = ax()!;
    const CF = cf()!;
    const posBuf = new Float64Array([x, y]);
    const posVal = AX.AXValueCreate(kAXValueCGPointType, bp(posBuf));
    if (posVal) {
      AX.AXUIElementSetAttributeValue(axWin, attrs.position, posVal);
      CF.CFRelease(posVal);
    }
    const sizeBuf = new Float64Array([w, h]);
    const sizeVal = AX.AXValueCreate(kAXValueCGSizeType, bp(sizeBuf));
    if (sizeVal) {
      AX.AXUIElementSetAttributeValue(axWin, attrs.size, sizeVal);
      CF.CFRelease(sizeVal);
    }
  }, undefined);
}

function mac_getActive(): number {
  const AX = ax();
  const CF = cf();
  if (!AX || !CF) return 0;
  const attrs = getAXAttrs();
  if (!attrs) return 0;

  const sysWide = AX.AXUIElementCreateSystemWide();
  if (!sysWide) return 0;

  try {
    _axOutBuf[0] = 0n;
    if (AX.AXUIElementCopyAttributeValue(sysWide, attrs.focusedApp, bp(_axOutBuf)) !== 0) return 0;
    const appElem = _axOutBuf[0];
    if (!appElem) return 0;

    try {
      _axOutBuf[0] = 0n;
      if (AX.AXUIElementCopyAttributeValue(appElem, attrs.focusedWindow, bp(_axOutBuf)) !== 0) return 0;
      const focWin = _axOutBuf[0];
      if (!focWin) return 0;

      try {
        _widBuf[0] = 0;
        if (AX._AXUIElementGetWindow(focWin, bp(_widBuf)) !== 0) return 0;
        return _widBuf[0];
      } finally {
        CF.CFRelease(focWin);
      }
    } finally {
      CF.CFRelease(appElem);
    }
  } finally {
    CF.CFRelease(sysWide);
  }
}

function mac_setActive(handle: number): void {
  const AX = ax();
  const CF = cf();
  if (!AX || !CF) return;
  const attrs = getAXAttrs();
  if (!attrs) return;

  const pid = mac_getPid(handle);
  if (pid <= 0) return;

  const appElem = AX.AXUIElementCreateApplication(pid);
  if (!appElem) return;
  try {
    AX.AXUIElementSetAttributeValue(appElem, attrs.frontmost, cfBool(true));
  } finally {
    CF.CFRelease(appElem);
  }

  mac_withAXWindow(handle, (axWin) => {
    AX.AXUIElementPerformAction(axWin, attrs.raise);
  }, undefined);
}

function mac_isAxEnabled(): boolean {
  const AX = ax();
  return !!AX && AX.AXIsProcessTrusted() !== 0;
}

// ── NAPI-compatible exports ─────────────────────────────────────────

export function window_isValid(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle);
  if (IS_WIN) return win_isValid(handle);
  if (IS_MAC) return mac_isValid(handle);
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_close(handle);
  }
}

export function window_isTopMost(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle) && getWmState(BigInt(handle), STATE_TOPMOST);
  if (IS_WIN) return win_isValid(handle) && win_isTopMost(handle);
  if (IS_MAC) {
    if (!mac_isValid(handle)) return false;
    const keys = getCGKeys();
    if (!keys) return false;
    return mac_withWindowDict(handle, (dict) => {
      const CF = cf()!;
      const layerRef = CF.CFDictionaryGetValue(dict, keys.layer);
      if (!layerRef) return false;
      _numBuf[0] = 0;
      CF.CFNumberGetValue(layerRef, _sType, bp(_numBuf));
      return _numBuf[0] > 0;
    }, false);
  }
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
  if (IS_MAC) return mac_isValid(handle) && mac_isMinimized(handle);
  return false;
}

export function window_isMaximized(handle: number): boolean {
  if (IS_LINUX) return winIsValid(handle) && getWmState(BigInt(handle), STATE_MAXIMIZE);
  if (IS_WIN) return win_isValid(handle) && win_isMaximized(handle);
  if (IS_MAC) return mac_isValid(handle) && mac_isMaximized(handle);
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setMinimized(handle, minimized);
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setMaximized(handle, maximized);
  }
}

export function window_getProcess(handle: number): number {
  if (IS_LINUX) return winIsValid(handle) ? getPid(BigInt(handle)) : 0;
  if (IS_WIN) return win_isValid(handle) ? win_getPid(handle) : 0;
  if (IS_MAC) return mac_isValid(handle) ? mac_getPid(handle) : 0;
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
  if (IS_MAC) return mac_isValid(newHandle);
  return false;
}

export function window_getTitle(handle: number): string {
  if (IS_LINUX) return winIsValid(handle) ? getTitle(BigInt(handle)) : "";
  if (IS_WIN) return win_isValid(handle) ? win_getTitle(handle) : "";
  if (IS_MAC) return mac_isValid(handle) ? mac_getTitle(handle) : "";
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setTitle(handle, title);
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
  if (IS_MAC) return mac_isValid(handle) ? mac_getBounds(handle) : { x: 0, y: 0, w: 0, h: 0 };
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setBounds(handle, x, y, w, h);
  }
}

export function window_getClient(handle: number): { x: number; y: number; w: number; h: number } {
  if (IS_LINUX) return winIsValid(handle) ? getClient(BigInt(handle)) : { x: 0, y: 0, w: 0, h: 0 };
  if (IS_WIN) return win_isValid(handle) ? win_getClient(handle) : { x: 0, y: 0, w: 0, h: 0 };
  if (IS_MAC) return mac_isValid(handle) ? mac_getBounds(handle) : { x: 0, y: 0, w: 0, h: 0 };
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setBounds(handle, x, y, w, h);
  }
}

export function window_mapToClient(handle: number, x: number, y: number): { x: number; y: number } {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return { x, y };
    const c = getClient(BigInt(handle));
    return { x: x - c.x, y: y - c.y };
  }
  if (IS_WIN) return win_isValid(handle) ? win_mapToClient(handle, x, y) : { x, y };
  if (IS_MAC) {
    if (!mac_isValid(handle)) return { x, y };
    const b = mac_getBounds(handle);
    return { x: x - b.x, y: y - b.y };
  }
  return { x, y };
}

export function window_mapToScreen(handle: number, x: number, y: number): { x: number; y: number } {
  if (IS_LINUX) {
    if (!winIsValid(handle)) return { x, y };
    const c = getClient(BigInt(handle));
    return { x: x + c.x, y: y + c.y };
  }
  if (IS_WIN) return win_isValid(handle) ? win_mapToScreen(handle, x, y) : { x, y };
  if (IS_MAC) {
    if (!mac_isValid(handle)) return { x, y };
    const b = mac_getBounds(handle);
    return { x: x + b.x, y: y + b.y };
  }
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
  if (IS_MAC) return mac_getList(regexStr);
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
  if (IS_MAC) return mac_getActive();
  return 0;
}

export function window_setActive(handle: number): void {
  if (handle === 0) return;
  if (IS_LINUX) {
    windowSetActiveInternal(BigInt(handle));
  } else if (IS_WIN) {
    win_setActive(handle);
  } else if (IS_MAC) {
    mac_setActive(handle);
  }
}

export function window_isAxEnabled(prompt?: boolean): boolean {
  if (IS_LINUX || IS_WIN) return true;
  if (IS_MAC) return mac_isAxEnabled();
  return false;
}

if (!IS_LINUX && !IS_WIN && !IS_MAC) {
  throw new Error("ffi/window: requires Linux with libX11, Windows with user32.dll, or macOS with CoreGraphics");
}
if (IS_LINUX && !getDisplay()) {
  throw new Error("ffi/window: requires Linux with libX11 (no display available)");
}
