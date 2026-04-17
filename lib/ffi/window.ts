import { getXConnection } from "./xconn";
import type { XConnection } from "../x11proto/conn";

const IS_LINUX = process.platform === "linux";

const STATE_TOPMOST  = 0;
const STATE_MINIMIZE = 1;
const STATE_MAXIMIZE = 2;

const SubstructureNotifyMask = (1 << 19);
const SubstructureRedirectMask = (1 << 20);

// ── Helpers ─────────────────────────────────────────────────────────

function makeClientMessageEvent(
  window: number, messageType: number, format: number, data: number[],
): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(33, 0);                    // ClientMessage type
  buf.writeUInt8(format, 1);                // format (32)
  buf.writeUInt16LE(0, 2);                  // sequence (0 for sent events)
  buf.writeUInt32LE(window >>> 0, 4);       // window
  buf.writeUInt32LE(messageType >>> 0, 8);  // message_type atom
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

// ── Validity ────────────────────────────────────────────────────────

async function winIsValid(handle: number): Promise<boolean> {
  if (handle === 0) return false;
  const c = await getXConnection();
  if (!c) return false;
  const wmPid = await c.internAtom("_NET_WM_PID", true);
  if (wmPid === 0) return false;
  try {
    const gp = await c.getProperty({ window: handle, property: wmPid });
    return gp.format !== 0 && gp.value.length > 0;
  } catch {
    return false;
  }
}

// ── State predicates ────────────────────────────────────────────────

async function getWmState(c: XConnection, win: number, setting: number): Promise<boolean> {
  const [wmState, wmAbove, wmHidden, wmHmax, wmVmax] = await Promise.all([
    c.internAtom("_NET_WM_STATE", true),
    c.internAtom("_NET_WM_STATE_ABOVE", true),
    c.internAtom("_NET_WM_STATE_HIDDEN", true),
    c.internAtom("_NET_WM_STATE_MAXIMIZED_HORZ", true),
    c.internAtom("_NET_WM_STATE_MAXIMIZED_VERT", true),
  ]);
  if (wmState === 0 || wmAbove === 0 || wmHmax === 0 || wmVmax === 0 || wmHidden === 0) return false;
  try {
    const gp = await c.getProperty({ window: win, property: wmState });
    if (gp.format !== 32) return false;
    const atoms = readU32Array(gp.value, gp.value.length / 4);
    let test1 = false, test2 = false;
    for (const a of atoms) {
      switch (setting) {
        case STATE_TOPMOST:
          if (a === wmAbove) { test1 = true; test2 = true; }
          break;
        case STATE_MINIMIZE:
          if (a === wmHidden) { test1 = true; test2 = true; }
          break;
        case STATE_MAXIMIZE:
          if (a === wmHmax) test1 = true;
          if (a === wmVmax) test2 = true;
          break;
      }
      if (test1 && test2) break;
    }
    return test1 && test2;
  } catch {
    return false;
  }
}

async function setWmState(c: XConnection, win: number, setting: number, state: boolean): Promise<void> {
  if (setting === STATE_MINIMIZE) {
    if (state) {
      // XIconifyWindow sends WM_CHANGE_STATE with IconicState=3
      const wmChangeState = await c.internAtom("WM_CHANGE_STATE", false);
      const root = c.info.screens[0]?.root ?? 0;
      const evt = makeClientMessageEvent(win, wmChangeState, 32, [3, 0, 0, 0, 0]);
      c.sendEvent({
        destination: root,
        propagate: false,
        eventMask: SubstructureNotifyMask | SubstructureRedirectMask,
        event: evt,
      });
    } else {
      await windowSetActiveInternal(c, win);
    }
    return;
  }

  const [wmState, wmAbove, wmHmax, wmVmax] = await Promise.all([
    c.internAtom("_NET_WM_STATE", false),
    c.internAtom("_NET_WM_STATE_ABOVE", false),
    c.internAtom("_NET_WM_STATE_MAXIMIZED_HORZ", false),
    c.internAtom("_NET_WM_STATE_MAXIMIZED_VERT", false),
  ]);

  const data: number[] = [state ? 1 : 0, 0, 0, 0, 0];
  if (setting === STATE_TOPMOST) {
    data[1] = wmAbove;
  } else if (setting === STATE_MAXIMIZE) {
    data[1] = wmHmax;
    data[2] = wmVmax;
  } else {
    return;
  }
  await sendClientMessage(c, win, wmState, data);
}

async function windowSetActiveInternal(c: XConnection, win: number): Promise<void> {
  const wmActive = await c.internAtom("_NET_ACTIVE_WINDOW", true);
  if (wmActive !== 0) {
    await sendClientMessage(c, win, wmActive, [2, 0, 0, 0, 0]);
  }
  c.mapWindow(win);
  c.configureWindow({ window: win, stackMode: 0 }); // Above
}

// ── Frame / client / title ──────────────────────────────────────────

