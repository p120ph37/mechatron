/**
 * Screen subsystem — pure FFI implementation.
 *
 * Linux: enumerates monitors via Xinerama (preferred) or X screen list, with
 * usable area from `_NET_WORKAREA`.  Captures pixels with XGetImage +
 * XGetPixel using the visual's red/green/blue masks.
 *
 * Windows: EnumDisplayMonitors + MONITORINFO for layout; BitBlt + GetDIBits
 * for capture.
 *
 * macOS: not implemented.
 */

import {
  x11, ffi as x11ffi, xinerama, isXineramaAvailable, getDisplay,
  ZPixmap, AllPlanes, XA_CARDINAL, AnyPropertyType, True, False,
} from "./x11";
import { user32, kernel32, gdi32, winFFI } from "./win";
import { cstr } from "./bun";

const IS_LINUX = process.platform === "linux";
const IS_WIN = process.platform === "win32";

interface RawRect { x: number; y: number; w: number; h: number; }
export interface ScreenInfo { bounds: RawRect; usable: RawRect; }

// ── Helpers ──────────────────────────────────────────────────────────

function intersects(a: RawRect, b: RawRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x
      && a.y < b.y + b.h && a.y + a.h > b.y;
}

function intersectBounds(a: RawRect, b: RawRect): RawRect {
  const l = Math.max(a.x, b.x);
  const t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  return r > l && bot > t ? { x: l, y: t, w: r - l, h: bot - t } : { x: 0, y: 0, w: 0, h: 0 };
}

// ── Linux: synchronize ───────────────────────────────────────────────

function linuxSynchronize(): ScreenInfo[] | null {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d) return null;

  const screens: { bounds: RawRect; usable: RawRect }[] = [];

  // Try Xinerama first
  let usedXinerama = false;
  const count = X.XScreenCount(d);
  if (count === 1 && isXineramaAvailable()) {
    const xine = xinerama();
    if (xine && xine.XineramaIsActive(d) === True) {
      const xCount = new Int32Array(1);
      const info = xine.XineramaQueryScreens(d, F.ptr(xCount)) as bigint | null;
      const n = xCount[0];
      if (info && (info as bigint) !== 0n && n > 0) {
        for (let i = 0; i < n; i++) {
          const off = i * 12;
          // XineramaScreenInfo: i32 screen_number, i16 x_org, i16 y_org, i16 width, i16 height
          const xOrg = (F.read.u32(info, off + 4) << 16) >> 16;  // sign-extend i16 from low 16 bits
          // Actually F.read doesn't have i16; manually read 4 bytes and split
          // Instead, read u32 at off+4 and decode two i16 LE values:
          const word1 = F.read.u32(info, off + 4);
          const x_org = (word1 & 0xFFFF) << 16 >> 16;
          const y_org = (word1 >>> 16) << 16 >> 16;
          const word2 = F.read.u32(info, off + 8);
          const width = (word2 & 0xFFFF) << 16 >> 16;
          const height = (word2 >>> 16) << 16 >> 16;
          const bounds: RawRect = { x: x_org, y: y_org, w: width, h: height };

          if (screens.length > 0) {
            const last = screens[screens.length - 1];
            if (intersects(last.bounds, bounds)) {
              const la = last.bounds.w * last.bounds.h;
              const ba = bounds.w * bounds.h;
              if (ba > la) {
                last.bounds = bounds;
                last.usable = bounds;
              }
              continue;
            }
          }
          screens.push({ bounds, usable: bounds });
        }
        X.XFree(info);
        usedXinerama = true;
      }
    }
  }

  if (screens.length === 0) {
    const primary = X.XDefaultScreen(d);
    for (let i = 0; i < count; i++) {
      const screen = X.XScreenOfDisplay(d, i);
      const w = X.XWidthOfScreen(screen);
      const h = X.XHeightOfScreen(screen);
      const bounds: RawRect = { x: 0, y: 0, w, h };
      const item = { bounds, usable: bounds };
      if (i === primary) screens.unshift(item);
      else screens.push(item);
    }
  }

  // _NET_WORKAREA for usable bounds
  const buf = cstr("_NET_WORKAREA");
  const netWorkarea = X.XInternAtom(d, F.ptr(buf), True);
  if (netWorkarea !== 0n) {
    for (let i = 0; i < screens.length; i++) {
      const rootScreen = usedXinerama ? X.XDefaultScreen(d) : i;
      const win = X.XRootWindow(d, rootScreen);

      const actualType = new BigUint64Array(1);
      const actualFormat = new Int32Array(1);
      const nitems = new BigUint64Array(1);
      const bytesAfter = new BigUint64Array(1);
      const propRet = new BigUint64Array(1);

      const status = X.XGetWindowProperty(
        d, win, netWorkarea, 0n, 4n, False, AnyPropertyType,
        F.ptr(actualType), F.ptr(actualFormat),
        F.ptr(nitems), F.ptr(bytesAfter), F.ptr(propRet),
      );
      if (status === 0 && propRet[0] !== 0n
          && actualType[0] === XA_CARDINAL
          && actualFormat[0] === 32 && nitems[0] === 4n) {
        const x = Number(F.read.u64(propRet[0], 0)) | 0;
        const y = Number(F.read.u64(propRet[0], 8)) | 0;
        const w = Number(F.read.u64(propRet[0], 16)) | 0;
        const h = Number(F.read.u64(propRet[0], 24)) | 0;
        const u: RawRect = { x, y, w, h };
        screens[i].usable = usedXinerama ? intersectBounds(u, screens[i].bounds) : u;
      }
      if (propRet[0] !== 0n) X.XFree(propRet[0]);
    }
  }

  return screens.length > 0 ? screens : null;
}

