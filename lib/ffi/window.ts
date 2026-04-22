/**
 * Window subsystem — pure FFI implementation.
 *
 * Linux: full EWMH window management via libX11 (state, bounds, frame
 * extents, title, enumeration, activation).
 * Windows: Win32 window management via user32.dll (state, bounds, title,
 * enumeration, activation).
 * macOS: CoreGraphics window enumeration + Accessibility framework for
 * window manipulation (title, bounds, minimize, etc.).
 */

import {
  x11, ffi as x11ffi, getDisplay,
  atom, getWindowProperty, getWindowAttributes,
  sendClientMessage, IsViewable, PropModeReplace, CurrentTime,
} from "./x11";
import { user32, winFFI, w2js, js2w } from "./win";
import { getBunFFI, type Pointer } from "./bun";
import { cg, cf, ax, macFFI, cfStringFromJS, cfStringToJS, kCFNumberSInt32Type } from "./mac";

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

// ── macOS constants ─────────────────────────────────────────────────

const kCGWindowListOptionOnScreenOnly = 0x1;
const kCGWindowListExcludeDesktopElements = 0x10;
const kAXValueCGPointType = 1;
const kAXValueCGSizeType = 2;

// ── macOS cached CFString keys ─────────────────────────────────────

let _macKeysInited = false;
let _kCGWindowNumber: Pointer = null;
let _kCGWindowOwnerPID: Pointer = null;
let _kCGWindowName: Pointer = null;
let _kCGWindowBounds: Pointer = null;
let _kCGWindowLayer: Pointer = null;
let _axWindows: Pointer = null;
let _axFocusedWindow: Pointer = null;
let _axFocusedApplication: Pointer = null;
let _axPosition: Pointer = null;
let _axSize: Pointer = null;
let _axTitle: Pointer = null;
let _axMinimized: Pointer = null;
let _axFullScreen: Pointer = null;
let _axRaise: Pointer = null;
let _axSubrole: Pointer = null;
let _axStandardWindow: Pointer = null;

function mac_initKeys(): void {
  if (_macKeysInited) return;
  _macKeysInited = true;
  _kCGWindowNumber = cfStringFromJS("kCGWindowNumber");
  _kCGWindowOwnerPID = cfStringFromJS("kCGWindowOwnerPID");
  _kCGWindowName = cfStringFromJS("kCGWindowName");
  _kCGWindowBounds = cfStringFromJS("kCGWindowBounds");
  _kCGWindowLayer = cfStringFromJS("kCGWindowLayer");
  _axWindows = cfStringFromJS("AXWindows");
  _axFocusedWindow = cfStringFromJS("AXFocusedWindow");
  _axFocusedApplication = cfStringFromJS("AXFocusedApplication");
  _axPosition = cfStringFromJS("AXPosition");
  _axSize = cfStringFromJS("AXSize");
  _axTitle = cfStringFromJS("AXTitle");
  _axMinimized = cfStringFromJS("AXMinimized");
  _axFullScreen = cfStringFromJS("AXFullScreen");
  _axRaise = cfStringFromJS("AXRaise");
  _axSubrole = cfStringFromJS("AXSubrole");
  _axStandardWindow = cfStringFromJS("AXStandardWindow");
}

// ── macOS helpers ──────────────────────────────────────────────────

/** Read a CFNumber (SInt32) from a CFDictionary value. */
function mac_cfDictGetInt32(dict: Pointer, key: Pointer): number {
  const CF = cf();
  const F = macFFI();
  if (!CF || !F || !dict || !key) return 0;
  const val = CF.CFDictionaryGetValue(dict, key);
  if (!val) return 0;
  const buf = new Int32Array(1);
  if (CF.CFNumberGetValue(val, kCFNumberSInt32Type, F.ptr(buf)) === 0) return 0;
  return buf[0];
}

