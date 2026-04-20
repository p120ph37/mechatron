/**
 * nolib screen backend — pure TypeScript, no native libraries.
 *
 * Linux: XRandR monitor enumeration and GetImage capture via xproto socket.
 * Other platforms: not available.
 */

import { getXConnection } from "../ffi/xconn";
import { xprotoGrabScreen } from "../ffi/xproto";

const IS_LINUX = process.platform === "linux";

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

function intersectBounds(a: RawRect, b: RawRect): RawRect {
  const l = Math.max(a.x, b.x);
  const t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  return r > l && bot > t ? { x: l, y: t, w: r - l, h: bot - t } : { x: 0, y: 0, w: 0, h: 0 };
}

async function linuxSynchronize(): Promise<ScreenInfo[] | null> {
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

async function linuxGrabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Promise<Uint32Array | null> {
  return xprotoGrabScreen(x, y, w, h, windowHandle);
}

export function screen_synchronize(): Promise<ScreenInfo[] | null> {
  return linuxSynchronize();
}

export function screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Promise<Uint32Array | null> {
  return linuxGrabScreen(x, y, w, h, windowHandle);
}

if (!IS_LINUX || !process.env.DISPLAY) {
  throw new Error("nolib/screen: requires Linux with $DISPLAY");
}
