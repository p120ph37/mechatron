/**
 * Clipboard subsystem — pure FFI implementation.
 *
 * Linux X11 has no clipboard manager — text/image survive only as long as
 * the owning client is alive — so the napi backend ships a complete set of
 * stubs returning false/empty.  We mirror that here.
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
  cls, sel, msgSendTyped, cfStringFromJS, cfStringToJS,
  BITMAP_INFO_BGRA_PMA,
} from "./mac";
import type { Pointer } from "./bun";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── Windows constants ─────────────────────────────────────────────────

const CF_UNICODETEXT = 13;
const CF_DIB         = 8;
const GMEM_MOVEABLE  = 0x0002;

const BITMAPINFOHEADER_SIZE = 40;

// ── Linux stubs ───────────────────────────────────────────────────────

function linuxClear(): boolean { return false; }
function linuxHasText(): boolean { return false; }
function linuxGetText(): string { return ""; }
function linuxSetText(_: string): boolean { return false; }
function linuxHasImage(): boolean { return false; }
function linuxGetImage(): { width: number; height: number; data: Uint32Array } | null { return null; }
function linuxSetImage(_w: number, _h: number, _d: Uint32Array): boolean { return false; }
function linuxSequence(): number { return 0; }

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

function macGeneralPasteboard(): Pointer {
  const F = macFFI(); if (!F) return null;
  const T = F.FFIType;
  const send = msgSendTyped([T.ptr, T.ptr], T.ptr);
  if (!send) return null;
  return send(cls("NSPasteboard"), sel("generalPasteboard"));
}

/** Build an NSArray containing a single object. */
function macArrayWithOne(obj: Pointer): Pointer {
  const F = macFFI(); if (!F) return null;
  const T = F.FFIType;
  const send = msgSendTyped([T.ptr, T.ptr, T.ptr], T.ptr);
  if (!send) return null;
  return send(cls("NSArray"), sel("arrayWithObject:"), obj);
}

/** [obj release] — balance +alloc/+initWith when no autorelease pool is present. */
function macRelease(obj: Pointer): void {
  const F = macFFI(); if (!F || !obj) return;
  const T = F.FFIType;
  const send = msgSendTyped([T.ptr, T.ptr], T.void);
  if (send) send(obj, sel("release"));
}

// ── macOS implementations ─────────────────────────────────────────────

function macClear(): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); if (!F) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const send = msgSendTyped([T.ptr, T.ptr], T.void);
  if (!send) return false;
  send(board, sel("clearContents"));
  return true;
}

function macHasText(): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); const C = cf();
  if (!F || !C) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  const typeStr = cfStringFromJS("public.utf8-plain-text");
  if (!typeStr) return false;
  const arr = macArrayWithOne(typeStr);
  try {
    if (!arr) return false;
    const send = msgSendTyped([T.ptr, T.ptr, T.ptr], T.ptr);
    if (!send) return false;
    const r = send(board, sel("availableTypeFromArray:"), arr);
    return !!r && r !== 0n;
  } finally {
    C.CFRelease(typeStr);
  }
}

function macGetText(): string {
  if (!hasAppKit()) return "";
  const F = macFFI(); const C = cf();
  if (!F || !C) return "";
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return "";
  const typeStr = cfStringFromJS("public.utf8-plain-text");
  if (!typeStr) return "";
  try {
    const send = msgSendTyped([T.ptr, T.ptr, T.ptr], T.ptr);
    if (!send) return "";
    const nsStr = send(board, sel("stringForType:"), typeStr);
    if (!nsStr || nsStr === 0n) return "";
    // NSString is toll-free bridged with CFStringRef.
    return cfStringToJS(nsStr);
  } finally {
    C.CFRelease(typeStr);
  }
}

