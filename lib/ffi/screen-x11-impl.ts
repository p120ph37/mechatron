/**
 * ffi screen backend (x11 variant) — Linux-only synchronous worker-side
 * implementation.
 *
 * Extracted from screen-impl.ts as part of the variant split that
 * mirrors napi[x11]/napi[portal].  Contains only the X11/XRandR paths
 * (XRRGetMonitors for monitor layout, XGetImage + XGetPixel for pixel
 * capture); the worker entry (screen-x11-worker.ts) loads it and the
 * main-thread proxy (screen-x11.ts) dispatches into the worker.
 */

import {
  x11, ffi as x11ffi, xrandr, isXrandrAvailable, getDisplay,
  ZPixmap, AllPlanes, XA_CARDINAL, AnyPropertyType, True, False,
} from "./x11";
import { cstr } from "./bun";

interface RawRect { x: number; y: number; w: number; h: number; }
export interface ScreenInfo { bounds: RawRect; usable: RawRect; }

function intersectBounds(a: RawRect, b: RawRect): RawRect {
  const l = Math.max(a.x, b.x);
  const t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  return r > l && bot > t ? { x: l, y: t, w: r - l, h: bot - t } : { x: 0, y: 0, w: 0, h: 0 };
}

export function screen_synchronize(): ScreenInfo[] | null {
  const X = x11();
  const F = x11ffi();
  const d = getDisplay();
  if (!X || !F || !d) return null;

  const screens: { bounds: RawRect; usable: RawRect }[] = [];

  // Prefer XRandR 1.5 (XRRGetMonitors) over the older Xinerama query:
  // RandR exposes a primary-monitor flag and per-output metadata that
  // Xinerama lacks, and has shipped with X.org since 2015.  The
  // dlopen-catch path in x11.ts leaves isXrandrAvailable() == false when
  // libXrandr.so.2 isn't present, at which point we fall through to the
  // single-XScreenOfDisplay branch below.
  let usedXrandr = false;
  const count = X.XScreenCount(d);
  if (isXrandrAvailable()) {
    const xrr = xrandr();
    if (xrr) {
      const root = X.XDefaultRootWindow(d);
      const nOut = new Int32Array(1);
      // get_active=1 filters out disabled outputs so we don't enumerate
      // monitors that aren't currently driving a display.
      const info = xrr.XRRGetMonitors(d, root, True, F.ptr(nOut));
      const n = nOut[0];
      if (info !== 0n && n > 0) {
        // Bun's read.* rejects bigint ptr args; convert to Number (userspace
        // VAs fit in 48 bits on Linux so this is lossless).
        const infoN = Number(info);
        // XRRMonitorInfo on LP64 (56 bytes):
        //   Atom name            @ 0  (u64)
        //   Bool primary         @ 8  (i32)
        //   Bool automatic       @ 12 (i32)
        //   int  noutput         @ 16
        //   int  x               @ 20
        //   int  y               @ 24
        //   int  width           @ 28
        //   int  height          @ 32
        //   int  mwidth          @ 36
        //   int  mheight         @ 40
        //   (4 bytes padding    @ 44)
        //   RROutput *outputs    @ 48 (u64)
        const STRIDE = 56;
        // Primary first to match Windows/macOS convention + legacy
        // XDefaultScreen ordering; any subsequent monitor appends.
        let primarySeen = false;
        for (let i = 0; i < n; i++) {
          const off = i * STRIDE;
          const primary = F.read.i32(infoN, off + 8);
          const x = F.read.i32(infoN, off + 20);
          const y = F.read.i32(infoN, off + 24);
          const w = F.read.i32(infoN, off + 28);
          const h = F.read.i32(infoN, off + 32);
          const bounds: RawRect = { x, y, w, h };
          const item = { bounds, usable: bounds };
          if (primary !== 0 && !primarySeen) { screens.unshift(item); primarySeen = true; }
          else                               { screens.push(item); }
        }
        xrr.XRRFreeMonitors(info);
        usedXrandr = true;
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
    // When XRandR gave us the geometry, all monitors share the single
    // X screen indexed by XDefaultScreen — no need to recompute per iteration.
    const defaultScreen = usedXrandr ? X.XDefaultScreen(d) : -1;
    for (let i = 0; i < screens.length; i++) {
      const rootScreen = usedXrandr ? defaultScreen : i;
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
        // Bun's read.u64 rejects bigint pointer args ("Expected a pointer");
        // convert the BigUint64Array slot to Number (Linux userspace VAs fit
        // in 48 bits so this is lossless).
        const pr = Number(propRet[0]);
        const x = Number(F.read.u64(pr, 0)) | 0;
        const y = Number(F.read.u64(pr, 8)) | 0;
        const w = Number(F.read.u64(pr, 16)) | 0;
        const h = Number(F.read.u64(pr, 24)) | 0;
        const u: RawRect = { x, y, w, h };
        screens[i].usable = usedXrandr ? intersectBounds(u, screens[i].bounds) : u;
      }
      if (propRet[0] !== 0n) X.XFree(propRet[0]);
    }
  }

  return screens.length > 0 ? screens : null;
}

export function screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null {
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
    // Normalise pointer to Number (Bun's read.* rejects bigint ptr args).
    const imgN = Number(img);
    const iw = F.read.i32(imgN, 0);
    const ih = F.read.i32(imgN, 4);
    if (iw <= 0 || ih <= 0) return null;
    const redMask   = F.read.u64(imgN, 56);
    const greenMask = F.read.u64(imgN, 64);
    const blueMask  = F.read.u64(imgN, 72);

    // Guard against RangeError on absurd sizes (see macGrabScreen note).
    let pixels: Uint32Array;
    try {
      pixels = new Uint32Array(iw * ih);
    } catch (_) {
      return null;
    }
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

if (!getDisplay()) {
  throw new Error("ffi/screen-x11: requires libX11");
}
