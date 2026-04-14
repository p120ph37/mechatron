/**
 * Linux/X11 FFI helpers shared between subsystems.
 *
 * Opens libX11 (and optionally libXtst, libXrandr) once per process,
 * caches the Display* and the XTest / XRandR extension availability checks.
 *
 * XRandR 1.5 (XRRGetMonitors) replaces the older Xinerama query: modern
 * X servers ship libXrandr.so.2 by default and RandR exposes primary-
 * monitor / per-output metadata that Xinerama cannot.
 *
 * Keep all X11 symbols used by any subsystem in this single shared dlopen so
 * they all reference the same Display.
 */

import { getBunFFI, cstr, type BunFFI, type Pointer } from "./bun";

interface X11 {
  XOpenDisplay: (name: Pointer) => Pointer;
  XSync: (display: Pointer, discard: number) => number;
  XKeysymToKeycode: (display: Pointer, keysym: bigint) => number;
  XQueryKeymap: (display: Pointer, keys: Pointer) => number;
  XScreenCount: (display: Pointer) => number;
  XDefaultRootWindow: (display: Pointer) => bigint;
  XDefaultScreen: (display: Pointer) => number;
  XScreenOfDisplay: (display: Pointer, screen: number) => Pointer;
  // Screen*-typed args are declared T.u64 to accept bigint from
  // getBigUint64 readers; see dlopen spec.  Keeping the TS type as
  // `Pointer | bigint` so that callers working from either an
  // XScreenOfDisplay return (Pointer) or a getBigUint64-read field
  // (bigint) both type-check.
  XWidthOfScreen: (screen: Pointer | bigint) => number;
  XHeightOfScreen: (screen: Pointer | bigint) => number;
  XScreenNumberOfScreen: (screen: Pointer | bigint) => number;
  XRootWindow: (display: Pointer, screen: number) => bigint;
  XQueryPointer: (
    display: Pointer, w: bigint,
    rootRet: Pointer, childRet: Pointer,
    rootXRet: Pointer, rootYRet: Pointer,
    winXRet: Pointer, winYRet: Pointer,
    maskRet: Pointer,
  ) => number;
  XWarpPointer: (
    display: Pointer, srcW: bigint, dstW: bigint,
    srcX: number, srcY: number,
    srcWidth: number, srcHeight: number,
    destX: number, destY: number,
  ) => number;
  // Atoms / properties
  XInternAtom: (display: Pointer, name: Pointer, onlyIfExists: number) => bigint;
  XGetWindowProperty: (
    display: Pointer, w: bigint, prop: bigint,
    long_offset: bigint, long_length: bigint, del: number, req_type: bigint,
    actual_type_ret: Pointer, actual_format_ret: Pointer,
    nitems_ret: Pointer, bytes_after_ret: Pointer,
    prop_ret: Pointer,
  ) => number;
  XChangeProperty: (
    display: Pointer, w: bigint, prop: bigint, type: bigint,
    format: number, mode: number, data: Pointer, nelements: number,
  ) => number;
  XFree: (data: Pointer) => number;
  // Window tree / attributes
  XQueryTree: (
    display: Pointer, w: bigint,
    root_ret: Pointer, parent_ret: Pointer,
    children_ret: Pointer, nchildren_ret: Pointer,
  ) => number;
  XGetWindowAttributes: (display: Pointer, w: bigint, attrs_ret: Pointer) => number;
  // Window manipulation
  XStoreName: (display: Pointer, w: bigint, name: Pointer) => number;
  XDestroyWindow: (display: Pointer, w: bigint) => number;
  XMapWindow: (display: Pointer, w: bigint) => number;
  XRaiseWindow: (display: Pointer, w: bigint) => number;
  XIconifyWindow: (display: Pointer, w: bigint, screen: number) => number;
  XMoveResizeWindow: (
    display: Pointer, w: bigint, x: number, y: number, width: number, height: number,
  ) => number;
  XSendEvent: (
    display: Pointer, w: bigint, propagate: number, event_mask: bigint, event: Pointer,
  ) => number;
  XTranslateCoordinates: (
    display: Pointer, src: bigint, dest: bigint,
    src_x: number, src_y: number,
    dest_x_ret: Pointer, dest_y_ret: Pointer,
    child_ret: Pointer,
  ) => number;
  // Image (screen capture)
  XGetImage: (
    display: Pointer, drawable: bigint,
    x: number, y: number, width: number, height: number,
    plane_mask: bigint, format: number,
  ) => Pointer;
  XDestroyImage: (img: Pointer) => number;
  XGetPixel: (img: Pointer, x: number, y: number) => bigint;
  // Error handler suppression
  XSetErrorHandler: (handler: Pointer) => Pointer;
}