function macSetText(text: string): boolean {
  if (!hasAppKit()) return false;
  const F = macFFI(); const C = cf(); const O = objc();
  if (!F || !C || !O) return false;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return false;
  // Running from pure FFI there's no Cocoa event loop, so no ambient
  // autorelease pool.  Both `[NSArray arrayWithObject:]` and the
  // internal machinery of `writeObjects:` / `setString:forType:` create
  // autoreleased objects, and without a drain target some Bun+AppKit
  // combinations segfault.  Wrap the whole op in a local pool.
  const pool = O.objc_autoreleasePoolPush();
  const str = cfStringFromJS(text);
  try {
    if (!str) return false;
    // clearContents + writeObjects:@[str].  With the autorelease pool
    // active the `writeObjects:` segfault is gone; and because our
    // cfStringFromJS returns a heap-allocated (non-tagged) CFMutableString,
    // NSString's toll-free bridge exposes it as a proper NSPasteboardWriting
    // object that self-registers `public.utf8-plain-text`.
    const clear = msgSendTyped([T.ptr, T.ptr], T.void);
    if (clear) clear(board, sel("clearContents"));
    const arr = macArrayWithOne(str);
    if (!arr) return false;
    const send = msgSendTyped([T.ptr, T.ptr, T.ptr], T.i8);
    if (!send) return false;
    const r = send(board, sel("writeObjects:"), arr);
    return (typeof r === "bigint" ? Number(r) : (r as number)) !== 0;
  } finally {
    if (str) C.CFRelease(str);
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
  const send = msgSendTyped([T.ptr, T.ptr, T.ptr, T.ptr], T.i8);
  if (!send) return false;
  const r = send(board, sel("canReadObjectForClasses:options:"), arr, null);
  return (typeof r === "bigint" ? Number(r) : (r as number)) !== 0;
}

function macGetImage(): { width: number; height: number; data: Uint32Array } | null {
  if (!hasAppKit()) return null;
  const F = macFFI(); const C = cf(); const CG = cg();
  if (!F || !C || !CG) return null;
  const T = F.FFIType;
  const board = macGeneralPasteboard(); if (!board) return null;

  // [[NSImage alloc] initWithPasteboard:board]
  const alloc = msgSendTyped([T.ptr, T.ptr], T.ptr);
  const initPB = msgSendTyped([T.ptr, T.ptr, T.ptr], T.ptr);
  if (!alloc || !initPB) return null;
  const raw = alloc(cls("NSImage"), sel("alloc"));
  if (!raw || raw === 0n) return null;
  const nsImg = initPB(raw, sel("initWithPasteboard:"), board);
  if (!nsImg || nsImg === 0n) return null;

  try {
    // [nsImg CGImageForProposedRect:NULL context:nil hints:nil]
    const getCG = msgSendTyped([T.ptr, T.ptr, T.ptr, T.ptr, T.ptr], T.ptr);
    if (!getCG) return null;
    const cgImg = getCG(nsImg, sel("CGImageForProposedRect:context:hints:"), null, null, null);
    if (!cgImg || cgImg === 0n) return null;

    const w = Number(CG.CGImageGetWidth(cgImg));
    const h = Number(CG.CGImageGetHeight(cgImg));
    if (w <= 0 || h <= 0) return null;

    const pixels = new Uint32Array(w * h);
    const cs = CG.CGColorSpaceCreateDeviceRGB();
    if (!cs) return null;
    const ctx = CG.CGBitmapContextCreate(
      F.ptr(pixels), BigInt(w), BigInt(h), 8n, BigInt(w * 4),
      cs, BITMAP_INFO_BGRA_PMA,
    );
    CG.CGColorSpaceRelease(cs);
    if (!ctx || ctx === 0n) return null;
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

  // Own a stable copy of the pixel data — CGBitmapContextCreate keeps a
  // pointer to the buffer and we need it alive until CreateImage runs.
  const pixels = new Uint32Array(width * height);
  pixels.set(data.subarray(0, Math.min(data.length, pixels.length)));

  const cs = CG.CGColorSpaceCreateDeviceRGB();
  if (!cs) return false;
  const ctx = CG.CGBitmapContextCreate(
    F.ptr(pixels), BigInt(width), BigInt(height), 8n, BigInt(width * 4),
    cs, BITMAP_INFO_BGRA_PMA,
  );
  CG.CGColorSpaceRelease(cs);
  if (!ctx || ctx === 0n) return false;

  const cgImg = CG.CGBitmapContextCreateImage(ctx);
  CG.CGContextRelease(ctx);
  if (!cgImg || cgImg === 0n) return false;

  try {
    // [[NSImage alloc] initWithCGImage:cgImg size:NSZeroSize]
    const alloc = msgSendTyped([T.ptr, T.ptr], T.ptr);
    const initCG = msgSendTyped([T.ptr, T.ptr, T.ptr, T.f64, T.f64], T.ptr);
    if (!alloc || !initCG) return false;
    const raw = alloc(cls("NSImage"), sel("alloc"));
    if (!raw || raw === 0n) return false;
    const nsImg = initCG(raw, sel("initWithCGImage:size:"), cgImg, 0.0, 0.0);
    if (!nsImg || nsImg === 0n) return false;

    try {
      const board = macGeneralPasteboard();
      if (!board) return false;
      const clear = msgSendTyped([T.ptr, T.ptr], T.void);
      if (clear) clear(board, sel("clearContents"));
      const arr = macArrayWithOne(nsImg);
      if (!arr) return false;
      const send = msgSendTyped([T.ptr, T.ptr, T.ptr], T.i8);
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
  const send = msgSendTyped([T.ptr, T.ptr], T.i64);
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
