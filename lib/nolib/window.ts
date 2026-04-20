/**
 * nolib window backend — pure TypeScript, no native libraries.
 *
 * Linux: X11 wire protocol (xproto) over Unix/TCP socket.
 * This is a direct lift of lib/ffi/window.ts which is already pure xproto.
 * Other platforms: not available.
 */

import { getXConnection } from "../ffi/xconn";
import type { XConnection } from "../x11proto/conn";

const IS_LINUX = process.platform === "linux";

const STATE_TOPMOST  = 0;
const STATE_MINIMIZE = 1;
const STATE_MAXIMIZE = 2;

const SubstructureNotifyMask = (1 << 19);
const SubstructureRedirectMask = (1 << 20);

function makeClientMessageEvent(
  window: number, messageType: number, format: number, data: number[],
): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(33, 0);
  buf.writeUInt8(format, 1);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt32LE(window >>> 0, 4);
  buf.writeUInt32LE(messageType >>> 0, 8);
  for (let i = 0; i < 5; i++) {
    buf.writeUInt32LE((data[i] ?? 0) >>> 0, 12 + i * 4);
  }
  return buf;
}

async function sendClientMessage(
  c: XConnection, win: number, messageType: number, data: number[],
): Promise<void> {
  const root = c.info.screens[0]?.root ?? 0;
  const evt = makeClientMessageEvent(win, messageType, 32, data);
  c.sendEvent({
    destination: root,
    propagate: false,
    eventMask: SubstructureNotifyMask | SubstructureRedirectMask,
    event: evt,
  });
}

function readU32Array(buf: Buffer, count: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < count && (i * 4 + 4) <= buf.length; i++) {
    result.push(buf.readUInt32LE(i * 4));
  }
  return result;
}

async function winIsValid(handle: number): Promise<boolean> {
  if (handle === 0) return false;
  const c = await getXConnection();
  if (!c) return false;
  try {
    await c.getProperty({ window: handle, property: 1 });
    return true;
  } catch {
    return false;
  }
}

async function getWmState(c: XConnection, handle: number, which: number): Promise<boolean> {
  const wmState = await c.internAtom("_NET_WM_STATE", true);
  if (wmState === 0) return false;
  let targetAtom: number;
  switch (which) {
    case STATE_TOPMOST:  targetAtom = await c.internAtom("_NET_WM_STATE_ABOVE", true); break;
    case STATE_MINIMIZE: targetAtom = await c.internAtom("_NET_WM_STATE_HIDDEN", true); break;
    case STATE_MAXIMIZE: targetAtom = await c.internAtom("_NET_WM_STATE_MAXIMIZED_VERT", true); break;
    default: return false;
  }
  if (targetAtom === 0) return false;
  try {
    const gp = await c.getProperty({ window: handle, property: wmState });
    if (gp.format !== 32 || gp.value.length < 4) return false;
    const atoms = readU32Array(gp.value, gp.value.length / 4);
    if (which === STATE_MAXIMIZE) {
      const horzAtom = await c.internAtom("_NET_WM_STATE_MAXIMIZED_HORZ", true);
      return atoms.includes(targetAtom) && atoms.includes(horzAtom);
    }
    return atoms.includes(targetAtom);
  } catch {
    return false;
  }
}

async function setWmState(c: XConnection, handle: number, which: number, enable: boolean): Promise<void> {
  const wmState = await c.internAtom("_NET_WM_STATE", true);
  if (wmState === 0) return;

  if (which === STATE_MINIMIZE && enable) {
    const wmChangeState = await c.internAtom("WM_CHANGE_STATE", true);
    if (wmChangeState === 0) return;
    const evt = makeClientMessageEvent(handle, wmChangeState, 32, [3, 0, 0, 0, 0]);
    const root = c.info.screens[0]?.root ?? 0;
    c.sendEvent({
      destination: root,
      propagate: false,
      eventMask: SubstructureNotifyMask | SubstructureRedirectMask,
      event: evt,
    });
    return;
  }

  if (which === STATE_MINIMIZE && !enable) {
    c.mapWindow(handle);
    return;
  }

  let atom1: number;
  let atom2 = 0;
  switch (which) {
    case STATE_TOPMOST:
      atom1 = await c.internAtom("_NET_WM_STATE_ABOVE", true);
      break;
    case STATE_MAXIMIZE:
      atom1 = await c.internAtom("_NET_WM_STATE_MAXIMIZED_VERT", true);
      atom2 = await c.internAtom("_NET_WM_STATE_MAXIMIZED_HORZ", true);
      break;
    default: return;
  }
  if (atom1 === 0) return;
  const action = enable ? 1 : 0;
  await sendClientMessage(c, handle, wmState, [action, atom1, atom2, 0, 0]);
}

