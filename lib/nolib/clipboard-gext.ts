/**
 * nolib[gext] clipboard backend — Mechatron GNOME Shell extension D-Bus client.
 *
 * On Wayland/GNOME the standard portal Clipboard interface doesn't exist
 * (xdg-desktop-portal has no clipboard portal); apps either run a
 * subprocess (wl-copy/wl-paste — nolib[sh]) or talk to wayland directly
 * (the wlr-data-control protocol via libwayland — napi[portal] only).
 * The [gext] route asks gnome-shell itself, via our extension's
 * St.Clipboard wrapper — no popups, no subprocess fork, no compositor
 * round-trip beyond a single D-Bus call.
 *
 * Image transport: PNG bytes on the wire, Uint32Array<ARGB> at the public
 * API surface; pngjs handles the codec on each side.  Matches what
 * clipboard-x11.ts and the napi backends do.
 */

// @ts-ignore -- pngjs lacks type declarations
import { PNG } from "pngjs";
import {
  gextClipAvailable, gextClipClear, gextClipHasText, gextClipGetText,
  gextClipSetText, gextClipHasImage, gextClipGetImage, gextClipSetImage,
  gextClipGetSequence,
} from "../gext/clipboard";

export { gextClipSetToken as setToken, gextClipGetToken as getToken } from "../gext/clipboard";

let _checked = false;
async function ensureAvailable(): Promise<void> {
  if (_checked) return;
  _checked = true;
  const ok = await gextClipAvailable();
  if (!ok) throw new Error("nolib/clipboard[gext]: dev.mechatronic.Shell extension not on session bus");
}

export async function clipboard_clear(): Promise<boolean> {
  await ensureAvailable();
  return gextClipClear();
}

export async function clipboard_hasText(): Promise<boolean> {
  await ensureAvailable();
  return gextClipHasText();
}

export async function clipboard_getText(): Promise<string> {
  await ensureAvailable();
  return gextClipGetText();
}

export async function clipboard_setText(text: string): Promise<boolean> {
  await ensureAvailable();
  return gextClipSetText(text);
}

export async function clipboard_hasImage(): Promise<boolean> {
  await ensureAvailable();
  return gextClipHasImage();
}

export async function clipboard_getImage(): Promise<{ width: number; height: number; data: Uint32Array } | null> {
  await ensureAvailable();
  const png = await gextClipGetImage();
  if (!png || png.length === 0) return null;
  let decoded;
  try {
    decoded = PNG.sync.read(png);
  } catch {
    return null;
  }
  const { width, height, data } = decoded;
  // pngjs returns RGBA byte order in `data` (Uint8Array of length 4·w·h).
  // Convert to the ARGB-packed Uint32Array the public clipboard API uses:
  // we read host-endian u32 from a buffer where bytes are [R,G,B,A], so on
  // little-endian hosts the resulting u32 reads as 0xAABBGGRR.  Re-pack
  // explicitly to keep behaviour platform-independent.
  const out = new Uint32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    out[i] = ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
  return { width, height, data: out };
}

export async function clipboard_setImage(w: number, h: number, d: Uint32Array): Promise<boolean> {
  await ensureAvailable();
  if (w <= 0 || h <= 0 || d.length < w * h) return false;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const pixel = d[i];
    const o = i * 4;
    png.data[o]     = (pixel >>> 16) & 0xff; // R
    png.data[o + 1] = (pixel >>> 8) & 0xff;  // G
    png.data[o + 2] = pixel & 0xff;          // B
    png.data[o + 3] = (pixel >>> 24) & 0xff; // A
  }
  const buf = PNG.sync.write(png);
  return gextClipSetImage(buf);
}

export async function clipboard_getSequence(): Promise<number> {
  await ensureAvailable();
  return gextClipGetSequence();
}
