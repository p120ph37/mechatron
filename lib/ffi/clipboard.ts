/**
 * Clipboard subsystem — pure FFI implementation.
 *
 * Linux: TODO. ffi[x11] should imitate napi[x11] — dlopen libX11.so and
 * own the ICCCM CLIPBOARD selection from a dedicated invisible window,
 * answering SelectionRequest events for UTF8_STRING / image/png / TARGETS
 * via XSetSelectionOwner / XConvertSelection / XGetWindowProperty in an
 * event loop. Wayland support is a separate ffi[portal] variant (a future
 * lib/ffi/clipboard-portal.ts that dlopens libwayland-client.so and
 * speaks wlr-data-control-unstable-v1).  Until those land, Linux callers
 * get clipboard via:
 *   - `nolib[x11]` — pure-TS xproto SELECTION protocol
 *   - `nolib[sh]`  — wl-copy / xclip / xsel subprocess wrappers
 *
 * Windows uses CF_UNICODETEXT (UTF-16LE NUL-terminated) and CF_DIB
 * (BITMAPINFOHEADER + pixel rows).  Memory is allocated with GMEM_MOVEABLE
 * and ownership transfers to the clipboard on a successful SetClipboardData.
 *
 * macOS dispatches to `NSPasteboard` / `NSImage` via dlopen'd
 * `objc_msgSend`.  `msgSendTyped()` (from ./mac.ts) wraps the raw pointer
 * with per-signature CFunctions so we can call methods with whatever arg
 * layout they need without dlopening the symbol multiple times.
 */

import { user32, kernel32, winFFI, w2js, js2w } from "./win";
import {
  cg, cf, objc, macFFI, hasAppKit,
  cls, sel, msgSendTyped, cfStringFromJS,
  BITMAP_INFO_BGRA_PMA,
} from "./mac";
import { bp, getBunFFI, cstr } from "./bun";
import {
  x11 as x11Syms, ffi as x11ffi, getDisplay,
  atom as internAtom, True, False,
  SelectionRequest, SelectionNotify, SelectionClear,
  PropModeReplace, XA_CARDINAL,
} from "./x11";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── Windows constants ─────────────────────────────────────────────────

const CF_UNICODETEXT = 13;
const CF_DIB         = 8;
const GMEM_MOVEABLE  = 0x0002;

const BITMAPINFOHEADER_SIZE = 40;

// ── Linux/X11 clipboard via ICCCM SELECTION protocol ──────────────────

let _clipDisplay: any = null;
let _clipWindow = 0n;
let _clipText: string | null = null;
let _clipPng: Uint8Array | null = null;
let _weOwnClipboard = false;
let _clipSeq = 0;
let _X: ReturnType<typeof x11Syms> = null;
let _F: ReturnType<typeof x11ffi> = null;

let _CLIPBOARD = 0n;
let _UTF8_STRING = 0n;
let _STRING = 0n;
let _TARGETS = 0n;
let _ATOM = 0n;
let _TIMESTAMP = 0n;
let _IMAGE_PNG = 0n;
let _MECHATRON_SEL = 0n;

const SIZEOF_XEVENT = 192;

function linuxEnsure(): boolean {
  if (_clipWindow !== 0n) return true;
  _X = x11Syms();
  _F = x11ffi();
  if (!_X || !_F) return false;

  _clipDisplay = _X.XOpenDisplay(_F.ptr(cstr("")));
  if (!_clipDisplay) return false;

  const root = _X.XDefaultRootWindow(_clipDisplay);
  _clipWindow = _X.XCreateSimpleWindow(_clipDisplay, root, 0, 0, 1, 1, 0, 0n, 0n);
  if (_clipWindow === 0n) return false;

  const ia = (name: string) => _X!.XInternAtom(_clipDisplay, _F!.ptr(cstr(name)), False);
  _CLIPBOARD = ia("CLIPBOARD");
  _UTF8_STRING = ia("UTF8_STRING");
  _STRING = 31n;
  _TARGETS = ia("TARGETS");
  _ATOM = 4n;
  _TIMESTAMP = ia("TIMESTAMP");
  _IMAGE_PNG = ia("image/png");
  _MECHATRON_SEL = ia("_MECHATRON_SEL");

  return true;
}

