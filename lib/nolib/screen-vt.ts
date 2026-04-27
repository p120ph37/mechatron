/**
 * nolib[vt] screen backend — Linux framebuffer (/dev/fb0) via mmap-style read.
 *
 * Headless / TTY capture path: read raw bytes from /dev/fb0, decode the
 * line geometry from FBIOGET_{V,F}SCREENINFO ioctls, and convert each
 * row to ARGB. Single-screen by definition (the framebuffer is one
 * contiguous device); multi-monitor is invisible at this layer.
 */

import { openSync, readSync, closeSync } from "fs";
import { ioctlSync, ioctlBridgeAvailable } from "./ioctl";
import {
  FRAMEBUFFER_DEV, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO,
  framebufferAvailable, parseFbVarScreenInfo, parseFbFixLineLength,
  rowToArgb, type FbGeometry,
} from "../screen/framebuffer";

if (!framebufferAvailable()) {
  throw new Error("nolib/screen[vt]: requires /dev/fb0");
}

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

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

export async function screen_synchronize(): Promise<ScreenInfo[] | null> {
  const geom = getFbGeometry();
  if (!geom) return null;
  const bounds: RawRect = { x: 0, y: 0, w: geom.width, h: geom.height };
  return [{ bounds, usable: bounds }];
}

export async function screen_grabScreen(
  x: number, y: number, w: number, h: number, _windowHandle?: number,
): Promise<Uint32Array | null> {
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