/** Read a CFString from a CFDictionary value. */
function mac_cfDictGetString(dict: Pointer, key: Pointer): string {
  const CF = cf();
  if (!CF || !dict || !key) return "";
  const val = CF.CFDictionaryGetValue(dict, key);
  if (!val) return "";
  return cfStringToJS(val);
}

/**
 * Get the PID that owns the given CGWindowID by scanning
 * CGWindowListCopyWindowInfo.
 */
function mac_getPidForWindow(windowId: number): number {
  const C = cg(); const CF = cf();
  if (!C || !CF) return 0;
  mac_initKeys();
  const info = C.CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!info) return 0;
  const count = Number(CF.CFArrayGetCount(info));
  let pid = 0;
  for (let i = 0; i < count; i++) {
    const dict = CF.CFArrayGetValueAtIndex(info, BigInt(i));
    if (!dict) continue;
    const wid = mac_cfDictGetInt32(dict, _kCGWindowNumber);
    if (wid === windowId) {
      pid = mac_cfDictGetInt32(dict, _kCGWindowOwnerPID);
      break;
    }
  }
  CF.CFRelease(info);
  return pid;
}

/**
 * Find the AXUIElement for a CGWindowID.
 *
 * Strategy: look up the PID, create an AX app element, enumerate
 * AXWindows, and match by _AXUIElementGetWindow.
 * Caller must CFRelease the returned element.
 */
function mac_getAXElement(windowId: number): Pointer {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F) return null;
  mac_initKeys();
  const pid = mac_getPidForWindow(windowId);
  if (pid === 0) return null;
  const app = AX.AXUIElementCreateApplication(pid);
  if (!app) return null;
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(app, _axWindows, F.ptr(valueBuf));
  if (err !== 0 || valueBuf[0] === 0n) {
    CF.CFRelease(app);
    return null;
  }
  const winArray = valueBuf[0] as unknown as Pointer;
  const count = Number(CF.CFArrayGetCount(winArray));
  let found: Pointer = null;
  const widBuf = new Uint32Array(1);
  for (let i = 0; i < count; i++) {
    const elem = CF.CFArrayGetValueAtIndex(winArray, BigInt(i));
    if (!elem) continue;
    widBuf[0] = 0;
    if (AX._AXUIElementGetWindow(elem, F.ptr(widBuf)) === 0 && widBuf[0] === windowId) {
      // Retain the element by not releasing it — caller must CFRelease.
      // CFArrayGetValueAtIndex returns a non-owning reference; we don't
      // need to retain since the array keeps it alive while we hold winArray.
      // But we want the element to survive after we release winArray, so
      // we skip releasing winArray until the caller is done.  Actually,
      // since the caller will use the element synchronously, we can just
      // return a copy — but AXUIElement doesn't have a copy function.
      // Instead, we keep winArray alive by not releasing it here. The
      // caller must release both element and winArray... that's messy.
      //
      // Simpler: just do the operations inline.  But the caller wants a
      // generic element.  Let's use CFRetain-equivalent — actually
      // AXUIElements are CFTypes so CFRetain works, but we don't have
      // CFRetain bound.  Instead, just don't release winArray and return.
      // The small leak is acceptable for short-lived calls.
      found = elem;
      break;
    }
  }
  if (!found) {
    CF.CFRelease(winArray as any);
  }
  CF.CFRelease(app);
  // Note: if found, winArray is intentionally not released so the element
  // pointer remains valid.  This is a small, bounded leak per call.
  return found;
}

/** Get an AX attribute as a CFString and return JS string. */
function mac_getAXString(element: Pointer, attr: Pointer): string {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element || !attr) return "";
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(element, attr, F.ptr(valueBuf));
  if (err !== 0 || valueBuf[0] === 0n) return "";
  const val = valueBuf[0] as unknown as Pointer;
  const s = cfStringToJS(val);
  CF.CFRelease(val);
  return s;
}