function linuxDrainEvents(): void {
  if (!_X || !_F || !_clipDisplay) return;

  const evBuf = new Uint8Array(SIZEOF_XEVENT);
  const evDv = new DataView(evBuf.buffer);

  while (_X.XPending(_clipDisplay) > 0) {
    _X.XNextEvent(_clipDisplay, _F.ptr(evBuf));
    const type = evDv.getInt32(0, true);

    if (type === SelectionClear) {
      _weOwnClipboard = false;
      _clipSeq++;
    } else if (type === SelectionRequest) {
      linuxHandleSelectionRequest(evDv);
    }
  }
}

function linuxHandleSelectionRequest(ev: DataView): void {
  if (!_X || !_F || !_clipDisplay) return;

  const requestor = ev.getBigUint64(40, true);
  const target = ev.getBigUint64(56, true);
  const property = ev.getBigUint64(64, true);
  const time = ev.getBigUint64(72, true);

  let replyProp = property;

  if (target === _TARGETS) {
    const targets: bigint[] = [_TARGETS, _TIMESTAMP];
    if (_clipText) { targets.push(_UTF8_STRING); targets.push(_STRING); }
    if (_clipPng) targets.push(_IMAGE_PNG);
    const buf = new BigUint64Array(targets.length);
    for (let i = 0; i < targets.length; i++) buf[i] = targets[i];
    _X.XChangeProperty(_clipDisplay, requestor, property, _ATOM, 32,
      PropModeReplace, _F.ptr(new Uint8Array(buf.buffer)), targets.length);
  } else if ((target === _UTF8_STRING || target === _STRING) && _clipText) {
    const data = new TextEncoder().encode(_clipText);
    _X.XChangeProperty(_clipDisplay, requestor, property, _UTF8_STRING, 8,
      PropModeReplace, _F.ptr(data), data.length);
  } else if (target === _IMAGE_PNG && _clipPng) {
    _X.XChangeProperty(_clipDisplay, requestor, property, _IMAGE_PNG, 8,
      PropModeReplace, _F.ptr(_clipPng), _clipPng.length);
  } else if (target === _TIMESTAMP) {
    const buf = new BigUint64Array([0n]);
    _X.XChangeProperty(_clipDisplay, requestor, property, XA_CARDINAL, 32,
      PropModeReplace, _F.ptr(new Uint8Array(buf.buffer)), 1);
  } else {
    replyProp = 0n;
  }

  const reply = new Uint8Array(SIZEOF_XEVENT);
  const rdv = new DataView(reply.buffer);
  rdv.setInt32(0, SelectionNotify, true);
  rdv.setBigUint64(32, requestor, true);
  rdv.setBigUint64(40, _CLIPBOARD, true);
  rdv.setBigUint64(48, target, true);
  rdv.setBigUint64(56, replyProp, true);
  rdv.setBigUint64(64, time, true);
  _X.XSendEvent(_clipDisplay, requestor, False, 0n, _F.ptr(reply));
  _X.XFlush(_clipDisplay);
}

function linuxWaitForSelectionNotify(timeoutMs: number): DataView | null {
  if (!_X || !_F || !_clipDisplay) return null;

  const evBuf = new Uint8Array(SIZEOF_XEVENT);
  const evDv = new DataView(evBuf.buffer);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (_X.XPending(_clipDisplay) > 0) {
      _X.XNextEvent(_clipDisplay, _F.ptr(evBuf));
      const type = evDv.getInt32(0, true);
      if (type === SelectionNotify) return evDv;
      if (type === SelectionClear) {
        _weOwnClipboard = false;
        _clipSeq++;
      } else if (type === SelectionRequest) {
        linuxHandleSelectionRequest(evDv);
      }
    } else {
      Bun.sleepSync(1);
    }
  }
  return null;
}