async function getFrame(c: XConnection, win: number): Promise<{ left: number; top: number; right: number; bottom: number }> {
  const zero = { left: 0, top: 0, right: 0, bottom: 0 };
  const wmExtents = await c.internAtom("_NET_FRAME_EXTENTS", true);
  if (wmExtents === 0) return zero;
  try {
    const gp = await c.getProperty({ window: win, property: wmExtents });
    if (gp.format !== 32 || gp.value.length < 16) return zero;
    const left   = gp.value.readUInt32LE(0);
    const right  = gp.value.readUInt32LE(4);
    const top    = gp.value.readUInt32LE(8);
    const bottom = gp.value.readUInt32LE(12);
    return { left, top, right: left + right, bottom: top + bottom };
  } catch {
    return zero;
  }
}

async function getTitle(c: XConnection, win: number): Promise<string> {
  const wmName = await c.internAtom("_NET_WM_NAME", true);
  if (wmName !== 0) {
    try {
      const gp = await c.getProperty({ window: win, property: wmName });
      if (gp.value.length > 0) {
        return gp.value.toString("utf8");
      }
    } catch {}
  }
  const xaWmName = await c.internAtom("WM_NAME", false);
  if (xaWmName !== 0) {
    try {
      const gp = await c.getProperty({ window: win, property: xaWmName });
      if (gp.value.length > 0) {
        return gp.value.toString("utf8");
      }
    } catch {}
  }
  return "";
}

async function getPid(c: XConnection, win: number): Promise<number> {
  const wmPid = await c.internAtom("_NET_WM_PID", true);
  if (wmPid === 0) return 0;
  try {
    const gp = await c.getProperty({ window: win, property: wmPid });
    if (gp.format !== 32 || gp.value.length < 4) return 0;
    return gp.value.readUInt32LE(0);
  } catch {
    return 0;
  }
}

async function getClient(c: XConnection, win: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  try {
    const attr = await c.getWindowAttributes(win);
    const geo = await c.getGeometry(win);
    const root = c.info.screens[0]?.root ?? 0;
    const tc = await c.translateCoordinates(win, root, 0, 0);
    return { x: tc.dstX, y: tc.dstY, w: geo.width, h: geo.height };
  } catch {
    return zero;
  }
}

// ── Enumeration ─────────────────────────────────────────────────────

function makeRegex(s?: string): RegExp | null {
  if (!s) return null;
  try { return new RegExp(s); } catch { return null; }
}

async function enumWindows(
  c: XConnection, win: number, re: RegExp | null, pidFilter: number, out: number[],
): Promise<void> {
  try {
    const attr = await c.getWindowAttributes(win);
    if (attr.mapState === 2) { // IsViewable
      if (await winIsValid(win)) {
        const matchPid = pidFilter === 0 || (await getPid(c, win)) === pidFilter;
        if (matchPid) {
          let ok = true;
          if (re) {
            const t = await getTitle(c, win);
            ok = re.test(t);
          }
          if (ok) out.push(win);
        }
      }
    }
  } catch {}

  try {
    const qt = await c.queryTree(win);
    for (const child of qt.children) {
      await enumWindows(c, child, re, pidFilter, out);
    }
  } catch {}
}

// ── NAPI-compatible exports ─────────────────────────────────────────

export async function window_isValid(handle: number): Promise<boolean> {
  if (!IS_LINUX) return false;
  return winIsValid(handle);
}

export async function window_close(handle: number): Promise<void> {
  if (!IS_LINUX) return;
  if (!(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  c.destroyWindow(handle);
}

export async function window_isTopMost(handle: number): Promise<boolean> {
  if (!IS_LINUX || !(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_TOPMOST);
}

export async function window_isBorderless(handle: number): Promise<boolean> {
  if (!IS_LINUX || !(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  const wmHints = await c.internAtom("_MOTIF_WM_HINTS", true);
  if (wmHints === 0) return false;
  try {
    const gp = await c.getProperty({ window: handle, property: wmHints });
    if (gp.format !== 32 || gp.value.length < 12) return false;
    // _MOTIF_WM_HINTS: flags(u32), funcs(u32), decorations(u32) at offset 8
    const decorations = gp.value.readUInt32LE(8);
    return decorations === 0;
  } catch {
    return false;
  }
}

export async function window_isMinimized(handle: number): Promise<boolean> {
  if (!IS_LINUX || !(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_MINIMIZE);
}

export async function window_isMaximized(handle: number): Promise<boolean> {
  if (!IS_LINUX || !(await winIsValid(handle))) return false;
  const c = await getXConnection();
  if (!c) return false;
  return getWmState(c, handle, STATE_MAXIMIZE);
}

export async function window_setTopMost(handle: number, topMost: boolean): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_TOPMOST, topMost);
}

export async function window_setBorderless(handle: number, borderless: boolean): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const wmHints = await c.internAtom("_MOTIF_WM_HINTS", false);
  if (wmHints === 0) return;
  // 5 u32 values: flags=2 (MWM_HINTS_DECORATIONS), funcs=0,
  // decorations=(borderless?0:1), mode=0, status=0
  const data = Buffer.alloc(20);
  data.writeUInt32LE(2, 0);  // flags
  data.writeUInt32LE(0, 4);  // funcs
  data.writeUInt32LE(borderless ? 0 : 1, 8);  // decorations
  data.writeUInt32LE(0, 12); // mode
  data.writeUInt32LE(0, 16); // status
  c.changeProperty({
    window: handle, property: wmHints, type: wmHints,
    format: 32, data, mode: 0, // PropModeReplace
  });
}

export async function window_setMinimized(handle: number, minimized: boolean): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_MINIMIZE, minimized);
}

export async function window_setMaximized(handle: number, maximized: boolean): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  await setWmState(c, handle, STATE_MINIMIZE, false);
  await setWmState(c, handle, STATE_MAXIMIZE, maximized);
}

