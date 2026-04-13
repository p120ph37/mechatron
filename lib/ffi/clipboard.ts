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
 */

import { user32, kernel32, winFFI, w2js, js2w } from "./win";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";

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
    if (ptr === 0n) return "";
    try {
      // Determine UTF-16 length by walking until NUL.
      const size = Number(k.GlobalSize(handle));
      const max = Math.max(0, size >> 1);
      let len = 0;
      while (len < max) {
        const v = (F.read as any).u16 ? (F.read as any).u16(ptr, len * 2)
          : (F.read.u32(ptr, (len * 2) & ~3) >>> ((len & 1) * 16)) & 0xFFFF;
        if (v === 0) break;
        len++;
      }
      // Copy out via a wide buffer view.
      const bytes = new Uint8Array(len * 2);
      for (let i = 0; i < len * 2; i++) {
        const word = F.read.u32(ptr, i & ~3);
        bytes[i] = (word >>> ((i & 3) * 8)) & 0xFF;
      }
      const u16 = new Uint16Array(bytes.buffer);
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
  if (ptr === 0n) { k.GlobalFree(hmem); return false; }
  try {
    // Copy wide bytes into the moveable allocation via WriteProcessMemory on
    // self.  Easier: use kernel32 RtlMoveMemory via a temp Uint8Array — but
    // we don't have it bound.  Use kernel32's MultiByteToWideChar?  No: we
    // already have UTF-16.  Fallback: write directly using a typed-array
    // backed by the pointer is not exposed; instead use kernel32 has no
    // memcpy export bound.  Loop via F.read?  read is read-only.
    //
    // Use bun:ffi's `ptr()` round-trip: bind a tiny scratch helper using
    // kernel32's `lstrcpynW` (copies wide string up to N chars).
    // We have lstrlenW bound but not lstrcpynW; however we *do* have
    // WriteProcessMemory bound, so we can use it on our own process.
    // GetCurrentProcess() returns -1 (pseudo-handle).
    const src = new Uint8Array(wide.buffer);
    const written = new BigUint64Array(1);
    const ok = k.WriteProcessMemory(
      0xFFFFFFFFFFFFFFFFn /* GetCurrentProcess pseudo handle */,
      ptr, F.ptr(src), BigInt(byteLen), F.ptr(written),
    );
    if (ok === 0 || Number(written[0]) !== byteLen) {
      k.GlobalUnlock(hmem); k.GlobalFree(hmem); return false;
    }
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
    if (ptr === 0n) return null;
    try {
      const size = Number(k.GlobalSize(handle));
      // Read full DIB into a JS-side buffer via WriteProcessMemory on self.
      const buf = new Uint8Array(size);
      const written = new BigUint64Array(1);
      // Use ReadProcessMemory on the current process to copy.
      const okRead = k.ReadProcessMemory(
        0xFFFFFFFFFFFFFFFFn,
        ptr, F.ptr(buf), BigInt(size), F.ptr(written),
      );
      if (okRead === 0) return null;

      const dv = new DataView(buf.buffer);
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
  if (ptr === 0n) { k.GlobalFree(hmem); return false; }
  try {
    const written = new BigUint64Array(1);
    const ok = k.WriteProcessMemory(
      0xFFFFFFFFFFFFFFFFn, ptr, F.ptr(dib), BigInt(total), F.ptr(written),
    );
    if (ok === 0 || Number(written[0]) !== total) {
      k.GlobalUnlock(hmem); k.GlobalFree(hmem); return false;
    }
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

// ── NAPI-compatible exports ───────────────────────────────────────────

export function clipboard_clear(): boolean {
  if (IS_LINUX) return linuxClear();
  if (IS_WIN) return winClear();
  return false;
}

export function clipboard_hasText(): boolean {
  if (IS_LINUX) return linuxHasText();
  if (IS_WIN) return winHasText();
  return false;
}

export function clipboard_getText(): string {
  if (IS_LINUX) return linuxGetText();
  if (IS_WIN) return winGetText();
  return "";
}

export function clipboard_setText(text: string): boolean {
  if (IS_LINUX) return linuxSetText(text);
  if (IS_WIN) return winSetText(text);
  return false;
}

export function clipboard_hasImage(): boolean {
  if (IS_LINUX) return linuxHasImage();
  if (IS_WIN) return winHasImage();
  return false;
}

export function clipboard_getImage(): { width: number; height: number; data: Uint32Array } | null {
  if (IS_LINUX) return linuxGetImage();
  if (IS_WIN) return winGetImage();
  return null;
}

export function clipboard_setImage(width: number, height: number, data: Uint32Array): boolean {
  if (IS_LINUX) return linuxSetImage(width, height, data);
  if (IS_WIN) return winSetImage(width, height, data);
  return false;
}

export function clipboard_getSequence(): number {
  if (IS_LINUX) return linuxSequence();
  if (IS_WIN) return winSequence();
  return 0;
}