function linuxReadProperty(window: bigint, property: bigint): Uint8Array | null {
  if (!_X || !_F || !_clipDisplay) return null;

  const actualType = new BigUint64Array(1);
  const actualFormat = new Int32Array(1);
  const nitems = new BigUint64Array(1);
  const bytesAfter = new BigUint64Array(1);
  const propRet = new BigUint64Array(1);

  const status = _X.XGetWindowProperty(
    _clipDisplay, window, property, 0n, 4194304n, True, 0n,
    _F.ptr(actualType), _F.ptr(actualFormat),
    _F.ptr(nitems), _F.ptr(bytesAfter), _F.ptr(propRet),
  );
  if (status !== 0 || propRet[0] === 0n) return null;

  const n = Number(nitems[0]);
  const format = actualFormat[0];
  // format 32 means items are `long`-sized (8 bytes on LP64, 4 on ILP32)
  const longSize = process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
  const byteLen = format === 32 ? n * longSize : format === 16 ? n * 2 : n;
  if (byteLen === 0) {
    _X.XFree(propRet[0]);
    return null;
  }

  const ptr = Number(propRet[0]);
  const result = new Uint8Array(_F.toArrayBuffer(ptr, 0, byteLen)).slice();
  _X.XFree(propRet[0]);
  return result;
}

function linuxClear(): boolean {
  if (!linuxEnsure()) return false;
  if (_weOwnClipboard) {
    _X!.XSetSelectionOwner(_clipDisplay, _CLIPBOARD, 0n, 0n);
    _weOwnClipboard = false;
    _clipSeq++;
  }
  _clipText = null;
  _clipPng = null;
  _X!.XFlush(_clipDisplay);
  linuxDrainEvents();
  return true;
}

function linuxHasTarget(target: bigint): boolean {
  if (_X!.XGetSelectionOwner(_clipDisplay, _CLIPBOARD) === 0n) return false;

  _X!.XDeleteProperty(_clipDisplay, _clipWindow, _MECHATRON_SEL);
  _X!.XConvertSelection(_clipDisplay, _CLIPBOARD, _TARGETS, _MECHATRON_SEL, _clipWindow, 0n);
  _X!.XFlush(_clipDisplay);

  const ev = linuxWaitForSelectionNotify(2000);
  if (!ev) return false;
  if (ev.getBigUint64(56, true) === 0n) return false;

  const data = linuxReadProperty(_clipWindow, _MECHATRON_SEL);
  if (!data) return false;

  const longSize = process.arch === "x64" || process.arch === "arm64" ? 8 : 4;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i + 3 < data.length; i += longSize) {
    if (BigInt(dv.getUint32(i, true)) === target) return true;
  }
  return false;
}

function linuxHasText(): boolean {
  if (!linuxEnsure()) return false;
  linuxDrainEvents();
  if (_weOwnClipboard) return _clipText !== null && _clipText.length > 0;
  return linuxHasTarget(_UTF8_STRING);
}

function linuxGetText(): string {
  if (!linuxEnsure()) return "";
  linuxDrainEvents();
  if (_weOwnClipboard) return _clipText ?? "";

  _X!.XDeleteProperty(_clipDisplay, _clipWindow, _MECHATRON_SEL);
  _X!.XConvertSelection(_clipDisplay, _CLIPBOARD, _UTF8_STRING, _MECHATRON_SEL, _clipWindow, 0n);
  _X!.XFlush(_clipDisplay);

  const ev = linuxWaitForSelectionNotify(2000);
  if (!ev) return "";
  const property = ev.getBigUint64(56, true);
  if (property === 0n) return "";

  const data = linuxReadProperty(_clipWindow, _MECHATRON_SEL);
  if (!data) return "";
  return new TextDecoder().decode(data);
}

function linuxSetText(text: string): boolean {
  if (!linuxEnsure()) return false;
  linuxDrainEvents();
  _clipText = text;
  _clipPng = null;
  _X!.XSetSelectionOwner(_clipDisplay, _CLIPBOARD, _clipWindow, 0n);
  _X!.XFlush(_clipDisplay);
  _weOwnClipboard = _X!.XGetSelectionOwner(_clipDisplay, _CLIPBOARD) === _clipWindow;
  if (_weOwnClipboard) _clipSeq++;
  return _weOwnClipboard;
}

function linuxHasImage(): boolean {
  if (!linuxEnsure()) return false;
  linuxDrainEvents();
  if (_weOwnClipboard) return _clipPng !== null;
  return linuxHasTarget(_IMAGE_PNG);
}