/** Get an AX attribute as a boolean. */
function mac_getAXBool(element: Pointer, attr: Pointer): boolean {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element || !attr) return false;
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(element, attr, F.ptr(valueBuf));
  if (err !== 0 || valueBuf[0] === 0n) return false;
  const val = valueBuf[0] as unknown as Pointer;
  const result = CF.CFBooleanGetValue(val) !== 0;
  CF.CFRelease(val);
  return result;
}

/** Get AXPosition as {x, y}. */
function mac_getAXPosition(element: Pointer): { x: number; y: number } | null {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element) return null;
  mac_initKeys();
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(element, _axPosition, F.ptr(valueBuf));
  if (err !== 0 || valueBuf[0] === 0n) return null;
  const val = valueBuf[0] as unknown as Pointer;
  // AXValue wrapping CGPoint — two Float64s
  const point = new Float64Array(2);
  const ok = AX.AXValueGetValue(val, kAXValueCGPointType, F.ptr(point));
  CF.CFRelease(val);
  if (ok === 0) return null;
  return { x: point[0], y: point[1] };
}

/** Get AXSize as {w, h}. */
function mac_getAXSize(element: Pointer): { w: number; h: number } | null {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element) return null;
  mac_initKeys();
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(element, _axSize, F.ptr(valueBuf));
  if (err !== 0 || valueBuf[0] === 0n) return null;
  const val = valueBuf[0] as unknown as Pointer;
  const size = new Float64Array(2);
  const ok = AX.AXValueGetValue(val, kAXValueCGSizeType, F.ptr(size));
  CF.CFRelease(val);
  if (ok === 0) return null;
  return { w: size[0], h: size[1] };
}

/** Set AXPosition. */
function mac_setAXPosition(element: Pointer, x: number, y: number): void {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element) return;
  mac_initKeys();
  const point = new Float64Array([x, y]);
  const val = AX.AXValueCreate(kAXValueCGPointType, F.ptr(point));
  if (!val) return;
  AX.AXUIElementSetAttributeValue(element, _axPosition, val);
  CF.CFRelease(val);
}

/** Set AXSize. */
function mac_setAXSize(element: Pointer, w: number, h: number): void {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F || !element) return;
  mac_initKeys();
  const size = new Float64Array([w, h]);
  const val = AX.AXValueCreate(kAXValueCGSizeType, F.ptr(size));
  if (!val) return;
  AX.AXUIElementSetAttributeValue(element, _axSize, val);
  CF.CFRelease(val);
}

// ── macOS exported-function helpers ────────────────────────────────

function mac_isValid(handle: number): boolean {
  if (handle === 0) return false;
  const C = cg(); const CF = cf();
  if (!C || !CF) return false;
  mac_initKeys();
  const info = C.CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!info) return false;
  const count = Number(CF.CFArrayGetCount(info));
  let found = false;
  for (let i = 0; i < count; i++) {
    const dict = CF.CFArrayGetValueAtIndex(info, BigInt(i));
    if (!dict) continue;
    if (mac_cfDictGetInt32(dict, _kCGWindowNumber) === handle) {
      found = true;
      break;
    }
  }
  CF.CFRelease(info);
  return found;
}

function mac_close(handle: number): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  const AX = ax(); const CF = cf();
  if (!AX || !CF) return;
  // Get the close button via AXCloseButton attribute
  const F = macFFI();
  if (!F) return;
  const closeBtnKey = cfStringFromJS("AXCloseButton");
  if (!closeBtnKey) return;
  const valueBuf = new BigUint64Array(1);
  const err = AX.AXUIElementCopyAttributeValue(elem, closeBtnKey, F.ptr(valueBuf));
  CF.CFRelease(closeBtnKey);
  if (err === 0 && valueBuf[0] !== 0n) {
    const closeBtn = valueBuf[0] as unknown as Pointer;
    const pressAction = cfStringFromJS("AXPress");
    if (pressAction) {
      AX.AXUIElementPerformAction(closeBtn, pressAction);
      CF.CFRelease(pressAction);
    }
    CF.CFRelease(closeBtn);
  }
}

