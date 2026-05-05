/**
 * Linux framebuffer screen-capture fallback — struct layouts and pixel
 * conversion for the `/dev/fb0` (fbdev) interface.
 *
 * When there's no X server and no Wayland compositor to ask (TTY,
 * containers, some embedded boards), the only way to read pixels is
 * straight out of the kernel's scanout buffer via `/dev/fb0`.  Read path:
 *
 *   1. `ioctl(fb, FBIOGET_VSCREENINFO, &vinfo)` → width/height/bpp.
 *   2. `ioctl(fb, FBIOGET_FSCREENINFO, &finfo)` → line_length.
 *   3. Read rows via readSync (nolib[vt] path).
 *   4. Walk `bits_per_pixel` bytes per pixel converting to ARGB.
 *
 * The actual capture lives in `lib/nolib/screen-vt.ts` (ioctl bridge +
 * readSync).  This module provides the pure-encoding helpers: struct
 * layouts, ioctl constants, and the bpp-aware row-to-ARGB converter.
 */

import { existsSync, accessSync, constants as fsConstants } from "fs";

export interface FbGeometry {
  width: number;
  height: number;
  bitsPerPixel: number;
  lineLength: number;   // bytes per row (incl. stride padding)
  rOffset: number; rLength: number;
  gOffset: number; gLength: number;
  bOffset: number; bLength: number;
  aOffset: number; aLength: number;
}

export const FRAMEBUFFER_DEV = "/dev/fb0";
export function framebufferAvailable(): boolean {
  if (!existsSync(FRAMEBUFFER_DEV)) return false;
  try {
    accessSync(FRAMEBUFFER_DEV, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a raw fbdev row to our canonical ARGB8888 pixel format.
 * `src` is one scanline's worth of bytes; `dst` receives `width` u32
 * ARGB pixels.  Supports the common bits_per_pixel values:
 *
 *   - 32: native BGRA / ARGB; zero-copy fast path.
 *   - 24: three-byte BGR; expand to ARGB with alpha=0xFF.
 *   - 16: RGB565 (common on embedded framebuffers).
 *
 * Less common formats (8-bit paletted, 15-bit RGB555) fall out of the
 * switch and emit black pixels — callers should check the geometry
 * before capture if they care.
 */
export function rowToArgb(
  src: Uint8Array, srcOffset: number,
  dst: Uint32Array, dstOffset: number,
  width: number, geom: FbGeometry,
): void {
  const bpp = geom.bitsPerPixel;
  if (bpp === 32) {
    // Assume BGRA little-endian (the overwhelmingly common layout).
    for (let x = 0; x < width; x++) {
      const o = srcOffset + x * 4;
      const b = src[o], g = src[o + 1], r = src[o + 2], a = src[o + 3];
      dst[dstOffset + x] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
  } else if (bpp === 24) {
    for (let x = 0; x < width; x++) {
      const o = srcOffset + x * 3;
      const b = src[o], g = src[o + 1], r = src[o + 2];
      dst[dstOffset + x] = (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
  } else if (bpp === 16) {
    // RGB565: 5 bits R, 6 bits G, 5 bits B.  Expand to 8-bit components.
    for (let x = 0; x < width; x++) {
      const o = srcOffset + x * 2;
      const pix = src[o] | (src[o + 1] << 8);
      const r = ((pix >> 11) & 0x1F) << 3;
      const g = ((pix >> 5) & 0x3F) << 2;
      const b = (pix & 0x1F) << 3;
      dst[dstOffset + x] = (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
  } else {
    // Unsupported depth — emit black so the caller still gets a
    // well-shaped Image rather than a crash.
    for (let x = 0; x < width; x++) {
      dst[dstOffset + x] = 0xFF000000;
    }
  }
}

// =============================================================================
// fbdev ioctl layout (Linux <linux/fb.h>)
//
// `struct fb_var_screeninfo` is 160 bytes; we only need a small prefix.
// `struct fb_fix_screeninfo` is 68 bytes; we need line_length at offset 40
// and smem_len at offset 20.  Layouts are stable across kernels and arches.
// =============================================================================

// _IOR('F', 0x00, struct fb_var_screeninfo) = 0x80184600 on LP64
// _IOR('F', 0x02, struct fb_fix_screeninfo) = 0x80184602
// These are the canonical encoded request numbers; reproduced as literals
// to avoid implementing the _IOR macro just for two values.
export const FBIOGET_VSCREENINFO = 0x4600;
export const FBIOGET_FSCREENINFO = 0x4602;

/**
 * Parse the prefix of a `struct fb_var_screeninfo` buffer into our portable
 * FbGeometry shape.  Only the fields we need to drive `rowToArgb` are
 * extracted; the rest of the struct (timing, rotation, sync flags) is
 * ignored because nothing in the capture path depends on them.
 *
 * Layout (offsets in bytes on both 32-bit and 64-bit):
 *   u32 xres               @ 0
 *   u32 yres               @ 4
 *   u32 xres_virtual       @ 8
 *   u32 yres_virtual       @ 12
 *   u32 xoffset            @ 16
 *   u32 yoffset            @ 20
 *   u32 bits_per_pixel     @ 24
 *   u32 grayscale          @ 28
 *   struct fb_bitfield red    @ 32 (offset@0, length@4, msb_right@8)
 *   struct fb_bitfield green  @ 44
 *   struct fb_bitfield blue   @ 56
 *   struct fb_bitfield transp @ 68
 *   …
 */
export function parseFbVarScreenInfo(buf: Uint8Array): FbGeometry {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    width: dv.getUint32(0, true),
    height: dv.getUint32(4, true),
    bitsPerPixel: dv.getUint32(24, true),
    lineLength: 0,   // populated by fb_fix_screeninfo, not var
    rOffset: dv.getUint32(32, true), rLength: dv.getUint32(36, true),
    gOffset: dv.getUint32(44, true), gLength: dv.getUint32(48, true),
    bOffset: dv.getUint32(56, true), bLength: dv.getUint32(60, true),
    aOffset: dv.getUint32(68, true), aLength: dv.getUint32(72, true),
  };
}

/** `fb_fix_screeninfo.line_length` is at offset 40 (u32), `smem_len` at 20. */
export function parseFbFixLineLength(buf: Uint8Array): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(40, true);
}

export function parseFbFixSmemLen(buf: Uint8Array): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(20, true);
}

/**
 * Stub for back-compat.  Real capture is in lib/nolib/screen-vt.ts
 * (ioctl bridge + readSync).
 */
export function captureFramebuffer(
  _x: number, _y: number, _w: number, _h: number,
): Uint32Array | null {
  return null;
}