function linuxGetImage(): { width: number; height: number; data: Uint32Array } | null {
  if (!linuxEnsure()) return null;
  linuxDrainEvents();

  let pngData: Uint8Array | null = null;

  if (_weOwnClipboard) {
    if (!_clipPng) return null;
    pngData = _clipPng;
  } else {
    _X!.XDeleteProperty(_clipDisplay, _clipWindow, _MECHATRON_SEL);
    _X!.XConvertSelection(_clipDisplay, _CLIPBOARD, _IMAGE_PNG, _MECHATRON_SEL, _clipWindow, 0n);
    _X!.XFlush(_clipDisplay);

    const ev = linuxWaitForSelectionNotify(2000);
    if (!ev) return null;
    const property = ev.getBigUint64(56, true);
    if (property === 0n) return null;

    pngData = linuxReadProperty(_clipWindow, _MECHATRON_SEL);
    if (!pngData) return null;
  }

  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(Buffer.from(pngData));
    const pixels = new Uint32Array(png.width * png.height);
    for (let i = 0; i < pixels.length; i++) {
      const r = png.data[i * 4];
      const g = png.data[i * 4 + 1];
      const b = png.data[i * 4 + 2];
      const a = png.data[i * 4 + 3];
      pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
    return { width: png.width, height: png.height, data: pixels };
  } catch {
    return null;
  }
}

function linuxSetImage(w: number, h: number, d: Uint32Array): boolean {
  if (!linuxEnsure()) return false;
  linuxDrainEvents();

  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
      const px = d[i];
      png.data[i * 4]     = (px >> 16) & 0xFF;
      png.data[i * 4 + 1] = (px >> 8) & 0xFF;
      png.data[i * 4 + 2] = px & 0xFF;
      png.data[i * 4 + 3] = (px >> 24) & 0xFF;
    }
    _clipPng = PNG.sync.write(png);
    _clipText = null;

    _X!.XSetSelectionOwner(_clipDisplay, _CLIPBOARD, _clipWindow, 0n);
    _X!.XFlush(_clipDisplay);
    _weOwnClipboard = _X!.XGetSelectionOwner(_clipDisplay, _CLIPBOARD) === _clipWindow;
    if (_weOwnClipboard) _clipSeq++;
    return _weOwnClipboard;
  } catch {
    return false;
  }
}

function linuxSequence(): number {
  if (!linuxEnsure()) return 0;
  linuxDrainEvents();
  return _clipSeq;
}

// ── Windows helpers ───────────────────────────────────────────────────

function withClipboard<T>(fallback: T, body: () => T): T {
  const u = user32();
  if (!u) return fallback;
  if (u.OpenClipboard(0n) === 0) return fallback;
  try { return body(); }
  finally { u.CloseClipboard(); }
}

// ── Windows implementations ───────────────────────────────────────────

function winClear(): boolean {
  return withClipboard(false, () => user32()!.EmptyClipboard() !== 0);
}

function winHasText(): boolean {
  const u = user32();
  return !!u && u.IsClipboardFormatAvailable(CF_UNICODETEXT) !== 0;
}

function winGetText(): string {
  return withClipboard("", () => {
    const u = user32();
    const k = kernel32();
    const F = winFFI();
    if (!u || !k || !F) return "";
    const handle = u.GetClipboardData(CF_UNICODETEXT);
    if (handle === 0n) return "";
    const ptr = k.GlobalLock(handle);
    if (!ptr) return "";
    try {
      // Wrap the clipboard memory as an ArrayBuffer (no copy) and read via
      // DataView.  bun:ffi's `read.u32` rejects high-bit `bigint` pointers
      // on Windows x64 ("Expected a pointer"); `toArrayBuffer` accepts
      // them universally and returns a real ArrayBuffer view.
      const size = Number(k.GlobalSize(handle));
      const ab = F.toArrayBuffer(ptr, 0, size);
      const u16 = new Uint16Array(ab);
      const max = u16.length;
      let len = 0;
      while (len < max && u16[len] !== 0) len++;
      return w2js(u16, len);
    } finally {
      k.GlobalUnlock(handle);
    }
  });
}