interface XTest {
  XTestQueryExtension: (
    display: Pointer,
    eventBaseRet: Pointer, errorBaseRet: Pointer,
    majorRet: Pointer, minorRet: Pointer,
  ) => number;
  XTestFakeKeyEvent: (
    display: Pointer, keycode: number, isPress: number, delay: bigint,
  ) => number;
  XTestFakeButtonEvent: (
    display: Pointer, button: number, isPress: number, delay: bigint,
  ) => number;
}

interface XRandR {
  XRRQueryExtension: (
    display: Pointer, eventBaseRet: Pointer, errorBaseRet: Pointer,
  ) => number;
  XRRQueryVersion: (
    display: Pointer, majorRet: Pointer, minorRet: Pointer,
  ) => number;
  XRRGetMonitors: (
    display: Pointer, window: bigint, getActive: number, nmonitorsRet: Pointer,
  ) => Pointer;
  XRRFreeMonitors: (monitors: Pointer) => number;
}

let _opened = false;
let _ffi: BunFFI | null = null;
let _x11: X11 | null = null;
let _xtest: XTest | null = null;
let _xrandr: XRandR | null = null;
let _display: Pointer = null;
let _xtestAvailable = false;
let _xrandrAvailable = false;

// Keep a strong reference to the error-handler JSCallback — if it's GC'd
// while Xlib still holds the function pointer, the next X error becomes a
// SIGSEGV.  One handler per process is sufficient; Xlib stores the latest
// pointer globally.
let _errorHandler: { ptr: Pointer; close(): void } | null = null;