// ── Linux: grabScreen via XGetImage + XGetPixel ──────────────────────

function linuxGrabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d || w <= 0 || h <= 0) return null;
  const win = windowHandle && windowHandle !== 0 ? BigInt(windowHandle) : X.XDefaultRootWindow(d);
  const img = X.XGetImage(d, win, x, y, w, h, AllPlanes, ZPixmap);
  if (!img || (img as bigint) === 0n) return null;
  try {
    // XImage layout: width@0(i32), height@4(i32), red_mask@56(u64),
    // green_mask@64(u64), blue_mask@72(u64).
    const iw = F.read.i32(img, 0);
    const ih = F.read.i32(img, 4);
    if (iw <= 0 || ih <= 0) return null;
    const redMask   = F.read.u64(img, 56);
    const greenMask = F.read.u64(img, 64);
    const blueMask  = F.read.u64(img, 72);

    const pixels = new Uint32Array(iw * ih);
    for (let yy = 0; yy < ih; yy++) {
      for (let xx = 0; xx < iw; xx++) {
        const pixel = X.XGetPixel(img, xx, yy);
        const r = Number((pixel & redMask) >> 16n) & 0xFF;
        const g = Number((pixel & greenMask) >> 8n) & 0xFF;
        const b = Number(pixel & blueMask) & 0xFF;
        pixels[yy * iw + xx] = (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
      }
    }
    return pixels;
  } finally {
    X.XDestroyImage(img);
  }
}

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
    { args: [T.u64, T.u64, T.ptr, T.u64], returns: T.i32 },
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
  const hdcScreen = g.GetDC(hwnd);
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

    const pixels = new Uint32Array(w * h);
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
    g.ReleaseDC(hwnd, hdcScreen);
  }
}

// ── NAPI-compatible exports ──────────────────────────────────────────

export function screen_synchronize(): ScreenInfo[] | null {
  if (IS_LINUX) return linuxSynchronize();
  if (IS_WIN) return winSynchronize();
  return null;
}

export function screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null {
  if (IS_LINUX) return linuxGrabScreen(x, y, w, h, windowHandle);
  if (IS_WIN) return winGrabScreen(x, y, w, h, windowHandle);
  return null;
}