function mac_isTopMost(handle: number): boolean {
  const C = cg(); const CF = cf();
  if (!C || !CF) return false;
  mac_initKeys();
  const info = C.CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!info) return false;
  const count = Number(CF.CFArrayGetCount(info));
  let topMost = false;
  for (let i = 0; i < count; i++) {
    const dict = CF.CFArrayGetValueAtIndex(info, BigInt(i));
    if (!dict) continue;
    if (mac_cfDictGetInt32(dict, _kCGWindowNumber) === handle) {
      const layer = mac_cfDictGetInt32(dict, _kCGWindowLayer);
      topMost = layer > 0;
      break;
    }
  }
  CF.CFRelease(info);
  return topMost;
}

function mac_isBorderless(handle: number): boolean {
  const elem = mac_getAXElement(handle);
  if (!elem) return false;
  mac_initKeys();
  const subrole = mac_getAXString(elem, _axSubrole);
  // AXStandardWindow means it has a standard window frame (not borderless).
  // If the subrole is something else (e.g. AXDialog, AXFloatingWindow),
  // it may or may not have a border, but for our purposes only
  // AXStandardWindow has a definite border.
  return subrole !== "" && subrole !== "AXStandardWindow";
}

function mac_isMinimized(handle: number): boolean {
  const elem = mac_getAXElement(handle);
  if (!elem) return false;
  mac_initKeys();
  return mac_getAXBool(elem, _axMinimized);
}

function mac_isMaximized(handle: number): boolean {
  // On macOS, "maximized" is approximated by checking if the window fills
  // the screen.  There's also AXFullScreen.
  const elem = mac_getAXElement(handle);
  if (!elem) return false;
  mac_initKeys();
  if (mac_getAXBool(elem, _axFullScreen)) return true;
  // Compare window bounds to main display size
  const C = cg();
  if (!C) return false;
  const pos = mac_getAXPosition(elem);
  const size = mac_getAXSize(elem);
  if (!pos || !size) return false;
  const screenW = Number(C.CGDisplayPixelsWide(C.CGMainDisplayID()));
  const screenH = Number(C.CGDisplayPixelsHigh(C.CGMainDisplayID()));
  // Consider maximized if window occupies nearly all of the screen
  return pos.x <= 0 && pos.y <= 25 && size.w >= screenW - 1 && size.h >= screenH - 26;
}

function mac_setTopMost(_handle: number, _topMost: boolean): void {
  // macOS does not provide a public API for setting window level from
  // another process.  This is a no-op.
}

function mac_setBorderless(_handle: number, _borderless: boolean): void {
  // macOS does not provide a public API for adding/removing window
  // decorations from another process.  This is a no-op.
}

function mac_setMinimized(handle: number, minimized: boolean): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  const AX = ax(); const CF = cf();
  if (!AX || !CF) return;
  mac_initKeys();
  const val = cfStringFromJS(minimized ? "true" : "false");
  // AXMinimized takes a CFBoolean, not a CFString.  Use kCFBooleanTrue /
  // kCFBooleanFalse.  These are singletons we can obtain via
  // CFBooleanGetValue — but we need the pointer itself.
  // Actually, AXUIElementSetAttributeValue with the attribute kAXMinimizedAttribute
  // accepts a CFBoolean.  We need the kCFBooleanTrue/False pointers.
  // We can get them via resolving symbols, or we can use the simpler approach:
  // just use AXUIElementPerformAction with minimize/deminiaturize if available.
  if (val) CF.CFRelease(val);

  if (minimized) {
    const action = cfStringFromJS("AXMinimize");
    if (action) {
      AX.AXUIElementPerformAction(elem, action);
      CF.CFRelease(action);
    }
  } else {
    // Un-minimize by raising
    AX.AXUIElementPerformAction(elem, _axRaise!);
  }
}