function installSilentErrorHandler(ffi: BunFFI, x: X11): void {
  if (_errorHandler) return;
  const T = ffi.FFIType;
  try {
    _errorHandler = new ffi.JSCallback(
      // (Display* display, XErrorEvent* ev) -> int
      // Ignore the error; Xlib will return normally and the calling
      // wrapper observes the failure through its own return value.
      () => 0,
      { args: [T.ptr, T.ptr], returns: T.i32 },
    );
    x.XSetErrorHandler(_errorHandler.ptr);
  } catch (_) {
    // Older Bun versions without JSCallback leave the default handler
    // in place; errors will still crash the process but at least the
    // FFI backend loads.
    _errorHandler = null;
  }
}

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  const T = _ffi.FFIType;

  try {
    const x11 = _ffi.dlopen<X11>("libX11.so.6", {
      XOpenDisplay:           { args: [T.cstring], returns: T.ptr },
      XSync:                  { args: [T.ptr, T.i32], returns: T.i32 },
      XKeysymToKeycode:       { args: [T.ptr, T.u64], returns: T.u8 },
      XQueryKeymap:           { args: [T.ptr, T.ptr], returns: T.i32 },
      XScreenCount:           { args: [T.ptr], returns: T.i32 },
      XDefaultRootWindow:     { args: [T.ptr], returns: T.u64 },
      XDefaultScreen:         { args: [T.ptr], returns: T.i32 },
      XScreenOfDisplay:       { args: [T.ptr, T.i32], returns: T.ptr },
      // Screen*-typed args are declared T.u64: we retrieve the pointer via
      // getBigUint64 out of an XWindowAttributes struct (getWindowAttributes
      // in window.ts), so it arrives as a JS bigint.  Bun's T.ptr coerction
      // rejects bigint ("Unable to convert N to a pointer"); T.u64 has the
      // same ABI on every 64-bit OS and accepts bigint directly — same
      // trick the XFree / XDestroyImage / XGetPixel declarations use.
      XWidthOfScreen:         { args: [T.u64], returns: T.i32 },
      XHeightOfScreen:        { args: [T.u64], returns: T.i32 },
      XScreenNumberOfScreen:  { args: [T.u64], returns: T.i32 },
      XRootWindow:            { args: [T.ptr, T.i32], returns: T.u64 },
      XQueryPointer:          {
        args: [T.ptr, T.u64, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr],
        returns: T.i32,
      },
      XWarpPointer:           {
        args: [T.ptr, T.u64, T.u64, T.i32, T.i32, T.u32, T.u32, T.i32, T.i32],
        returns: T.i32,
      },
      XInternAtom:            { args: [T.ptr, T.ptr, T.i32], returns: T.u64 },
      XGetWindowProperty:     {
        args: [T.ptr, T.u64, T.u64, T.i64, T.i64, T.i32, T.u64,
               T.ptr, T.ptr, T.ptr, T.ptr, T.ptr],
        returns: T.i32,
      },
      XChangeProperty:        {
        args: [T.ptr, T.u64, T.u64, T.u64, T.i32, T.i32, T.ptr, T.i32],
        returns: T.i32,
      },
      // XFree/XDestroyImage take a pointer we hold as a bigint (it came
      // from a BigUint64Array out-param or a T.u64 return), and Bun's T.ptr
      // argument coercion rejects bigint with "Unable to convert N to a
      // pointer".  T.u64 has identical ABI to T.ptr on every 64-bit OS and
      // accepts bigint directly, so we declare the arg as u64.
      XFree:                  { args: [T.u64], returns: T.i32 },
      XQueryTree:             {
        args: [T.ptr, T.u64, T.ptr, T.ptr, T.ptr, T.ptr],
        returns: T.i32,
      },
      XGetWindowAttributes:   { args: [T.ptr, T.u64, T.ptr], returns: T.i32 },
      XStoreName:             { args: [T.ptr, T.u64, T.ptr], returns: T.i32 },
      XDestroyWindow:         { args: [T.ptr, T.u64], returns: T.i32 },
      XMapWindow:             { args: [T.ptr, T.u64], returns: T.i32 },
      XRaiseWindow:           { args: [T.ptr, T.u64], returns: T.i32 },
      XIconifyWindow:         { args: [T.ptr, T.u64, T.i32], returns: T.i32 },
      XMoveResizeWindow:      {
        args: [T.ptr, T.u64, T.i32, T.i32, T.u32, T.u32],
        returns: T.i32,
      },
      XSendEvent:             {
        args: [T.ptr, T.u64, T.i32, T.i64, T.ptr],
        returns: T.i32,
      },
      XTranslateCoordinates:  {
        args: [T.ptr, T.u64, T.u64, T.i32, T.i32, T.ptr, T.ptr, T.ptr],
        returns: T.i32,
      },
      XGetImage:              {
        args: [T.ptr, T.u64, T.i32, T.i32, T.u32, T.u32, T.u64, T.i32],
        returns: T.ptr,
      },
      XDestroyImage:          { args: [T.u64], returns: T.i32 },
      XGetPixel:              { args: [T.u64, T.i32, T.i32], returns: T.u64 },
      XSetErrorHandler:       { args: [T.ptr], returns: T.ptr },
    });
    _x11 = x11.symbols;
  } catch (_) {
    _x11 = null;
    return;
  }

  try {
    const xtest = _ffi.dlopen<XTest>("libXtst.so.6", {
      XTestQueryExtension:  {
        args: [T.ptr, T.ptr, T.ptr, T.ptr, T.ptr], returns: T.i32,
      },
      XTestFakeKeyEvent:    { args: [T.ptr, T.u32, T.i32, T.u64], returns: T.i32 },
      XTestFakeButtonEvent: { args: [T.ptr, T.u32, T.i32, T.u64], returns: T.i32 },
    });
    _xtest = xtest.symbols;
  } catch (_) {
    _xtest = null;
  }

  try {
    const xrr = _ffi.dlopen<XRandR>("libXrandr.so.2", {
      XRRQueryExtension: { args: [T.ptr, T.ptr, T.ptr], returns: T.i32 },
      XRRQueryVersion:   { args: [T.ptr, T.ptr, T.ptr], returns: T.i32 },
      // window is u64 (XID); matches the XQueryTree / XRootWindow handles
      // we hold as bigint elsewhere.  Return is XRRMonitorInfo* array,
      // which we read through F.read.* — keep as T.ptr so Bun returns a
      // native Pointer (not bigint) we can normalise to Number below.
      XRRGetMonitors:    { args: [T.ptr, T.u64, T.i32, T.ptr], returns: T.ptr },
      // XRRFreeMonitors takes a pointer we hold as bigint (from T.ptr
      // return normalised via Number(ptr) into Number form); declare as
      // u64 so Bun accepts either bigint or Number.
      XRRFreeMonitors:   { args: [T.u64], returns: T.i32 },
    });
    _xrandr = xrr.symbols;
  } catch (_) {
    _xrandr = null;
  }

  // Install a silent XErrorHandler BEFORE opening the display.  Without
  // this, Xlib's built-in handler prints the error and calls exit(1) on
  // any X protocol error (e.g. BadWindow when a window handle we obtained
  // via XQueryTree is destroyed before we can read its properties — a
  // benign TOCTOU race that happens constantly when enumerating windows
  // under a live WM).  Returning 0 from the handler tells Xlib to
  // continue; the calling API will observe the failure through its own
  // return value (0/null/status != Success) and we handle it there.
  installSilentErrorHandler(_ffi, _x11);

  _display = _x11.XOpenDisplay(_ffi.ptr(cstr("")));

  if (_display && _xtest) {
    const evBase = new Int32Array(1);
    const errBase = new Int32Array(1);
    const major = new Int32Array(1);
    const minor = new Int32Array(1);
    const r = _xtest.XTestQueryExtension(
      _display,
      _ffi.ptr(evBase), _ffi.ptr(errBase),
      _ffi.ptr(major), _ffi.ptr(minor),
    );
    _xtestAvailable = r !== 0;
  }

  if (_display && _xrandr) {
    // XRRQueryVersion() returns non-zero on success and writes the server's
    // advertised RandR version.  We require 1.5 for XRRGetMonitors, which
    // has shipped in every X.org since 2015 — so this only filters out
    // the (rare) legacy servers; the screen subsystem then falls back to
    // the single-XScreenOfDisplay path.
    const evBase = new Int32Array(1);
    const errBase = new Int32Array(1);
    const queryR = _xrandr.XRRQueryExtension(_display, _ffi.ptr(evBase), _ffi.ptr(errBase));
    if (queryR !== 0) {
      const major = new Int32Array(1);
      const minor = new Int32Array(1);
      const verR = _xrandr.XRRQueryVersion(_display, _ffi.ptr(major), _ffi.ptr(minor));
      if (verR !== 0 && (major[0] > 1 || (major[0] === 1 && minor[0] >= 5))) {
        _xrandrAvailable = true;
      }
    }
  }
}

