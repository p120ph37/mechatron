/**
 * Screen subsystem — pure FFI implementation for non-Linux platforms.
 *
 * Linux x11 lives in screen-x11-impl.ts (variant split mirroring napi).
 * The main-thread proxy in screen.ts throws on Linux so this module is
 * never loaded there.
 *
 * Windows: EnumDisplayMonitors + MONITORINFO for layout; BitBlt + GetDIBits
 * for capture.
 *
 * macOS: CGMainDisplayID + CGDisplayPixelsWide/High for layout (single-
 * display primary only — NSScreen.frame/visibleFrame returns NSRect by
 * value, which `bun:ffi` can't retrieve).  Capture uses CGDisplayCreateImage
 * + CGBitmapContextCreate (BGRA premultiplied) with a negative draw offset
 * to crop the desired subregion out of the full-display image.
 */

import { user32, kernel32, gdi32, winFFI } from "./win";
import { cg, macFFI, BITMAP_INFO_BGRA_PMA } from "./mac";
import { bp } from "./bun";

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

interface RawRect { x: number; y: number; w: number; h: number; }
export interface ScreenInfo { bounds: RawRect; usable: RawRect; }

// ── Windows: synchronize via EnumDisplayMonitors ─────────────────────

function winSynchronize(): ScreenInfo[] | null {
  const u = user32();
  const F = winFFI();
  if (!u || !F) return null;
  const T = (F as any).FFIType;
  const JSCallback = (F as any).JSCallback;
  if (!JSCallback) return null;

  const monitors: { bounds: RawRect; usable: RawRect }[] = [];

  const cb = new JSCallback(
    (hmon: bigint, _hdc: bigint, _rect: bigint, _lparam: bigint) => {
      // MONITORINFO: cbSize(u32@0), rcMonitor(4 i32 @4..20), rcWork(4 i32 @20..36), dwFlags(u32@36)
      const buf = new Uint8Array(40);
      const dv = new DataView(buf.buffer);
      dv.setUint32(0, 40, true);
      if (u.GetMonitorInfoW(hmon, F.ptr(buf)) === 0) return 1;
      const ml = dv.getInt32(4, true);
      const mt = dv.getInt32(8, true);
      const mr = dv.getInt32(12, true);
      const mb = dv.getInt32(16, true);
      const wl = dv.getInt32(20, true);
      const wt = dv.getInt32(24, true);
      const wr = dv.getInt32(28, true);
      const wb = dv.getInt32(32, true);
      monitors.push({
        bounds: { x: ml, y: mt, w: mr - ml, h: mb - mt },
        usable: { x: wl, y: wt, w: wr - wl, h: wb - wt },
      });
      return 1;
    },
    { args: [T.u64, T.u64, T.ptr, T.i64], returns: T.i32 },
  );

  try {
    u.EnumDisplayMonitors(0n, null, cb.ptr, 0n);
  } finally {
    cb.close && cb.close();
  }

  if (monitors.length === 0) return null;

  // Put primary monitor first (origin at 0,0)
  monitors.sort((a, b) => {
    const ap = a.bounds.x === 0 && a.bounds.y === 0 ? 1 : 0;
    const bp = b.bounds.x === 0 && b.bounds.y === 0 ? 1 : 0;
    return bp - ap;
  });
  return monitors;
}

// ── Windows: grabScreen via BitBlt + GetDIBits ───────────────────────

function winGrabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null {
  if (w <= 0 || h <= 0) return null;
  const u = user32();
  const g = gdi32();
  const F = winFFI();
  if (!u || !g || !F) return null;
  const SRCCOPY = 0x00CC0020;
  const DIB_RGB_COLORS = 0;
  const hwnd = windowHandle && windowHandle !== 0 ? BigInt(windowHandle) : 0n;
  const hdcScreen = u.GetDC(hwnd);
  if (hdcScreen === 0n) return null;
  let hdcMem = 0n;
  let hbmp = 0n;
  let oldObj = 0n;
  try {
    hdcMem = g.CreateCompatibleDC(hdcScreen);
    hbmp = g.CreateCompatibleBitmap(hdcScreen, w, h);
    if (hdcMem === 0n || hbmp === 0n) return null;
    oldObj = g.SelectObject(hdcMem, hbmp);
    if (g.BitBlt(hdcMem, 0, 0, w, h, hdcScreen, x, y, SRCCOPY) === 0) return null;

    // BITMAPINFOHEADER (40 bytes): biSize, biWidth, biHeight (-h for top-down),
    // biPlanes(1), biBitCount(32), biCompression(0)
    const bmi = new Uint8Array(40);
    const dv = new DataView(bmi.buffer);
    dv.setUint32(0, 40, true);
    dv.setInt32(4, w, true);
    dv.setInt32(8, -h, true);
    dv.setUint16(12, 1, true);
    dv.setUint16(14, 32, true);
    dv.setUint32(16, 0, true);

    // Guard against RangeError on absurd sizes (see macGrabScreen note).
    let pixels: Uint32Array;
    try {
      pixels = new Uint32Array(w * h);
    } catch (_) {
      return null;
    }
    g.GetDIBits(hdcMem, hbmp, 0, h, F.ptr(pixels), F.ptr(bmi), DIB_RGB_COLORS);
    // GetDIBits with biBitCount=32, BI_RGB returns BGRX pixels little-endian:
    // each u32 = 0x00RRGGBB.  Set alpha to 0xFF.
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (pixels[i] | 0xFF000000) >>> 0;
    }
    return pixels;
  } finally {
    if (hdcMem !== 0n && oldObj !== 0n) g.SelectObject(hdcMem, oldObj);
    if (hbmp !== 0n) g.DeleteObject(hbmp);
    if (hdcMem !== 0n) g.DeleteDC(hdcMem);
    u.ReleaseDC(hwnd, hdcScreen);
  }
}

// ── macOS: synchronize via CoreGraphics ──────────────────────────────

function macSynchronize(): ScreenInfo[] | null {
  const CG = cg();
  if (!CG) return null;
  const id = CG.CGMainDisplayID();
  const w = Number(CG.CGDisplayPixelsWide(id));
  const h = Number(CG.CGDisplayPixelsHigh(id));
  if (w <= 0 || h <= 0) return null;
  // Can't access NSScreen.visibleFrame (NSRect by-value return unsupported),
  // so report usable == bounds for the primary display.
  const bounds: RawRect = { x: 0, y: 0, w, h };
  return [{ bounds, usable: bounds }];
}

// ── macOS: grabScreen via CGDisplayCreateImage + CGBitmapContext ─────

function macGrabScreen(x: number, y: number, w: number, h: number, _windowHandle?: number): Uint32Array | null {
  const CG = cg();
  const F = macFFI();
  if (!CG || !F || w <= 0 || h <= 0) return null;

  const id = CG.CGMainDisplayID();
  const cgImg = CG.CGDisplayCreateImage(id);
  if (!cgImg) return null;
  try {
    const fullH = Number(CG.CGImageGetHeight(cgImg));
    const fullW = Number(CG.CGImageGetWidth(cgImg));
    if (fullW <= 0 || fullH <= 0) return null;

    // Guard the JS-side buffer allocation.  Uint32Array throws RangeError
    // on impossibly large requests (e.g. 100000x100000 asks for 40GB),
    // and we want the same "return null" behaviour the FFI null-checks
    // below deliver for CG-side allocation failures.
    let pixels: Uint32Array;
    try {
      pixels = new Uint32Array(w * h);
    } catch (_) {
      return null;
    }
    const cs = CG.CGColorSpaceCreateDeviceRGB();
    if (!cs) return null;
    const ctx = CG.CGBitmapContextCreate(
      bp(pixels), BigInt(w), BigInt(h), 8n, BigInt(w * 4),
      cs, BITMAP_INFO_BGRA_PMA,
    );
    CG.CGColorSpaceRelease(cs);
    if (!ctx) return null;
    try {
      // Draw the full display image at an offset so that display pixel
      // (x, y) ends up at context (0, 0) in memory order (top-left).
      // CG draw coords are y-up with origin bottom-left, and the bitmap
      // buffer's first row corresponds to the highest y in context:
      //   dx = -x, dy = y + h - fullH
      const dx = -x;
      const dy = y + h - fullH;
      CG.CGContextDrawImage(ctx, dx, dy, fullW, fullH, cgImg);
    } finally {
      CG.CGContextRelease(ctx);
    }
    return pixels;
  } finally {
    CG.CGImageRelease(cgImg);
  }
}

// ── NAPI-compatible exports ──────────────────────────────────────────

export function screen_synchronize(): ScreenInfo[] | null {
  if (IS_WIN) return winSynchronize();
  if (IS_MAC) return macSynchronize();
  return null;
}

export function screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null {
  if (IS_WIN) return winGrabScreen(x, y, w, h, windowHandle);
  if (IS_MAC) return macGrabScreen(x, y, w, h, windowHandle);
  return null;
}
