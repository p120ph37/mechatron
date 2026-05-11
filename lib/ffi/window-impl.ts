/**
 * Window subsystem — pure FFI implementation (Win/Darwin only).
 *
 * Windows: Win32 window management via user32.dll (state, bounds, title,
 * enumeration, activation).
 * macOS: CoreGraphics CGWindowList for read-only enumeration; Accessibility
 * framework for mutation (loaded separately to isolate Bun FFI crashes).
 *
 * Linux is served by napi[x11] or nolib[x11/portal/gext].
 */

import { user32, winFFI, w2js, js2w } from "./win";
import { getBunFFI, bp, cstr, cstringFromPtr, type Pointer } from "./bun";
import {
  cg, cf, ax, macFFI, cfStringFromJS, cfStringToJS, cfBool,
  kCFNumberSInt32Type, kCFNumberFloat64Type,
  kCGWindowListOptionOnScreenOnly, kCGWindowListExcludeDesktopElements, kCGNullWindowID,
  kAXValueCGPointType, kAXValueCGSizeType,
} from "./mac";

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── Shared helpers ──────────────────────────────────────────────────

function makeRegex(s?: string): RegExp | null {
  if (!s) return null;
  try { return new RegExp(s); } catch { return null; }
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
const _f64Type = BigInt(kCFNumberFloat64Type);
const ZERO_BOUNDS = { x: 0, y: 0, w: 0, h: 0 };

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

const _f64Buf = new Float64Array(1);

function cfReadFloat64(cfNum: bigint): number {
  _f64Buf[0] = 0;
  cf()!.CFNumberGetValue(cfNum, _f64Type, bp(_f64Buf));
  return _f64Buf[0];
}

function mac_getBoundsFromDict(dict: bigint): { x: number; y: number; w: number; h: number } {
  const CF = cf()!;
  const extra = getCGExtraKeys()!;
  const boundsDict = CF.CFDictionaryGetValue(dict, extra.bounds);
  if (!boundsDict) return ZERO_BOUNDS;
  const xRef = CF.CFDictionaryGetValue(boundsDict, extra.bx);
  const yRef = CF.CFDictionaryGetValue(boundsDict, extra.by);
  const wRef = CF.CFDictionaryGetValue(boundsDict, extra.bw);
  const hRef = CF.CFDictionaryGetValue(boundsDict, extra.bh);
  return {
    x: xRef ? Math.round(cfReadFloat64(xRef)) : 0,
    y: yRef ? Math.round(cfReadFloat64(yRef)) : 0,
    w: wRef ? Math.round(cfReadFloat64(wRef)) : 0,
    h: hRef ? Math.round(cfReadFloat64(hRef)) : 0,
  };
}

function mac_getBounds(handle: number): { x: number; y: number; w: number; h: number } {
  if (!getCGExtraKeys()) return ZERO_BOUNDS;
  return mac_withWindowDict(handle, mac_getBoundsFromDict, ZERO_BOUNDS);
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

function mac_withAXWindow<T>(handle: number, fn: (axWin: bigint) => T, fallback: T, knownPid?: number): T {
  const AX = ax();
  const CF = cf();
  if (!AX || !CF) return fallback;
  const attrs = getAXAttrs();
  if (!attrs) return fallback;

  const pid = knownPid ?? mac_getPid(handle);
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

  const owned: bigint[] = [sysWide];
  try {
    _axOutBuf[0] = 0n;
    if (AX.AXUIElementCopyAttributeValue(sysWide, attrs.focusedApp, bp(_axOutBuf)) !== 0) return 0;
    const appElem = _axOutBuf[0];
    if (!appElem) return 0;
    owned.push(appElem);

    _axOutBuf[0] = 0n;
    if (AX.AXUIElementCopyAttributeValue(appElem, attrs.focusedWindow, bp(_axOutBuf)) !== 0) return 0;
    const focWin = _axOutBuf[0];
    if (!focWin) return 0;
    owned.push(focWin);

    _widBuf[0] = 0;
    if (AX._AXUIElementGetWindow(focWin, bp(_widBuf)) !== 0) return 0;
    return _widBuf[0];
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) CF.CFRelease(owned[i]);
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
  }, undefined, pid);
}

function mac_isAxEnabled(): boolean {
  const AX = ax();
  return !!AX && AX.AXIsProcessTrusted() !== 0;
}

// ── NAPI-compatible exports ─────────────────────────────────────────
//
// External signatures use `bigint` for window handles to preserve full
// 64-bit precision (HWND on Windows, AXUIElementRef on macOS may exceed
// f64's 52-bit safe integer range). Internally, the X11 / Win32 / mac
// helpers continue to work with `number` since X11 XIDs fit in 32 bits
// and the bun:ffi paths convert at their own boundary; the conversion
// happens at the export shim.