export function getDisplay(): Pointer {
  tryDlopen();
  return _display;
}

export function isXTestAvailable(): boolean {
  tryDlopen();
  return _xtestAvailable;
}

export function isXrandrAvailable(): boolean {
  tryDlopen();
  return _xrandrAvailable;
}

export function x11(): X11 | null {
  tryDlopen();
  return _x11;
}

export function xtest(): XTest | null {
  tryDlopen();
  return _xtest;
}

export function xrandr(): XRandR | null {
  tryDlopen();
  return _xrandr;
}

export function ffi(): BunFFI | null {
  tryDlopen();
  return _ffi;
}

export const True = 1;
export const False = 0;
export const CurrentTime = 0n;

// XGetImage formats / planes
export const ZPixmap = 2;
export const AllPlanes = 0xFFFFFFFFFFFFFFFFn;

// Window attribute map_state values
export const IsViewable = 2;

// Property modes
export const PropModeReplace = 0;

// Event types
export const ClientMessage = 33;

// Property type Atoms (predefined)
export const XA_CARDINAL = 6n;
export const AnyPropertyType = 0n;

// Event mask bits
export const SubstructureNotifyMask = (1 << 19);
export const SubstructureRedirectMask = (1 << 20);

/**
 * Helper: intern an atom by name, with caching.  Returns 0 if the display
 * is not open.
 */
const _atomCache = new Map<string, bigint>();
export function atom(name: string, onlyIfExists = true): bigint {
  if (_atomCache.has(name)) return _atomCache.get(name)!;
  const X = x11();
  const F = ffi();
  const d = getDisplay();
  if (!X || !F || !d) return 0n;
  const buf = cstr(name);
  const a = X.XInternAtom(d, F.ptr(buf), onlyIfExists ? True : False);
  _atomCache.set(name, a);
  return a;
}

/**
 * Helper: read an entire X11 window property (concatenating the long-offset
 * pages).  Returns the raw pointer to the property data plus its length and
 * format, or null if the property isn't set / read failed.
 *
 * Caller is responsible for calling XFree() on the returned pointer.
 *
 * For typical use (single 32-bit value or short list) one call with
 * length=1024 longs is enough — Robot's C++ code does the same.
 */
export interface PropResult {
  data: Pointer;       // raw pointer; XFree to release
  type: bigint;        // actual_type_return
  format: number;      // 8/16/32
  nitems: bigint;      // number of items
}