async function getFrame(c: XConnection, handle: number): Promise<{ left: number; right: number; top: number; bottom: number }> {
  const frameAtom = await c.internAtom("_NET_FRAME_EXTENTS", true);
  if (frameAtom === 0) return { left: 0, right: 0, top: 0, bottom: 0 };
  try {
    const gp = await c.getProperty({ window: handle, property: frameAtom });
    if (gp.format === 32 && gp.value.length >= 16) {
      return {
        left:   gp.value.readUInt32LE(0),
        right:  gp.value.readUInt32LE(4),
        top:    gp.value.readUInt32LE(8),
        bottom: gp.value.readUInt32LE(12),
      };
    }
  } catch {}
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

async function enumWindows(c: XConnection, win: number, pattern: RegExp | null, results: number[]): Promise<void> {
  try {
    const qt = await c.queryTree(win);
    for (const child of qt.children) {
      const nameAtom = await c.internAtom("_NET_WM_NAME", true);
      let title = "";
      if (nameAtom !== 0) {
        try {
          const gp = await c.getProperty({ window: child, property: nameAtom });
          if (gp.value.length > 0) title = gp.value.toString("utf8");
        } catch {}
      }
      if (title === "") {
        try {
          const gp = await c.getProperty({ window: child, property: 39 /* WM_NAME */ });
          if (gp.value.length > 0) title = gp.value.toString("utf8");
        } catch {}
      }
      if (!pattern || pattern.test(title)) {
        results.push(child);
      }
      await enumWindows(c, child, pattern, results);
    }
  } catch {}
}

// ── Exports (same signatures as ffi/window.ts) ─────────────────────────

export async function window_isValid(handle: number): Promise<boolean> {
  return winIsValid(handle);
}

export async function window_close(handle: number): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  c.destroyWindow(handle);
}

export async function window_isTopMost(handle: number): Promise<boolean> {
  if (!(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_TOPMOST);
}

export async function window_isBorderless(handle: number): Promise<boolean> {
  if (!(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  const wmHints = await c.internAtom("_MOTIF_WM_HINTS", true);
  if (wmHints === 0) return false;
  try {
    const gp = await c.getProperty({ window: handle, property: wmHints });
    if (gp.format !== 32 || gp.value.length < 12) return false;
    return gp.value.readUInt32LE(8) === 0;
  } catch {
    return false;
  }
}

export async function window_isMinimized(handle: number): Promise<boolean> {
  if (!(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_MINIMIZE);
}

export async function window_isMaximized(handle: number): Promise<boolean> {
  if (!(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_MAXIMIZE);
}

export async function window_setTopMost(handle: number, topMost: boolean): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_TOPMOST, topMost);
}

export async function window_setBorderless(handle: number, borderless: boolean): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const wmHints = await c.internAtom("_MOTIF_WM_HINTS", false);
  if (wmHints === 0) return;
  const data = Buffer.alloc(20);
  data.writeUInt32LE(2, 0);  // flags: MWM_HINTS_DECORATIONS
  data.writeUInt32LE(0, 4);  // functions
  data.writeUInt32LE(borderless ? 0 : 1, 8);  // decorations
  data.writeUInt32LE(0, 12);
  data.writeUInt32LE(0, 16);
  c.changeProperty({ window: handle, property: wmHints, type: wmHints, format: 32, mode: 0, data });
}

export async function window_setMinimized(handle: number, minimized: boolean): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_MINIMIZE, minimized);
}

export async function window_setMaximized(handle: number, maximized: boolean): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_MAXIMIZE, maximized);
}

export async function window_getProcess(handle: number): Promise<number> {
  return window_getPID(handle);
}

export async function window_getPID(handle: number): Promise<number> {
  if (!(await winIsValid(handle))) return 0;
  const c = await getXConnection();
  if (!c) return 0;
  const pidAtom = await c.internAtom("_NET_WM_PID", true);
  if (pidAtom === 0) return 0;
  try {
    const gp = await c.getProperty({ window: handle, property: pidAtom });
    if (gp.format === 32 && gp.value.length >= 4) {
      return gp.value.readUInt32LE(0);
    }
  } catch {}
  return 0;
}

export function window_getHandle(handle: number): number { return handle; }