function mac_setMaximized(handle: number, maximized: boolean): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  const AX = ax(); const CF = cf();
  if (!AX || !CF) return;
  mac_initKeys();
  if (maximized) {
    // Enter fullscreen
    const fullScreenKey = cfStringFromJS("AXFullScreen");
    if (fullScreenKey) {
      // Try toggling the zoom action first
      const zoomAction = cfStringFromJS("AXZoomAction");
      if (zoomAction) {
        AX.AXUIElementPerformAction(elem, zoomAction);
        CF.CFRelease(zoomAction);
      }
      CF.CFRelease(fullScreenKey);
    }
  } else {
    // If fullscreen, toggle out
    if (mac_getAXBool(elem, _axFullScreen)) {
      const zoomAction = cfStringFromJS("AXZoomAction");
      if (zoomAction) {
        AX.AXUIElementPerformAction(elem, zoomAction);
        CF.CFRelease(zoomAction);
      }
    }
  }
}

function mac_getPid(handle: number): number {
  mac_initKeys();
  return mac_getPidForWindow(handle);
}

function mac_getTitle(handle: number): string {
  // Try CGWindowListCopyWindowInfo first (no Accessibility needed)
  const C = cg(); const CF = cf();
  if (!C || !CF) return "";
  mac_initKeys();
  const info = C.CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!info) return "";
  const count = Number(CF.CFArrayGetCount(info));
  let title = "";
  for (let i = 0; i < count; i++) {
    const dict = CF.CFArrayGetValueAtIndex(info, BigInt(i));
    if (!dict) continue;
    if (mac_cfDictGetInt32(dict, _kCGWindowNumber) === handle) {
      title = mac_cfDictGetString(dict, _kCGWindowName);
      break;
    }
  }
  CF.CFRelease(info);
  // Fall back to AX if CGWindowList didn't return a title
  if (title === "") {
    const elem = mac_getAXElement(handle);
    if (elem) {
      title = mac_getAXString(elem, _axTitle);
    }
  }
  return title;
}

function mac_setTitle(handle: number, title: string): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  const AX = ax(); const CF = cf();
  if (!AX || !CF) return;
  mac_initKeys();
  const val = cfStringFromJS(title);
  if (!val) return;
  AX.AXUIElementSetAttributeValue(elem, _axTitle, val);
  CF.CFRelease(val);
}

function mac_getBounds(handle: number): { x: number; y: number; w: number; h: number } {
  const elem = mac_getAXElement(handle);
  if (!elem) return { x: 0, y: 0, w: 0, h: 0 };
  const pos = mac_getAXPosition(elem);
  const size = mac_getAXSize(elem);
  if (!pos || !size) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: Math.round(pos.x), y: Math.round(pos.y), w: Math.round(size.w), h: Math.round(size.h) };
}

function mac_setBounds(handle: number, x: number, y: number, w: number, h: number): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  mac_setAXPosition(elem, x, y);
  mac_setAXSize(elem, Math.max(1, w), Math.max(1, h));
}

function mac_getList(regexStr?: string): number[] {
  const C = cg(); const CF = cf();
  if (!C || !CF) return [];
  mac_initKeys();
  const info = C.CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!info) return [];
  const count = Number(CF.CFArrayGetCount(info));
  const results: number[] = [];
  const re = makeRegex(regexStr);
  for (let i = 0; i < count; i++) {
    const dict = CF.CFArrayGetValueAtIndex(info, BigInt(i));
    if (!dict) continue;
    const wid = mac_cfDictGetInt32(dict, _kCGWindowNumber);
    if (wid === 0) continue;
    // Skip windows at negative layer (desktop elements that slipped through)
    const layer = mac_cfDictGetInt32(dict, _kCGWindowLayer);
    if (layer < 0) continue;
    if (re) {
      const name = mac_cfDictGetString(dict, _kCGWindowName);
      if (!re.test(name)) continue;
    }
    results.push(wid);
  }
  CF.CFRelease(info);
  return results;
}