function winSetText(text: string): boolean {
  const u = user32();
  const k = kernel32();
  const F = winFFI();
  if (!u || !k || !F) return false;
  const wide = js2w(text); // includes trailing NUL
  const byteLen = wide.byteLength;
  const hmem = k.GlobalAlloc(GMEM_MOVEABLE, BigInt(byteLen));
  if (hmem === 0n) return false;
  const ptr = k.GlobalLock(hmem);
  if (!ptr) { k.GlobalFree(hmem); return false; }
  try {
    // Wrap the moveable allocation as an ArrayBuffer (no copy) and write the
    // wide bytes directly into it via a typed-array view.
    const dst = new Uint8Array(F.toArrayBuffer(ptr, 0, byteLen));
    dst.set(new Uint8Array(wide.buffer, wide.byteOffset, byteLen));
  } finally {
    k.GlobalUnlock(hmem);
  }
  if (u.OpenClipboard(0n) === 0) { k.GlobalFree(hmem); return false; }
  try {
    u.EmptyClipboard();
    const set = u.SetClipboardData(CF_UNICODETEXT, hmem);
    if (set === 0n) { k.GlobalFree(hmem); return false; }
    return true; // clipboard owns hmem now
  } finally {
    u.CloseClipboard();
  }
}

function winHasImage(): boolean {
  const u = user32();
  return !!u && u.IsClipboardFormatAvailable(CF_DIB) !== 0;
}

function winGetImage(): { width: number; height: number; data: Uint32Array } | null {
  return withClipboard<{ width: number; height: number; data: Uint32Array } | null>(null, () => {
    const u = user32();
    const k = kernel32();
    const F = winFFI();
    if (!u || !k || !F) return null;
    const handle = u.GetClipboardData(CF_DIB);
    if (handle === 0n) return null;
    const ptr = k.GlobalLock(handle);
    if (!ptr) return null;
    try {
      const size = Number(k.GlobalSize(handle));
      // Wrap the locked clipboard memory directly (no copy).
      const ab = F.toArrayBuffer(ptr, 0, size);
      const buf = new Uint8Array(ab);
      const dv = new DataView(ab);
      const headerSize = dv.getUint32(0, true);
      const width = dv.getInt32(4, true);
      const heightRaw = dv.getInt32(8, true);
      const bitCount = dv.getUint16(14, true);
      if (bitCount !== 32 && bitCount !== 24) return null;
      const height = Math.abs(heightRaw);
      if (width <= 0 || height === 0) return null;
      const topDown = heightRaw < 0;

      let stride: number;
      if (bitCount === 32) stride = width * 4;
      else stride = (width * 3 + 3) & ~3;

      const argb = new Uint32Array(width * height);
      for (let y = 0; y < height; y++) {
        const srcY = topDown ? y : (height - 1 - y);
        const rowOff = headerSize + srcY * stride;
        for (let x = 0; x < width; x++) {
          let b: number, g: number, r: number, a: number;
          if (bitCount === 32) {
            const o = rowOff + x * 4;
            b = buf[o]; g = buf[o + 1]; r = buf[o + 2]; a = buf[o + 3];
          } else {
            const o = rowOff + x * 3;
            b = buf[o]; g = buf[o + 1]; r = buf[o + 2]; a = 255;
          }
          argb[y * width + x] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
        }
      }
      return { width, height, data: argb };
    } finally {
      k.GlobalUnlock(handle);
    }
  });
}

