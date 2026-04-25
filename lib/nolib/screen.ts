/**
 * nolib screen backend — pure TypeScript, no native libraries.
 *
 * Three capture paths:
 *   1. X11 xproto (GetImage) — when $DISPLAY is set.
 *   2. Portal (Screenshot D-Bus) — Wayland session with xdg-desktop-portal.
 *   3. Linux framebuffer (/dev/fb0) — headless/TTY fallback via ioctl bridge.
 *
 * Monitor enumeration uses xproto (RandR GetMonitors) when available,
 * Mutter DisplayConfig via D-Bus for portal, or a single-screen geometry
 * derived from the framebuffer ioctl.
 */

import { openSync, readSync, closeSync } from "fs";
import { getNolibVariant } from "../backend";
import { getXConnection } from "../x11proto/xconn";
import { xprotoGrabScreen } from "../x11proto/xproto";
import { ioctlSync, ioctlBridgeAvailable } from "./ioctl";
import {
  FRAMEBUFFER_DEV, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO,
  framebufferAvailable, parseFbVarScreenInfo, parseFbFixLineLength,
  rowToArgb, type FbGeometry,
} from "../screen/framebuffer";
import { remoteDesktopAvailable } from "../portal/remote-desktop";
import { portalScreenshot, portalGetMonitors } from "../portal/screenshot";

const IS_LINUX = process.platform === "linux";
const HAS_DISPLAY = !!process.env.DISPLAY;
const VARIANT = getNolibVariant();

const USE_X11 = HAS_DISPLAY && (VARIANT === "x11" || VARIANT === undefined);
const USE_PORTAL = VARIANT === "portal";
const USE_VT = (VARIANT === "vt" || VARIANT === undefined);

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

function intersectBounds(a: RawRect, b: RawRect): RawRect {
  const l = Math.max(a.x, b.x);
  const t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  return r > l && bot > t ? { x: l, y: t, w: r - l, h: bot - t } : { x: 0, y: 0, w: 0, h: 0 };
}

// ─── Framebuffer geometry cache ────────────────────────────────────

let _fbGeom: FbGeometry | null | undefined;

function getFbGeometry(): FbGeometry | null {
  if (_fbGeom !== undefined) return _fbGeom;
  if (!ioctlBridgeAvailable() || !framebufferAvailable()) {
    _fbGeom = null;
    return null;
  }
  const result = ioctlSync(FRAMEBUFFER_DEV, [
    { request: FBIOGET_VSCREENINFO, data: Buffer.alloc(160) },
    { request: FBIOGET_FSCREENINFO, data: Buffer.alloc(68) },
  ]);
  if (!result || result.outputs.length < 2) {
    _fbGeom = null;
    return null;
  }
  const geom = parseFbVarScreenInfo(result.outputs[0]);
  geom.lineLength = parseFbFixLineLength(result.outputs[1]);
  if (geom.width === 0 || geom.height === 0 || geom.lineLength === 0) {
    _fbGeom = null;
    return null;
  }
  _fbGeom = geom;
  return geom;
}

// ─── xproto path ───────────────────────────────────────────────────

async function xprotoSynchronize(): Promise<ScreenInfo[] | null> {
  const c = await getXConnection();
  if (!c) return null;

  const screens: ScreenInfo[] = [];

  try {
    const mons = await c.getMonitors({ activeOnly: true });
    let primarySeen = false;
    for (const m of mons.monitors) {
      const bounds: RawRect = { x: m.x, y: m.y, w: m.width, h: m.height };
      const item: ScreenInfo = { bounds, usable: bounds };
      if (m.primary && !primarySeen) { screens.unshift(item); primarySeen = true; }
      else                           { screens.push(item); }
    }
  } catch {}

  if (screens.length === 0) {
    for (let i = 0; i < c.info.screens.length; i++) {
      const s = c.info.screens[i];
      const bounds: RawRect = { x: 0, y: 0, w: s.widthPx, h: s.heightPx };
      const item: ScreenInfo = { bounds, usable: bounds };
      if (i === 0) screens.unshift(item);
      else screens.push(item);
    }
  }

  const root = c.info.screens[0]?.root ?? 0;
  try {
    const netWorkarea = await c.internAtom("_NET_WORKAREA", true);
    if (netWorkarea !== 0) {
      const gp = await c.getProperty({ window: root, property: netWorkarea });
      if (gp.format === 32 && gp.value.length >= 16) {
        const x = gp.value.readUInt32LE(0) | 0;
        const y = gp.value.readUInt32LE(4) | 0;
        const w = gp.value.readUInt32LE(8) | 0;
        const h = gp.value.readUInt32LE(12) | 0;
        const u: RawRect = { x, y, w, h };
        for (let i = 0; i < screens.length; i++) {
          screens[i].usable = screens.length > 1
            ? intersectBounds(u, screens[i].bounds) : u;
        }
      }
    }
  } catch {}

  return screens.length > 0 ? screens : null;
}

