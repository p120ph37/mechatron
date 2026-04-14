/**
 * Linux framebuffer / DRM screen-capture fallback.
 *
 * When there's no X server and no Wayland compositor to ask (TTY,
 * containers, some embedded boards), the only way to read pixels is
 * straight out of the kernel's scanout buffer.  Two paths exist:
 *
 * **Legacy `/dev/fb0`** — the `fbdev` interface.  Still present on
 * many boards but deprecated upstream; on most modern desktop Linux
 * installs it's unpopulated or points at a dumb 1024x768 console
 * framebuffer, not the real GPU scanout.  Good enough for TTY or
 * kiosk systems.  Read path:
 *
 *   1. `ioctl(fb, FBIOGET_VSCREENINFO, &vinfo)` → width/height/bpp.
 *   2. `ioctl(fb, FBIOGET_FSCREENINFO, &finfo)` → line_length.
 *   3. `mmap(NULL, finfo.smem_len, PROT_READ, MAP_SHARED, fb, 0)`.
 *   4. Walk `bits_per_pixel` bytes per pixel converting to ARGB.
 *
 * **DRM/KMS** — `/dev/dri/card0`.  The actual scanout pixels for the
 * real GPU live here.  Capture requires DRM Master (only one process
 * at a time) or the `DRM_CAP_DUMB_BUFFER` + `DRM_IOCTL_MODE_GETFB2`
 * + mmap dance to read the CRTC's current framebuffer without owning
 * it.  Several userspace helpers exist (`kmsgrab`, `libdrm`); we use
 * the raw ioctls to avoid a libdrm soname dependency for headless
 * deployments.
 *
 * Access requirements: `/dev/fb0` and `/dev/dri/card0` are `video`-
 * group readable on every mainstream distro.  Non-root users in the
 * `video` group get access with no further setup; the mechanism probe
 * reports `requiresElevatedPrivileges: true` when the device file
 * exists but isn't readable.
 *
 * This file is a *skeleton* — probe wiring is live, the actual capture
 * ioctls + mmap live partly here (layout structs, bit-depth conversion)
 * and partly in the napi `screen` crate (mmap + ioctl are awkward to
 * do from pure Node).  The auto-select priority intentionally places
 * framebuffer *below* the portal-pipewire path, because on a live
 * desktop the portal sees the *real* output (respecting HiDPI,
 * multi-monitor, color management) while the framebuffer path may see
 * a stale or blank scanout.  See PLAN.md §6e.
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
export const DRM_DEV = "/dev/dri/card0";

export function framebufferAvailable(): boolean {
  if (!existsSync(FRAMEBUFFER_DEV)) return false;
  try {
    accessSync(FRAMEBUFFER_DEV, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function drmAvailable(): boolean {
  if (!existsSync(DRM_DEV)) return false;
  try {
    accessSync(DRM_DEV, fsConstants.R_OK);
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

/**
 * Stub: capture a rectangle from the framebuffer.  Full implementation
 * needs mmap + fbdev ioctls which require the native layer.  Currently
 * returns null, which causes the screen mechanism dispatcher to fall
 * back to the next available mechanism (or return null up to the
 * caller if nothing works).
 */
export function captureFramebuffer(
  _x: number, _y: number, _w: number, _h: number,
): Uint32Array | null {
  return null;
}
