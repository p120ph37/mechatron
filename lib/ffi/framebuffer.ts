/**
 * Bun-FFI capture layer for `/dev/fb0` (legacy fbdev) and `/dev/dri/card0`
 * (DRM/KMS dumb-buffer scanout).
 *
 * Both paths are strictly Linux, require bun:ffi, and only activate when
 * the caller pins `MECHATRON_SCREEN_MECHANISM` to `framebuffer` or `drm`
 * (or auto-detection picks them after ruling out X11 / Wayland).  The
 * pure-encoding bits (struct layouts, ioctl request numbers, bpp/mask
 * conversion) live in `lib/screen/framebuffer.ts` and are unit-testable
 * without a live device; this module just composes them with libc
 * open/mmap/ioctl.
 *
 * DRM note: `DRM_IOCTL_MODE_GETFB` requires DRM master, which regular
 * desktop sessions never grant (the compositor holds it).  This path is
 * useful from TTY, from containers where nothing else holds master, or
 * when running as root / with CAP_SYS_ADMIN.  Failure returns null so
 * the screen dispatcher falls back cleanly.
 */

import { openSync, closeSync } from "fs";
import { libc, libcFFI, PROT_READ, MAP_SHARED, MAP_FAILED, O_RDONLY, O_RDWR } from "./libc";
import { getMechanism } from "../platform";
import {
  type FbGeometry, rowToArgb,
  FRAMEBUFFER_DEV, DRM_DEV,
  FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO,
  parseFbVarScreenInfo, parseFbFixLineLength, parseFbFixSmemLen,
  DRM_IOCTL_MODE_GETRESOURCES, DRM_IOCTL_MODE_GETCRTC,
  DRM_IOCTL_MODE_GETFB, DRM_IOCTL_MODE_MAP_DUMB,
  encodeDrmModeCardRes, patchDrmModeCardResCrtcs, parseDrmModeCardResCounts,
  encodeDrmModeCrtcGet, parseDrmModeCrtcGet,
  encodeDrmModeFbCmd, parseDrmModeFbCmd,
  encodeDrmModeMapDumb, parseDrmModeMapDumbOffset,
} from "../screen/framebuffer";

// =============================================================================
// Helpers
// =============================================================================

function ioctlArgPtr(buf: Uint8Array): bigint | null {
  const F = libcFFI(); if (!F) return null;
  const p = F.ptr(buf);
  return p == null ? null : BigInt(p);
}