export async function window_setHandle(_handle: number, newHandle: number): Promise<boolean> {
  if (newHandle === 0) return true;
  return winIsValid(newHandle);
}

export async function window_getTitle(handle: number): Promise<string> {
  if (!(await winIsValid(handle))) return "";
  const c = await getXConnection();
  if (!c) return "";
  const nameAtom = await c.internAtom("_NET_WM_NAME", true);
  if (nameAtom !== 0) {
    try {
      const gp = await c.getProperty({ window: handle, property: nameAtom });
      if (gp.value.length > 0) return gp.value.toString("utf8");
    } catch {}
  }
  try {
    const gp = await c.getProperty({ window: handle, property: 39 /* WM_NAME */ });
    if (gp.value.length > 0) return gp.value.toString("utf8");
  } catch {}
  return "";
}

export async function window_setTitle(handle: number, title: string): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const data = Buffer.from(title, "utf8");
  c.changeProperty({ window: handle, property: 39 /* WM_NAME */, type: 31 /* STRING */, format: 8, mode: 0, data });
}

export async function window_getBounds(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  if (!(await winIsValid(handle))) return { x: 0, y: 0, w: 0, h: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0, w: 0, h: 0 };
  try {
    const geom = await c.getGeometry(handle);
    const frame = await getFrame(c, handle);
    return {
      x: geom.x - frame.left,
      y: geom.y - frame.top,
      w: geom.width + frame.left + frame.right,
      h: geom.height + frame.top + frame.bottom,
    };
  } catch {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
}

export async function window_setBounds(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const frame = await getFrame(c, handle);
  c.configureWindow({
    window: handle,
    x: x + frame.left,
    y: y + frame.top,
    width: Math.max(1, w - frame.left - frame.right),
    height: Math.max(1, h - frame.top - frame.bottom),
  });
}

export async function window_getClient(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  if (!(await winIsValid(handle))) return { x: 0, y: 0, w: 0, h: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0, w: 0, h: 0 };
  try {
    const geom = await c.getGeometry(handle);
    return { x: geom.x, y: geom.y, w: geom.width, h: geom.height };
  } catch {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
}

export async function window_setClient(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  c.configureWindow({ window: handle, x, y, width: Math.max(1, w), height: Math.max(1, h) });
}

export async function window_mapToClient(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  if (!(await winIsValid(handle))) return { x: 0, y: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  try {
    const geom = await c.getGeometry(handle);
    return { x: x - geom.x, y: y - geom.y };
  } catch {
    return { x: 0, y: 0 };
  }
}

export async function window_mapToScreen(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  if (!(await winIsValid(handle))) return { x: 0, y: 0 };
  const c = await getXConnection();
  if (!c) return { x: 0, y: 0 };
  try {
    const geom = await c.getGeometry(handle);
    return { x: x + geom.x, y: y + geom.y };
  } catch {
    return { x: 0, y: 0 };
  }
}

export async function window_getList(regexStr?: string): Promise<number[]> {
  const c = await getXConnection();
  if (!c) return [];
  const root = c.info.screens[0]?.root ?? 0;
  const results: number[] = [];
  const pattern = regexStr ? new RegExp(regexStr) : null;
  await enumWindows(c, root, pattern, results);
  return results;
}

export async function window_getActive(): Promise<number> {
  const c = await getXConnection();
  if (!c) return 0;
  const root = c.info.screens[0]?.root ?? 0;
  const activeAtom = await c.internAtom("_NET_ACTIVE_WINDOW", true);
  if (activeAtom === 0) return 0;
  try {
    const gp = await c.getProperty({ window: root, property: activeAtom });
    if (gp.format === 32 && gp.value.length >= 4) {
      return gp.value.readUInt32LE(0);
    }
  } catch {}
  return 0;
}

export async function window_setActive(handle: number): Promise<void> {
  if (handle === 0) return;
  const c = await getXConnection();
  if (!c) return;
  const activeAtom = await c.internAtom("_NET_ACTIVE_WINDOW", true);
  if (activeAtom === 0) {
    c.configureWindow({ window: handle, stackMode: 0 });
    return;
  }
  await sendClientMessage(c, handle, activeAtom, [1, 0, 0, 0, 0]);
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  return true;
}

import { getNolibVariant } from "../backend";
const VARIANT = getNolibVariant();

if (!IS_LINUX || !process.env.DISPLAY) {
  throw new Error("nolib/window: requires Linux with $DISPLAY");
}
if (VARIANT === "vt") {
  throw new Error("nolib/window[vt]: window management requires X11");
}