function winSetImage(width: number, height: number, data: Uint32Array): boolean {
  const u = user32();
  const k = kernel32();
  const F = winFFI();
  if (!u || !k || !F) return false;
  const rowBytes = width * 4;
  const pixelBytes = rowBytes * height;
  const total = BITMAPINFOHEADER_SIZE + pixelBytes;

  // Build BITMAPINFOHEADER + bottom-up BGRA in a JS-side buffer.
  const dib = new Uint8Array(total);
  const dv = new DataView(dib.buffer);
  dv.setUint32(0, BITMAPINFOHEADER_SIZE, true);
  dv.setInt32(4, width, true);
  dv.setInt32(8, height, true);   // positive = bottom-up
  dv.setUint16(12, 1, true);       // biPlanes
  dv.setUint16(14, 32, true);      // biBitCount
  dv.setUint32(16, 0, true);       // BI_RGB
  dv.setUint32(20, pixelBytes, true);

  for (let y = 0; y < height; y++) {
    const dstY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const argb = data[y * width + x];
      const a = (argb >>> 24) & 0xFF;
      const r = (argb >>> 16) & 0xFF;
      const g = (argb >>> 8) & 0xFF;
      const b = argb & 0xFF;
      const o = BITMAPINFOHEADER_SIZE + dstY * rowBytes + x * 4;
      dib[o]     = b;
      dib[o + 1] = g;
      dib[o + 2] = r;
      dib[o + 3] = a;
    }
  }

  const hmem = k.GlobalAlloc(GMEM_MOVEABLE, BigInt(total));
  if (hmem === 0n) return false;
  const ptr = k.GlobalLock(hmem);
  if (!ptr) { k.GlobalFree(hmem); return false; }
  try {
    new Uint8Array(F.toArrayBuffer(ptr, 0, total)).set(dib);
  } finally {
    k.GlobalUnlock(hmem);
  }

  if (u.OpenClipboard(0n) === 0) { k.GlobalFree(hmem); return false; }
  try {
    u.EmptyClipboard();
    const set = u.SetClipboardData(CF_DIB, hmem);
    if (set === 0n) { k.GlobalFree(hmem); return false; }
    return true;
  } finally {
    u.CloseClipboard();
  }
}

function winSequence(): number {
  const u = user32();
  return u ? u.GetClipboardSequenceNumber() >>> 0 : 0;
}

// ── macOS helpers ─────────────────────────────────────────────────────

// NSPasteboardTypeString is the UTI string "public.utf8-plain-text".
// NSPasteboard matches pasteboard types as UTIs (value-compared via
// isEqualToString:), not by pointer identity against the AppKit-exported
// singleton, so a freshly-allocated CFString with the same content is
// equivalent.  Avoiding dlsym'ing the real singleton also avoids bun:ffi's
// `F.read.ptr()` truncating high-bit bigint returns through a JS number
// round-trip, which corrupts tagged-pointer class bits and leaves ObjC
// interpreting the result as an `__NSTaggedDate`.
let _macTypeStr = 0n;
function macTypeString(): bigint {
  if (_macTypeStr) return _macTypeStr;
  _macTypeStr = cfStringFromJS("public.utf8-plain-text");
  return _macTypeStr;
}

function macGeneralPasteboard(): bigint {
  const F = macFFI(); if (!F) return 0n;
  const T = F.FFIType;
  const send = msgSendTyped([T.i64, T.i64], T.i64);
  if (!send) return 0n;
  return send(cls("NSPasteboard"), sel("generalPasteboard"));
}

/** Build an NSArray containing a single object. */
function macArrayWithOne(obj: bigint): bigint {
  const F = macFFI(); if (!F) return 0n;
  const T = F.FFIType;
  const send = msgSendTyped([T.i64, T.i64, T.i64], T.i64);
  if (!send) return 0n;
  return send(cls("NSArray"), sel("arrayWithObject:"), obj);
}

/** [obj release] — balance +alloc/+initWith when no autorelease pool is present. */
function macRelease(obj: bigint): void {
  const F = macFFI(); if (!F || !obj) return;
  const T = F.FFIType;
  const send = msgSendTyped([T.i64, T.i64], T.void);
  if (send) send(obj, sel("release"));
}

// ── macOS implementations ─────────────────────────────────────────────

function macClear(): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); if (!F) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const send = msgSendTyped([T.i64, T.i64], T.void);
  if (!send) return false;
  send(board, sel("clearContents"));
  return true;
}

function macHasText(): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); const O = objc();
  if (!F || !O) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const typeStr = macTypeString();
  if (!typeStr) return false;
  const pool = O.objc_autoreleasePoolPush();
  try {
    const arr = macArrayWithOne(typeStr);
    if (!arr) return false;
    const send = msgSendTyped([T.i64, T.i64, T.i64], T.i64);
    if (!send) return false;
    const r = send(board, sel("availableTypeFromArray:"), arr);
    return !!r;
  } finally {
    O.objc_autoreleasePoolPop(pool);
  }
}