/** Clip a requested rect to the framebuffer bounds; returns null when empty. */
function clipRect(x: number, y: number, w: number, h: number, fbW: number, fbH: number):
  { x: number; y: number; w: number; h: number } | null {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(fbW, x + w), y1 = Math.min(fbH, y + h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// =============================================================================
// fbdev (/dev/fb0)
// =============================================================================

export function captureFbdev(x: number, y: number, w: number, h: number): Uint32Array | null {
  const c = libc(); const F = libcFFI();
  if (!c || !F) return null;

  let fd = -1;
  let mapped = 0n;
  let mappedLen = 0n;
  try {
    try { fd = openSync(FRAMEBUFFER_DEV, O_RDONLY); }
    catch { return null; }

    const vinfo = new Uint8Array(160);
    const vptr = ioctlArgPtr(vinfo);
    if (vptr == null || c.ioctl(fd, BigInt(FBIOGET_VSCREENINFO), vptr) < 0) return null;
    const geom: FbGeometry = parseFbVarScreenInfo(vinfo);
    if (geom.width <= 0 || geom.height <= 0) return null;

    const finfo = new Uint8Array(68);
    const fptr = ioctlArgPtr(finfo);
    if (fptr == null || c.ioctl(fd, BigInt(FBIOGET_FSCREENINFO), fptr) < 0) return null;
    geom.lineLength = parseFbFixLineLength(finfo);
    const smemLen = parseFbFixSmemLen(finfo);
    if (geom.lineLength <= 0 || smemLen <= 0) return null;

    const clip = clipRect(x, y, w, h, geom.width, geom.height);
    if (!clip) return null;

    mappedLen = BigInt(smemLen);
    mapped = c.mmap(0n, mappedLen, PROT_READ, MAP_SHARED, fd, 0n);
    if (mapped === MAP_FAILED || mapped === 0n) { mapped = 0n; return null; }

    const ab = F.toArrayBuffer(mapped, 0, smemLen);
    const src = new Uint8Array(ab);
    const out = new Uint32Array(clip.w * clip.h);
    const bpb = (geom.bitsPerPixel / 8) | 0;
    for (let row = 0; row < clip.h; row++) {
      const srcOff = (clip.y + row) * geom.lineLength + clip.x * bpb;
      rowToArgb(src, srcOff, out, row * clip.w, clip.w, geom);
    }
    return out;
  } finally {
    if (mapped !== 0n && mappedLen !== 0n) c.munmap(mapped, mappedLen);
    if (fd >= 0) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

// =============================================================================
// DRM (/dev/dri/card0) — legacy dumb-buffer GETFB path
// =============================================================================

/**
 * Read the current scanout framebuffer via the legacy DRM modeset ioctls.
 * Fails (returns null) if we can't become DRM master, if the CRTC isn't
 * using a dumb buffer, or if `DRM_IOCTL_MODE_GETFB` (which requires
 * master) returns EPERM.  The screen dispatcher treats null as a signal
 * to try the next mechanism.
 */
export function captureDrm(x: number, y: number, w: number, h: number): Uint32Array | null {
  const c = libc(); const F = libcFFI();
  if (!c || !F) return null;

  let fd = -1;
  let mapped = 0n;
  let mappedLen = 0n;
  try {
    try { fd = openSync(DRM_DEV, O_RDWR); }
    catch { return null; }

    // Step 1: count CRTCs.
    const res1 = encodeDrmModeCardRes();
    const p1 = ioctlArgPtr(res1);
    if (p1 == null || c.ioctl(fd, DRM_IOCTL_MODE_GETRESOURCES, p1) < 0) return null;
    const counts = parseDrmModeCardResCounts(res1);
    if (counts.countCrtcs === 0) return null;

    // Step 2: fetch CRTC IDs.
    const crtcIds = new Uint32Array(counts.countCrtcs);
    const crtcIdsPtr = F.ptr(crtcIds);
    if (crtcIdsPtr == null) return null;
    const res2 = encodeDrmModeCardRes();
    patchDrmModeCardResCrtcs(res2, BigInt(crtcIdsPtr), counts.countCrtcs);
    const p2 = ioctlArgPtr(res2);
    if (p2 == null || c.ioctl(fd, DRM_IOCTL_MODE_GETRESOURCES, p2) < 0) return null;

    // Step 3: find the first CRTC that's actively scanning out.
    let fbId = 0, crtcId = 0;
    for (let i = 0; i < crtcIds.length; i++) {
      const crtcBuf = encodeDrmModeCrtcGet(crtcIds[i]);
      const cp = ioctlArgPtr(crtcBuf);
      if (cp == null) continue;
      if (c.ioctl(fd, DRM_IOCTL_MODE_GETCRTC, cp) < 0) continue;
      const g = parseDrmModeCrtcGet(crtcBuf);
      if (g.fbId !== 0) { fbId = g.fbId; crtcId = g.crtcId; break; }
    }
    if (fbId === 0) return null;
    void crtcId;

    // Step 4: describe the scanout FB.  Requires DRM master — EPERM here
    // is expected on unprivileged desktop sessions; treat as a soft fail.
    const fbBuf = encodeDrmModeFbCmd(fbId);
    const fp = ioctlArgPtr(fbBuf);
    if (fp == null || c.ioctl(fd, DRM_IOCTL_MODE_GETFB, fp) < 0) return null;
    const fb = parseDrmModeFbCmd(fbBuf);
    if (fb.width <= 0 || fb.height <= 0 || fb.pitch <= 0 || fb.handle === 0) return null;

    // Step 5: map the dumb buffer offset and mmap it.
    const mapBuf = encodeDrmModeMapDumb(fb.handle);
    const mp = ioctlArgPtr(mapBuf);
    if (mp == null || c.ioctl(fd, DRM_IOCTL_MODE_MAP_DUMB, mp) < 0) return null;
    const offset = parseDrmModeMapDumbOffset(mapBuf);

    const byteLen = BigInt(fb.pitch * fb.height);
    mappedLen = byteLen;
    mapped = c.mmap(0n, byteLen, PROT_READ, MAP_SHARED, fd, offset);
    if (mapped === MAP_FAILED || mapped === 0n) { mapped = 0n; return null; }

    const clip = clipRect(x, y, w, h, fb.width, fb.height);
    if (!clip) return null;

    // Every DRM dumb-buffer scanout currently blessed by the mainline
    // kernel is XRGB8888 (bpp=32, depth=24), matching our fast BGRX path.
    // Reuse the fbdev row converter with a synthetic FbGeometry so we
    // don't duplicate per-pixel shifting.
    const ab = F.toArrayBuffer(mapped, 0, Number(byteLen));
    const src = new Uint8Array(ab);
    const geom: FbGeometry = {
      width: fb.width, height: fb.height, bitsPerPixel: fb.bpp || 32,
      lineLength: fb.pitch,
      rOffset: 16, rLength: 8, gOffset: 8, gLength: 8,
      bOffset: 0, bLength: 8, aOffset: 24, aLength: 0,
    };
    const out = new Uint32Array(clip.w * clip.h);
    const bpb = (geom.bitsPerPixel / 8) | 0;
    for (let row = 0; row < clip.h; row++) {
      const srcOff = (clip.y + row) * geom.lineLength + clip.x * bpb;
      rowToArgb(src, srcOff, out, row * clip.w, clip.w, geom);
    }
    return out;
  } finally {
    if (mapped !== 0n && mappedLen !== 0n) c.munmap(mapped, mappedLen);
    if (fd >= 0) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

// =============================================================================
// Dispatch gate
// =============================================================================

/** Route via framebuffer/drm when the mechanism selector pins one. */
export function framebufferSelected(): "framebuffer" | "drm" | null {
  const m = getMechanism("screen");
  return m === "framebuffer" || m === "drm" ? m : null;
}

export function captureSelected(x: number, y: number, w: number, h: number): Uint32Array | null {
  const m = framebufferSelected();
  if (m === "framebuffer") return captureFbdev(x, y, w, h);
  if (m === "drm") return captureDrm(x, y, w, h);
  return null;
}