export function getWindowProperty(
  win: bigint, prop: bigint, reqType: bigint = AnyPropertyType,
): PropResult | null {
  const X = x11();
  const F = ffi();
  const d = getDisplay();
  if (!X || !F || !d || prop === 0n) return null;

  const actual_type = new BigUint64Array(1);
  const actual_format = new Int32Array(1);
  const nitems = new BigUint64Array(1);
  const bytes_after = new BigUint64Array(1);
  const prop_ret = new BigUint64Array(1);

  const status = X.XGetWindowProperty(
    d, win, prop, 0n, 1024n, False, reqType,
    F.ptr(actual_type), F.ptr(actual_format),
    F.ptr(nitems), F.ptr(bytes_after),
    F.ptr(prop_ret),
  );
  if (status !== 0) return null;
  const dataPtr = prop_ret[0];
  if (dataPtr === 0n) return null;
  return {
    data: dataPtr,
    type: actual_type[0],
    format: actual_format[0],
    nitems: nitems[0],
  };
}

/**
 * XWindowAttributes layout (offsets are stable across glibc x86_64/arm64):
 *   int  x, y;                  // 0,4
 *   int  width, height;         // 8,12
 *   int  border_width;          // 16
 *   int  depth;                 // 20
 *   Visual *visual;             // 24
 *   Window root;                // 32
 *   int  class;                 // 40
 *   int  bit_gravity;           // 44
 *   int  win_gravity;           // 48
 *   int  backing_store;         // 52
 *   ulong backing_planes;       // 56
 *   ulong backing_pixel;        // 64
 *   Bool save_under;            // 72
 *   Colormap colormap;          // 80
 *   Bool map_installed;         // 88
 *   int  map_state;             // 92
 *   long all_event_masks;       // 96
 *   long your_event_mask;       // 104
 *   long do_not_propagate_mask; // 112
 *   Bool override_redirect;     // 120
 *   Screen *screen;             // 128
 * Total: 136 bytes.  Pad to 144 for alignment safety.
 */
export const SIZEOF_XWindowAttributes = 144;

export interface WindowAttrs {
  x: number; y: number;
  width: number; height: number;
  map_state: number;
  screen: bigint; // pointer to Screen
}

export function getWindowAttributes(win: bigint): WindowAttrs | null {
  const X = x11();
  const F = ffi();
  const d = getDisplay();
  if (!X || !F || !d) return null;
  const buf = new ArrayBuffer(SIZEOF_XWindowAttributes);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (X.XGetWindowAttributes(d, win, F.ptr(u8)) === 0) return null;
  return {
    x:         v.getInt32(0, true),
    y:         v.getInt32(4, true),
    width:     v.getInt32(8, true),
    height:    v.getInt32(12, true),
    map_state: v.getInt32(92, true),
    screen:    v.getBigUint64(128, true),
  };
}

/**
 * Send an EWMH _NET_WM_STATE / _NET_ACTIVE_WINDOW client-message event.
 *
 * XClientMessageEvent layout (relevant fields, x86_64):
 *   int    type;          // 0
 *   ulong  serial;        // 8
 *   Bool   send_event;    // 16
 *   Display *display;     // 24
 *   Window window;        // 32
 *   Atom   message_type;  // 40
 *   int    format;        // 48
 *   union { char b[20]; short s[10]; long l[5]; } data;  // 56  (40 bytes)
 * Total ~96 bytes.  Pad to 96.
 */
export const SIZEOF_XEvent = 96;

export function sendClientMessage(
  rootScreen: number, win: bigint, messageType: bigint, longs: bigint[],
): void {
  const X = x11();
  const F = ffi();
  const d = getDisplay();
  if (!X || !F || !d) return;
  const buf = new ArrayBuffer(SIZEOF_XEvent);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  v.setInt32(0, ClientMessage, true);
  v.setBigUint64(24, BigInt(d as any), true);
  v.setBigUint64(32, win, true);
  v.setBigUint64(40, messageType, true);
  v.setInt32(48, 32, true);
  for (let i = 0; i < 5; i++) {
    v.setBigInt64(56 + i * 8, longs[i] || 0n, true);
  }
  const root = X.XRootWindow(d, rootScreen);
  X.XSendEvent(d, root, False,
    BigInt(SubstructureNotifyMask | SubstructureRedirectMask),
    F.ptr(u8));
}