// ─── Framebuffer path ──────────────────────────────────────────────

function fbSynchronize(): ScreenInfo[] | null {
  const geom = getFbGeometry();
  if (!geom) return null;
  const bounds: RawRect = { x: 0, y: 0, w: geom.width, h: geom.height };
  return [{ bounds, usable: bounds }];
}

function fbGrabScreen(x: number, y: number, w: number, h: number): Uint32Array | null {
  const geom = getFbGeometry();
  if (!geom) return null;

  const clampX = Math.max(0, Math.min(x, geom.width));
  const clampY = Math.max(0, Math.min(y, geom.height));
  const clampW = Math.min(w, geom.width - clampX);
  const clampH = Math.min(h, geom.height - clampY);
  if (clampW <= 0 || clampH <= 0) return null;

  const bytesPerPixel = geom.bitsPerPixel / 8;
  const rowBytes = geom.lineLength;

  let fd: number;
  try {
    fd = openSync(FRAMEBUFFER_DEV, "r");
  } catch {
    return null;
  }

  try {
    const pixels = new Uint32Array(clampW * clampH);
    const pixelRowBytes = clampW * bytesPerPixel;
    const startOffset = clampY * rowBytes + clampX * bytesPerPixel;

    if (clampX === 0 && pixelRowBytes === rowBytes) {
      const bulk = new Uint8Array(rowBytes * clampH);
      readSync(fd, bulk, 0, bulk.length, startOffset);
      for (let row = 0; row < clampH; row++) {
        rowToArgb(bulk, row * rowBytes, pixels, row * clampW, clampW, geom);
      }
    } else {
      const rowBuf = new Uint8Array(pixelRowBytes);
      for (let row = 0; row < clampH; row++) {
        const fileOffset = startOffset + row * rowBytes;
        readSync(fd, rowBuf, 0, rowBuf.length, fileOffset);
        rowToArgb(rowBuf, 0, pixels, row * clampW, clampW, geom);
      }
    }

    return pixels;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

// ─── Portal path ──────────────────────────────────────────────────

async function portalSynchronize(): Promise<ScreenInfo[] | null> {
  const monitors = await portalGetMonitors();
  if (!monitors) return null;
  return monitors.map(m => ({ bounds: m.bounds, usable: m.usable }));
}

async function portalGrabScreen(
  x: number, y: number, w: number, h: number,
): Promise<Uint32Array | null> {
  const shot = await portalScreenshot();
  if (!shot) return null;

  // Crop the full screenshot to the requested region
  const srcW = shot.width;
  const srcH = shot.height;
  const clampX = Math.max(0, Math.min(x, srcW));
  const clampY = Math.max(0, Math.min(y, srcH));
  const clampW = Math.min(w, srcW - clampX);
  const clampH = Math.min(h, srcH - clampY);
  if (clampW <= 0 || clampH <= 0) return null;

  if (clampX === 0 && clampY === 0 && clampW === srcW && clampH === srcH) {
    return shot;
  }

  const cropped = new Uint32Array(clampW * clampH);
  for (let row = 0; row < clampH; row++) {
    const srcOff = (clampY + row) * srcW + clampX;
    cropped.set(shot.subarray(srcOff, srcOff + clampW), row * clampW);
  }
  return cropped;
}

// ─── Exported API ──────────────────────────────────────────────────

export async function screen_synchronize(): Promise<ScreenInfo[] | null> {
  if (USE_X11) {
    const result = await xprotoSynchronize();
    if (result) return result;
  }
  if (USE_PORTAL) return portalSynchronize();
  if (USE_VT) return fbSynchronize();
  return null;
}

export async function screen_grabScreen(
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> {
  if (USE_X11) {
    const result = await xprotoGrabScreen(x, y, w, h, windowHandle);
    if (result) return result;
  }
  if (USE_PORTAL) return portalGrabScreen(x, y, w, h);
  if (USE_VT) return fbGrabScreen(x, y, w, h);
  return null;
}

if (!IS_LINUX && !HAS_DISPLAY) {
  throw new Error("nolib/screen: requires Linux or $DISPLAY");
}
if (VARIANT === "portal" && !remoteDesktopAvailable()) {
  throw new Error("nolib/screen[portal]: requires Wayland session + D-Bus session bus");
}
if (VARIANT === "x11" && !HAS_DISPLAY) {
  throw new Error("nolib/screen[x11]: requires $DISPLAY");
}
if (VARIANT === "vt" && !framebufferAvailable()) {
  throw new Error("nolib/screen[vt]: requires /dev/fb0");
}
if (!HAS_DISPLAY && !remoteDesktopAvailable() && !framebufferAvailable()) {
  throw new Error("nolib/screen: requires $DISPLAY, Wayland portal, or /dev/fb0");
}
