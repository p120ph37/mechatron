import { XConnection } from "../x11proto/conn";
import { getXConnection, closeXConnection, xconnOpenReason, _resetXConnForTests } from "./xconn";
import { linux_xButton } from "./mouse";

const X_BTN_WHEEL_UP = 4, X_BTN_WHEEL_DOWN = 5;
const X_BTN_WHEEL_LEFT = 6, X_BTN_WHEEL_RIGHT = 7;

let _xtestChecked = false;
let _xtestOk = false;
let _chain: Promise<void> = Promise.resolve();

async function ensureXTest(): Promise<XConnection | null> {
  const c = await getXConnection();
  if (!c) return null;
  if (!_xtestChecked) {
    _xtestChecked = true;
    const q = await c.queryExtension("XTEST");
    _xtestOk = q.present;
  }
  return _xtestOk ? c : null;
}

function enqueue(fn: (c: XConnection) => Promise<void> | void): Promise<void> {
  const step = _chain.then(async () => {
    const c = await ensureXTest();
    if (!c) return;
    try { await fn(c); } catch {}
  });
  _chain = step;
  return step;
}

export function xprotoOpenReason(): string | null { return xconnOpenReason(); }
export function xprotoReady(): boolean { return !!getXConnection() && _xtestOk; }
export function xprotoFlush(): Promise<void> { return _chain; }

export function xprotoKeyPress(keysym: number): Promise<void> {
  return enqueue(async (c) => {
    const keycode = c.keysymToKeycode(keysym);
    if (keycode === 0) return;
    await c.fakeKeyPress(keycode);
  });
}

export function xprotoKeyRelease(keysym: number): Promise<void> {
  return enqueue(async (c) => {
    const keycode = c.keysymToKeycode(keysym);
    if (keycode === 0) return;
    await c.fakeKeyRelease(keycode);
  });
}

export function xprotoMousePress(button: number): Promise<void> {
  const b = linux_xButton(button);
  if (b === null) return Promise.resolve();
  return enqueue((c) => c.fakeButtonPress(b));
}

export function xprotoMouseRelease(button: number): Promise<void> {
  const b = linux_xButton(button);
  if (b === null) return Promise.resolve();
  return enqueue((c) => c.fakeButtonRelease(b));
}

function xprotoScroll(amount: number, negBtn: number, posBtn: number): Promise<void> {
  const repeat = Math.abs(amount);
  if (repeat === 0) return Promise.resolve();
  const button = amount < 0 ? negBtn : posBtn;
  return enqueue(async (c) => {
    for (let i = 0; i < repeat; i++) {
      await c.fakeButtonPress(button);
      await c.fakeButtonRelease(button);
    }
  });
}

export function xprotoScrollV(amount: number): Promise<void> {
  return xprotoScroll(amount, X_BTN_WHEEL_DOWN, X_BTN_WHEEL_UP);
}

export function xprotoScrollH(amount: number): Promise<void> {
  return xprotoScroll(amount, X_BTN_WHEEL_LEFT, X_BTN_WHEEL_RIGHT);
}

export function xprotoSetPos(x: number, y: number): Promise<void> {
  return enqueue((c) => { c.warpPointer(x, y); });
}

export async function xprotoGrabScreen(
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> {
  const c = await getXConnection();
  if (!c || w <= 0 || h <= 0) return null;
  try {
    const drawable = windowHandle && windowHandle !== 0
      ? (windowHandle >>> 0)
      : (c.info.screens[0]?.root ?? 0);
    const reply = await c.getImage({ drawable, x, y, width: w, height: h });
    return zpixmapToArgb(reply.data, w, h);
  } catch {
    return null;
  }
}

function zpixmapToArgb(src: Buffer, w: number, h: number): Uint32Array {
  const n = w * h;
  const srcU32 = new Uint32Array(src.buffer, src.byteOffset, n);
  const pixels = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    pixels[i] = (0xFF000000 | (srcU32[i] & 0x00FFFFFF)) >>> 0;
  }
  return pixels;
}

export function _resetXprotoForTests(): void {
  _resetXConnForTests();
  _xtestChecked = false;
  _xtestOk = false;
  _chain = Promise.resolve();
}