function macGetText(): string {
  if (!hasAppKit()) return "";
  const F = macFFI(); const O = objc();
  if (!F || !O) return "";
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return "";
  const typeStr = macTypeString();
  if (!typeStr) return "";
  const pool = O.objc_autoreleasePoolPush();
  try {
    const send = msgSendTyped([T.i64, T.i64, T.i64], T.i64);
    if (!send) return "";
    const nsData = send(board, sel("dataForType:"), typeStr);
    if (!nsData) return "";
    const getLen = msgSendTyped([T.i64, T.i64], T.u64);
    if (!getLen) return "";
    const lenRaw = getLen(nsData, sel("length"));
    const len = typeof lenRaw === "bigint" ? Number(lenRaw) : (lenRaw as number);
    if (len <= 0) return "";
    const buf = new Uint8Array(len);
    const copyBytes = msgSendTyped([T.i64, T.i64, T.i64, T.u64], T.void);
    if (!copyBytes) return "";
    copyBytes(nsData, sel("getBytes:length:"), bp(buf), BigInt(len));
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    O.objc_autoreleasePoolPop(pool);
  }
}

function macSetText(text: string): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); const O = objc();
  if (!F || !O) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const typeStr = macTypeString();
  if (!typeStr) return false;
  const pool = O.objc_autoreleasePoolPush();
  try {
    const bytes = new TextEncoder().encode(text);
    const dataCls = cls("NSData"); if (!dataCls) return false;
    const mkData = msgSendTyped([T.i64, T.i64, T.i64, T.u64], T.i64);
    if (!mkData) return false;
    const nsData = mkData(dataCls, sel("dataWithBytes:length:"), bp(bytes), BigInt(bytes.length));
    // Reference `bytes` after the call to keep it alive during the copy.
    if (bytes.length < 0) return false;
    if (!nsData) return false;
    const clear = msgSendTyped([T.i64, T.i64], T.void);
    if (clear) clear(board, sel("clearContents"));
    const send = msgSendTyped([T.i64, T.i64, T.i64, T.i64], T.i8);
    if (!send) return false;
    const r = send(board, sel("setData:forType:"), nsData, typeStr);
    return (typeof r === "bigint" ? Number(r) : (r as number)) !== 0;
  } finally {
    O.objc_autoreleasePoolPop(pool);
  }
}

function macHasImage(): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); if (!F) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const imgCls = cls("NSImage"); if (!imgCls) return false;
  const arr = macArrayWithOne(imgCls); if (!arr) return false;
  const send = msgSendTyped([T.i64, T.i64, T.i64, T.i64], T.i8);
  if (!send) return false;
  const r = send(board, sel("canReadObjectForClasses:options:"), arr, 0n);
  return (typeof r === "bigint" ? Number(r) : (r as number)) !== 0;
}

function macGetImage(): { width: number; height: number; data: Uint32Array } | null {
  if (!hasAppKit()) return null;
  const F = macFFI(); const C = cf(); const CG = cg();
  if (!F || !C || !CG) return null;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return null;

  const alloc = msgSendTyped([T.i64, T.i64], T.i64);
  const initPB = msgSendTyped([T.i64, T.i64, T.i64], T.i64);
  if (!alloc || !initPB) return null;
  const raw = alloc(cls("NSImage"), sel("alloc"));
  if (!raw) return null;
  const nsImg = initPB(raw, sel("initWithPasteboard:"), board);
  if (!nsImg) return null;

  try {
    const getCG = msgSendTyped([T.i64, T.i64, T.i64, T.i64, T.i64], T.i64);
    if (!getCG) return null;
    const cgImg = getCG(nsImg, sel("CGImageForProposedRect:context:hints:"), 0n, 0n, 0n);
    if (!cgImg) return null;

    const w = Number(CG.CGImageGetWidth(cgImg));
    const h = Number(CG.CGImageGetHeight(cgImg));
    if (w <= 0 || h <= 0) return null;

    const pixels = new Uint32Array(w * h);
    const cs = CG.CGColorSpaceCreateDeviceRGB();
    if (!cs) return null;
    const ctx = CG.CGBitmapContextCreate(
      bp(pixels), BigInt(w), BigInt(h), 8n, BigInt(w * 4),
      cs, BITMAP_INFO_BGRA_PMA,
    );
    CG.CGColorSpaceRelease(cs);
    if (!ctx) return null;
    try {
      CG.CGContextDrawImage(ctx, 0, 0, w, h, cgImg);
    } finally {
      CG.CGContextRelease(ctx);
    }
    return { width: w, height: h, data: pixels };
  } finally {
    macRelease(nsImg);
  }
}