function mac_getActive(): number {
  const AX = ax(); const CF = cf(); const F = macFFI();
  if (!AX || !CF || !F) return 0;
  mac_initKeys();
  const systemWide = AX.AXUIElementCreateSystemWide();
  if (!systemWide) return 0;

  // Get focused application
  const appBuf = new BigUint64Array(1);
  let err = AX.AXUIElementCopyAttributeValue(systemWide, _axFocusedApplication, F.ptr(appBuf));
  CF.CFRelease(systemWide);
  if (err !== 0 || appBuf[0] === 0n) return 0;
  const app = appBuf[0] as unknown as Pointer;

  // Get focused window
  const winBuf = new BigUint64Array(1);
  err = AX.AXUIElementCopyAttributeValue(app, _axFocusedWindow, F.ptr(winBuf));
  CF.CFRelease(app);
  if (err !== 0 || winBuf[0] === 0n) return 0;
  const win = winBuf[0] as unknown as Pointer;

  // Get CGWindowID from AXUIElement
  const widBuf = new Uint32Array(1);
  err = AX._AXUIElementGetWindow(win, F.ptr(widBuf));
  CF.CFRelease(win);
  if (err !== 0) return 0;
  return widBuf[0];
}

function mac_setActive(handle: number): void {
  const elem = mac_getAXElement(handle);
  if (!elem) return;
  const AX = ax();
  if (!AX) return;
  mac_initKeys();
  AX.AXUIElementPerformAction(elem, _axRaise!);

  // Also bring the owning application to front via NSRunningApplication
  const pid = mac_getPidForWindow(handle);
  if (pid !== 0) {
    const O = macFFI();
    if (O) {
      // Use objc_msgSend to call
      // [[NSRunningApplication runningApplicationWithProcessIdentifier:pid]
      //   activateWithOptions:NSApplicationActivateIgnoringOtherApps]
      // This requires typed msgSend variants; for simplicity we just use
      // AXRaise which is usually sufficient.
    }
  }
}

function mac_isAxEnabled(prompt?: boolean): boolean {
  const AX = ax();
  if (!AX) return false;
  if (prompt) {
    // Build options dict with kAXTrustedCheckOptionPrompt = true
    // For simplicity, just check without prompting — the prompt variant
    // requires building a CFDictionary which is complex with current bindings.
    return AX.AXIsProcessTrusted() !== 0;
  }
  return AX.AXIsProcessTrusted() !== 0;
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
  if (IS_MAC) return mac_isValid(handle) && mac_isTopMost(handle);
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
  if (IS_MAC) return mac_isValid(handle) && mac_isBorderless(handle);
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setTopMost(handle, topMost);
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
  } else if (IS_MAC) {
    if (!mac_isValid(handle)) return;
    mac_setBorderless(handle, borderless);
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
  if (IS_LINUX) return winIsValid(handle) ? getPid(BigInt(handle)) : 0;
  if (IS_WIN) return win_isValid(handle) ? win_getPid(handle) : 0;
  if (IS_MAC) return mac_isValid(handle) ? mac_getPid(handle) : 0;
  return 0;
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
    const buf = new TextEncoder().encode(title);
    const nul = new Uint8Array(buf.length + 1);
    nul.set(buf);
    nul[buf.length] = 0;
    X.XStoreName(d, BigInt(handle), F.ptr(nul));
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
  // macOS has no frame extents concept — client == bounds
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
    // macOS has no frame extents concept — client == bounds
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
  if (IS_MAC) return mac_isAxEnabled(prompt);
  return false;
}

if (!IS_LINUX && !IS_WIN && !IS_MAC) {
  throw new Error("ffi/window: requires Linux with libX11, Windows with user32.dll, or macOS");
}
if (IS_LINUX && !getDisplay()) {
  throw new Error("ffi/window: requires Linux with libX11 (no display available)");
}
