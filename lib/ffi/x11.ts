/**
 * Linux/X11 FFI helpers shared between subsystems.
 *
 * Opens libX11 and libXtst once per process, caches the Display* and the
 * XTest extension availability check.
 */

import { getBunFFI, cstr, type BunFFI, type Pointer } from "./bun";

interface X11 {
  XOpenDisplay: (name: Pointer) => Pointer;
  XSync: (display: Pointer, discard: number) => number;
  XKeysymToKeycode: (display: Pointer, keysym: bigint) => number;
  XQueryKeymap: (display: Pointer, keys: Pointer) => number;
  XScreenCount: (display: Pointer) => number;
  XDefaultRootWindow: (display: Pointer) => bigint;
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

let _opened = false;
let _ffi: BunFFI | null = null;
let _x11: X11 | null = null;
let _xtest: XTest | null = null;
let _display: Pointer = null;
let _xtestAvailable = false;

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  const T = _ffi.FFIType;

  try {
    const x11 = _ffi.dlopen<X11>("libX11.so.6", {
      XOpenDisplay:       { args: [T.cstring], returns: T.ptr },
      XSync:              { args: [T.ptr, T.i32], returns: T.i32 },
      XKeysymToKeycode:   { args: [T.ptr, T.u64], returns: T.u8 },
      XQueryKeymap:       { args: [T.ptr, T.ptr], returns: T.i32 },
      XScreenCount:       { args: [T.ptr], returns: T.i32 },
      XDefaultRootWindow: { args: [T.ptr], returns: T.u64 },
      XRootWindow:        { args: [T.ptr, T.i32], returns: T.u64 },
      XQueryPointer:      {
        args: [T.ptr, T.u64, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr],
        returns: T.i32,
      },
      XWarpPointer:       {
        args: [T.ptr, T.u64, T.u64, T.i32, T.i32, T.u32, T.u32, T.i32, T.i32],
        returns: T.i32,
      },
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
}

export function getDisplay(): Pointer {
  tryDlopen();
  return _display;
}

export function isXTestAvailable(): boolean {
  tryDlopen();
  return _xtestAvailable;
}

export function x11(): X11 | null {
  tryDlopen();
  return _x11;
}

export function xtest(): XTest | null {
  tryDlopen();
  return _xtest;
}

export function ffi(): BunFFI | null {
  tryDlopen();
  return _ffi;
}

export const True = 1;
export const False = 0;
export const CurrentTime = 0n;
