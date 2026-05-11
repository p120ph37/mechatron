/**
 * nolib[gext] screen backend — Mechatron GNOME Shell extension D-Bus client.
 *
 * Talks to the dev.mechatronic.Shell.Screen interface, which wraps
 * Shell.Screenshot inside gnome-shell.  Compared with nolib[portal]:
 *   - no popup (the extension's bearer-token auth runs in compositor
 *     space, no xdg-desktop-portal handshake)
 *   - no /tmp file (composite_to_stream writes to a Gio.MemoryOutputStream)
 *
 * Image transport is PNG bytes over D-Bus; the facade decodes them back
 * to the Uint32Array<ARGB> shape that the public screen API exposes.
 * pngjs handles the decode — same dependency clipboard-gext and the
 * portal screenshot path use.
 */

// @ts-ignore -- pngjs lacks type declarations
import { PNG } from "pngjs";
import {
  gextScrAvailable, gextScrSynchronize, gextScrGrab,
} from "../gext/screen";

export { gextScrSetToken as setToken, gextScrGetToken as getToken } from "../gext/screen";

let _checked = false;
async function ensureAvailable(): Promise<void> {
  if (_checked) return;
  _checked = true;
  const ok = await gextScrAvailable();
  if (!ok) throw new Error("nolib/screen[gext]: dev.mechatronic.Shell extension not on session bus");
}

export interface RawRect { x: number; y: number; w: number; h: number; }
export interface ScreenInfo { bounds: RawRect; usable: RawRect; }

export async function screen_synchronize(): Promise<ScreenInfo[] | null> {
  try {
    await ensureAvailable();
    const monitors = await gextScrSynchronize();
    if (!monitors || monitors.length === 0) return null;
    return monitors;
  } catch {
    return null;
  }
}

export async function screen_grabScreen(
  x: number, y: number, w: number, h: number, _windowHandle?: number,
): Promise<Uint32Array | null> {
  if (w <= 0 || h <= 0) return null;
  await ensureAvailable();
  let png: Buffer;
  try {
    png = await gextScrGrab(x, y, w, h);
  } catch {
    return null;
  }
  if (!png || png.length === 0) return null;
  let decoded;
  try {
    decoded = PNG.sync.read(png);
  } catch {
    return null;
  }
  const { width, height, data } = decoded;
  // pngjs returns 4 bytes per pixel in RGBA order.  We re-pack to the
  // ARGB-in-u32 layout the public screen API uses (same convention as
  // screen-x11 / screen-portal).
  const out = new Uint32Array(w * h);
  const cw = Math.min(width, w);
  const ch = Math.min(height, h);
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) {
      const o = (row * width + col) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const a = data[o + 3];
      out[row * w + col] =
        ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
    }
  }
  return out;
}

// Portal token is a no-op for gext — there's no portal session to restore.
export function screen_getPortalToken(): string | null { return null; }
export function screen_setPortalToken(_token: string | null): void {}