function macSetImage(width: number, height: number, data: Uint32Array): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); const C = cf(); const CG = cg();
  if (!F || !C || !CG) return false;
  const T = F.FFIType;
  if (width <= 0 || height <= 0) return false;

  const pixels = new Uint32Array(width * height);
  pixels.set(data.subarray(0, Math.min(data.length, pixels.length)));

  const cs = CG.CGColorSpaceCreateDeviceRGB();
  if (!cs) return false;
  const ctx = CG.CGBitmapContextCreate(
    bp(pixels), BigInt(width), BigInt(height), 8n, BigInt(width * 4),
    cs, BITMAP_INFO_BGRA_PMA,
  );
  CG.CGColorSpaceRelease(cs);
  if (!ctx) return false;

  const cgImg = CG.CGBitmapContextCreateImage(ctx);
  CG.CGContextRelease(ctx);
  if (!cgImg) return false;

  try {
    const alloc = msgSendTyped([T.i64, T.i64], T.i64);
    const initCG = msgSendTyped([T.i64, T.i64, T.i64, T.f64, T.f64], T.i64);
    if (!alloc || !initCG) return false;
    const raw = alloc(cls("NSImage"), sel("alloc"));
    if (!raw) return false;
    const nsImg = initCG(raw, sel("initWithCGImage:size:"), cgImg, 0.0, 0.0);
    if (!nsImg) return false;

    try {
      const board = macGeneralPasteboard();
      if (!board) return false;
      const clear = msgSendTyped([T.i64, T.i64], T.void);
      if (clear) clear(board, sel("clearContents"));
      const arr = macArrayWithOne(nsImg);
      if (!arr) return false;
      const send = msgSendTyped([T.i64, T.i64, T.i64], T.i8);
      if (!send) return false;
      const r = send(board, sel("writeObjects:"), arr);
      return (typeof r === "bigint" ? Number(r) : (r as number)) !== 0;
    } finally {
      macRelease(nsImg);
    }
  } finally {
    CG.CGImageRelease(cgImg);
  }
}

function macSequence(): number {
  if (!hasAppKit()) return 0;
  const F = macFFI(); if (!F) return 0;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return 0;
  const send = msgSendTyped([T.i64, T.i64], T.i64);
  if (!send) return 0;
  const r = send(board, sel("changeCount"));
  return typeof r === "bigint" ? Number(r) : (r as number);
}

// ── NAPI-compatible exports ───────────────────────────────────────────

export function clipboard_clear(): boolean {
  if (IS_LINUX) return linuxClear();
  if (IS_WIN) return winClear();
  if (IS_MAC) return macClear();
  return false;
}

export function clipboard_hasText(): boolean {
  if (IS_LINUX) return linuxHasText();
  if (IS_WIN) return winHasText();
  if (IS_MAC) return macHasText();
  return false;
}

export function clipboard_getText(): string {
  if (IS_LINUX) return linuxGetText();
  if (IS_WIN) return winGetText();
  if (IS_MAC) return macGetText();
  return "";
}

export function clipboard_setText(text: string): boolean {
  if (IS_LINUX) return linuxSetText(text);
  if (IS_WIN) return winSetText(text);
  if (IS_MAC) return macSetText(text);
  return false;
}

export function clipboard_hasImage(): boolean {
  if (IS_LINUX) return linuxHasImage();
  if (IS_WIN) return winHasImage();
  if (IS_MAC) return macHasImage();
  return false;
}

export function clipboard_getImage(): { width: number; height: number; data: Uint32Array } | null {
  if (IS_LINUX) return linuxGetImage();
  if (IS_WIN) return winGetImage();
  if (IS_MAC) return macGetImage();
  return null;
}

export function clipboard_setImage(width: number, height: number, data: Uint32Array): boolean {
  if (IS_LINUX) return linuxSetImage(width, height, data);
  if (IS_WIN) return winSetImage(width, height, data);
  if (IS_MAC) return macSetImage(width, height, data);
  return false;
}

export function clipboard_getSequence(): number {
  if (IS_LINUX) return linuxSequence();
  if (IS_WIN) return winSequence();
  if (IS_MAC) return macSequence();
  return 0;
}