export async function window_getProcess(handle: number): Promise<number> {
  if (!IS_LINUX || !(await winIsValid(handle))) return 0;
  const c = await getXConnection();
  if (!c) return 0;
  return getPid(c, handle);
}

export async function window_getPID(handle: number): Promise<number> {
  if (!IS_LINUX || !(await winIsValid(handle))) return 0;
  const c = await getXConnection();
  if (!c) return 0;
  return getPid(c, handle);
}

export function window_getHandle(handle: number): number { return handle; }

export async function window_setHandle(_handle: number, newHandle: number): Promise<boolean> {
  if (!IS_LINUX) return newHandle === 0;
  if (newHandle === 0) return true;
  return winIsValid(newHandle);
}

export async function window_getTitle(handle: number): Promise<string> {
  if (!IS_LINUX || !(await winIsValid(handle))) return "";
  const c = await getXConnection();
  if (!c) return "";
  return getTitle(c, handle);
}

export async function window_setTitle(handle: number, title: string): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const wmName = await c.internAtom("WM_NAME", false);
  const xaString = await c.internAtom("STRING", false);
  if (wmName === 0 || xaString === 0) return;
  c.changeProperty({
    window: handle, property: wmName, type: xaString,
    format: 8, data: Buffer.from(title, "utf8"), mode: 0,
  });
}

export async function window_getBounds(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  if (!IS_LINUX || !(await winIsValid(handle))) return zero;
  const c = await getXConnection();
  if (!c) return zero;
  const [cl, f] = await Promise.all([getClient(c, handle), getFrame(c, handle)]);
  return { x: cl.x - f.left, y: cl.y - f.top, w: cl.w + f.right, h: cl.h + f.bottom };
}

export async function window_setBounds(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  const f = await getFrame(c, handle);
  const ww = Math.max(1, w - f.right);
  const hh = Math.max(1, h - f.bottom);
  c.configureWindow({ window: handle, x, y, width: ww, height: hh });
}

export async function window_getClient(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  if (!IS_LINUX || !(await winIsValid(handle))) return zero;
  const c = await getXConnection();
  if (!c) return zero;
  return getClient(c, handle);
}

export async function window_setClient(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (!IS_LINUX || !(await winIsValid(handle))) return;
  const c = await getXConnection();
  if (!c) return;
  c.configureWindow({ window: handle, x, y, width: Math.max(1, w), height: Math.max(1, h) });
}

export async function window_mapToClient(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  if (!IS_LINUX || !(await winIsValid(handle))) return { x, y };
  const c = await getXConnection();
  if (!c) return { x, y };
  const cl = await getClient(c, handle);
  return { x: x - cl.x, y: y - cl.y };
}

export async function window_mapToScreen(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  if (!IS_LINUX || !(await winIsValid(handle))) return { x, y };
  const c = await getXConnection();
  if (!c) return { x, y };
  const cl = await getClient(c, handle);
  return { x: x + cl.x, y: y + cl.y };
}

export async function window_getList(regexStr?: string): Promise<number[]> {
  if (!IS_LINUX) return [];
  const c = await getXConnection();
  if (!c) return [];
  const re = makeRegex(regexStr);
  const out: number[] = [];
  const root = c.info.screens[0]?.root ?? 0;
  await enumWindows(c, root, re, 0, out);
  return out;
}

export async function window_getActive(): Promise<number> {
  if (!IS_LINUX) return 0;
  const c = await getXConnection();
  if (!c) return 0;
  const wmActive = await c.internAtom("_NET_ACTIVE_WINDOW", true);
  if (wmActive === 0) return 0;
  const root = c.info.screens[0]?.root ?? 0;
  try {
    const gp = await c.getProperty({ window: root, property: wmActive });
    if (gp.format !== 32 || gp.value.length < 4) return 0;
    return gp.value.readUInt32LE(0);
  } catch {
    return 0;
  }
}

export async function window_setActive(handle: number): Promise<void> {
  if (!IS_LINUX || handle === 0) return;
  const c = await getXConnection();
  if (!c) return;
  await windowSetActiveInternal(c, handle);
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  return IS_LINUX;
}
