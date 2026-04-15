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

// =============================================================================
// DRM/KMS ioctl layout (Linux <drm/drm.h>, <drm/drm_mode.h>)
//
// We use the legacy modeset ioctls rather than the atomic path because
// the atomic path requires DRM master + a commit framework that's
// overkill for a read-only scanout capture.  GETRESOURCES → GETCRTC →
// GETFB → MAP_DUMB → mmap is enough to read the current scanout on a
// process that opens /dev/dri/card0 with CAP_SYS_ADMIN (or runs as root
// in a container where nothing else holds the master lease).
//
// These structures have no arch-dependent padding — all fields are fixed-
// width u32/u64 — so encoding them as raw DataView reads/writes is
// stable on x86_64, aarch64, riscv64.
// =============================================================================

// _IOWR('d', 0xA0, struct drm_mode_card_res)  = 0xC04064A0 on LP64
// _IOWR('d', 0xA1, struct drm_mode_crtc)      = 0xC06864A1
// _IOWR('d', 0xAD, struct drm_mode_fb_cmd)    = 0xC01864AD
// _IOWR('d', 0xB0, struct drm_mode_create_dumb) = 0xC02064B0
// _IOWR('d', 0xB3, struct drm_mode_map_dumb)  = 0xC01064B3
// (Derived from include/uapi/drm/drm.h _IOC macros.)
export const DRM_IOCTL_MODE_GETRESOURCES   = 0xC04064A0n;
export const DRM_IOCTL_MODE_GETCRTC        = 0xC06864A1n;
export const DRM_IOCTL_MODE_GETFB          = 0xC01864ADn;
export const DRM_IOCTL_MODE_MAP_DUMB       = 0xC01064B3n;

export interface DrmModeFb {
  fbId: number;
  width: number;
  height: number;
  pitch: number;   // bytes per row
  bpp: number;
  depth: number;
  handle: number;  // buffer object handle (input to MAP_DUMB)
}

/**
 * `struct drm_mode_fb_cmd` (24 bytes):
 *   u32 fb_id     @ 0
 *   u32 width     @ 4
 *   u32 height    @ 8
 *   u32 pitch     @ 12
 *   u32 bpp       @ 16
 *   u32 depth     @ 20
 *   u32 handle    @ 24  — wait, that's 28 bytes; handle at offset 24 is
 *                         the last u32.  Size = 28 including tail padding.
 * Actually kernel layout: { u32 fb_id, width, height, pitch, bpp, depth,
 * handle; } — 7 × u32 = 28 bytes; pad to 8 = 32 bytes for some kernels,
 * but the ioctl size in the request number is 0x18 = 24 bytes on older
 * kernels.  We encode 28 bytes and the kernel ignores trailing padding.
 */
export function encodeDrmModeFbCmd(fbId: number): Uint8Array {
  const buf = new Uint8Array(28);
  new DataView(buf.buffer).setUint32(0, fbId, true);
  return buf;
}

export function parseDrmModeFbCmd(buf: Uint8Array): DrmModeFb {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    fbId:   dv.getUint32(0, true),
    width:  dv.getUint32(4, true),
    height: dv.getUint32(8, true),
    pitch:  dv.getUint32(12, true),
    bpp:    dv.getUint32(16, true),
    depth:  dv.getUint32(20, true),
    handle: dv.getUint32(24, true),
  };
}

/** `struct drm_mode_map_dumb` (16 bytes): u32 handle@0, u32 pad@4, u64 offset@8. */
export function encodeDrmModeMapDumb(handle: number): Uint8Array {
  const buf = new Uint8Array(16);
  new DataView(buf.buffer).setUint32(0, handle, true);
  return buf;
}

export function parseDrmModeMapDumbOffset(buf: Uint8Array): bigint {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigUint64(8, true);
}

/**
 * `struct drm_mode_crtc` (96 bytes, padded to 104 on some kernels):
 *   u64 set_connectors_ptr @ 0
 *   u32 count_connectors   @ 8
 *   u32 crtc_id            @ 12
 *   u32 fb_id              @ 16
 *   u32 x                  @ 20
 *   u32 y                  @ 24
 *   u32 gamma_size         @ 28
 *   u32 mode_valid         @ 32
 *   struct drm_mode_modeinfo mode @ 36  (68 bytes)
 */
export interface DrmModeCrtcGet { crtcId: number; fbId: number; }
export function parseDrmModeCrtcGet(buf: Uint8Array): DrmModeCrtcGet {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { crtcId: dv.getUint32(12, true), fbId: dv.getUint32(16, true) };
}

export function encodeDrmModeCrtcGet(crtcId: number): Uint8Array {
  const buf = new Uint8Array(104);
  new DataView(buf.buffer).setUint32(12, crtcId, true);
  return buf;
}

/**
 * `struct drm_mode_card_res` (40 bytes):
 *   u64 fb_id_ptr             @ 0
 *   u64 crtc_id_ptr           @ 8
 *   u64 connector_id_ptr      @ 16
 *   u64 encoder_id_ptr        @ 24
 *   u32 count_fbs             @ 32
 *   u32 count_crtcs           @ 36
 *   u32 count_connectors      @ 40
 *   u32 count_encoders        @ 44
 *   u32 min_width/max_*       @ 48..
 * (56 bytes total; we only need the first 48)
 */
export function encodeDrmModeCardRes(): Uint8Array {
  return new Uint8Array(56);
}

/** Patch the `crtc_id_ptr` and `count_crtcs` fields after a first query. */
export function patchDrmModeCardResCrtcs(buf: Uint8Array, ptr: bigint, count: number): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setBigUint64(8, ptr, true);
  dv.setUint32(36, count, true);
}

export interface DrmModeCardResCounts {
  countFbs: number; countCrtcs: number;
  countConnectors: number; countEncoders: number;
}
export function parseDrmModeCardResCounts(buf: Uint8Array): DrmModeCardResCounts {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    countFbs:        dv.getUint32(32, true),
    countCrtcs:      dv.getUint32(36, true),
    countConnectors: dv.getUint32(40, true),
    countEncoders:   dv.getUint32(44, true),
  };
}

/**
 * Stub stays for back-compat — real capture is in lib/ffi/framebuffer.ts.
 * Pure-TS layer alone can't mmap, so this always returns null when
 * called without the FFI layer wired in.
 */
export function captureFramebuffer(
  _x: number, _y: number, _w: number, _h: number,
): Uint32Array | null {
  return null;
}