export function window_isValid(handle: bigint): boolean {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h);
  if (IS_MAC) return mac_isValid(h);
  return false;
}

export function window_close(handle: bigint): void {
  const h = Number(handle);
}

export function window_isTopMost(handle: bigint): boolean {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) && win_isTopMost(h);
  if (IS_MAC) {
    const keys = getCGKeys();
    if (!keys) return false;
    return mac_withWindowDict(h, (dict) => {
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

export function window_isBorderless(handle: bigint): boolean {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) && win_isBorderless(h);
  return false;
}

export function window_isMinimized(handle: bigint): boolean {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) && win_isMinimized(h);
  if (IS_MAC) return mac_isMinimized(h);
  return false;
}

export function window_isMaximized(handle: bigint): boolean {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) && win_isMaximized(h);
  if (IS_MAC) return mac_isMaximized(h);
  return false;
}

export function window_setTopMost(handle: bigint, topMost: boolean): void {
  const h = Number(handle);
}

export function window_setBorderless(handle: bigint, borderless: boolean): void {
  const h = Number(handle);
}

export function window_setMinimized(handle: bigint, minimized: boolean): void {
  const h = Number(handle);
}

export function window_setMaximized(handle: bigint, maximized: boolean): void {
  const h = Number(handle);
}

export function window_getProcess(handle: bigint): number {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) ? win_getPid(h) : 0;
  if (IS_MAC) return mac_getPid(h);
  return 0;
}

export function window_getPID(handle: bigint): number {
  return window_getProcess(handle);
}

export function window_getHandle(handle: bigint): bigint { return handle; }

export function window_setHandle(_handle: bigint, newHandle: bigint): boolean {
  if (newHandle === 0n) return true;
  const nh = Number(newHandle);
  if (IS_WIN) return win_isValid(nh);
  if (IS_MAC) return mac_isValid(nh);
  return false;
}

export function window_getTitle(handle: bigint): string {
  const h = Number(handle);
  if (IS_WIN) return win_isValid(h) ? win_getTitle(h) : "";
  if (IS_MAC) return mac_getTitle(h);
  return "";
}

export function window_setTitle(handle: bigint, title: string): void {
  const h = Number(handle);
}

export function window_getBounds(handle: bigint): { x: number; y: number; w: number; h: number } {
  const hh = Number(handle);
  if (IS_WIN) return win_isValid(hh) ? win_getBounds(hh) : { x: 0, y: 0, w: 0, h: 0 };
  if (IS_MAC) return mac_getBounds(hh);
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function window_setBounds(handle: bigint, x: number, y: number, w: number, h: number): void {
  const hh = Number(handle);
}

export function window_getClient(handle: bigint): { x: number; y: number; w: number; h: number } {
  const hh = Number(handle);
  if (IS_WIN) return win_isValid(hh) ? win_getClient(hh) : { x: 0, y: 0, w: 0, h: 0 };
  if (IS_MAC) return mac_getBounds(hh);
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function window_setClient(handle: bigint, x: number, y: number, w: number, h: number): void {
  const hh = Number(handle);
}

export function window_mapToClient(handle: bigint, x: number, y: number): { x: number; y: number } {
  const hh = Number(handle);
  if (IS_WIN) return win_isValid(hh) ? win_mapToClient(hh, x, y) : { x, y };
  if (IS_MAC) {
    const b = mac_getBounds(hh);
    return { x: x - b.x, y: y - b.y };
  }
  return { x, y };
}

export function window_mapToScreen(handle: bigint, x: number, y: number): { x: number; y: number } {
  const hh = Number(handle);
  if (IS_WIN) return win_isValid(hh) ? win_mapToScreen(hh, x, y) : { x, y };
  if (IS_MAC) {
    const b = mac_getBounds(hh);
    return { x: x + b.x, y: y + b.y };
  }
  return { x, y };
}

export function window_getList(regexStr?: string): bigint[] {
  if (IS_WIN) return win_getList(regexStr).map((n) => BigInt(n));
  if (IS_MAC) return mac_getList(regexStr).map((n) => BigInt(n));
  return [];
}

export function window_getActive(): bigint {
  if (IS_WIN) return BigInt(win_getActive());
  if (IS_MAC) return BigInt(mac_getActive());
  return 0n;
}

export function window_setActive(handle: bigint): void {
  if (handle === 0n) return;
  const h = Number(handle);
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  if (IS_WIN) return true;
  if (IS_MAC) return mac_isAxEnabled();
  return false;
}

if (!IS_WIN && !IS_MAC) {
  throw new Error("ffi/window: requires Windows with user32.dll or macOS with CoreGraphics");
}
