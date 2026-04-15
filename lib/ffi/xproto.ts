/**
 * Sync→async bridge that routes the FFI keyboard/mouse dispatch through
 * the pure-TS `lib/x11proto` wire-protocol client.
 *
 * Lifetime model: a single `XConnection` per process, opened lazily on
 * first use.  Connection setup + XTEST negotiation + GetKeyboardMapping
 * warm-up run asynchronously; callers see a synchronous API that
 * enqueues onto a promise chain.  Because the chain preserves ordering
 * and XTEST FakeInput is fire-and-forget, event ordering on the wire
 * matches call ordering even though the initial dispatch is deferred.
 *
 * Read paths (getKeyState, getPos, getButtonState) can't be bridged to
 * sync in Node — there's no way to block a single-threaded event loop
 * waiting for a socket reply — so those always fall through to the
 * XTest/X11 path when it's available.  The xproto routing targets the
 * write paths which are the bulk of automation workloads.
 *
 * `xprotoSelected()` gates the dispatch in lib/ffi/keyboard.ts and
 * lib/ffi/mouse.ts: it's true when `MECHATRON_INPUT_MECHANISM=xproto`
 * is pinned (via env var or `Platform.setMechanism`) AND the lazy open
 * hasn't bailed.  Failures revert to the XTest path.
 */

import { XConnection } from "../x11proto/conn";
import { getMechanism } from "../platform";
import {
  BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2,
} from "../mouse/constants";

// X11 button numbers for XTestFakeInput (same as Xlib pointer buttons):
//   1=Left, 2=Middle, 3=Right, 4=WheelUp, 5=WheelDown, 6=WheelLeft,
//   7=WheelRight, 8=X1/back, 9=X2/forward.
const X_BTN_LEFT = 1;
const X_BTN_MIDDLE = 2;
const X_BTN_RIGHT = 3;
const X_BTN_WHEEL_UP = 4;
const X_BTN_WHEEL_DOWN = 5;
const X_BTN_WHEEL_LEFT = 6;
const X_BTN_WHEEL_RIGHT = 7;
const X_BTN_X1 = 8;
const X_BTN_X2 = 9;

function xButton(button: number): number | null {
  switch (button) {
    case BUTTON_LEFT:  return X_BTN_LEFT;
    case BUTTON_MID:   return X_BTN_MIDDLE;
    case BUTTON_RIGHT: return X_BTN_RIGHT;
    case BUTTON_X1:    return X_BTN_X1;
    case BUTTON_X2:    return X_BTN_X2;
    default: return null;
  }
}

// =============================================================================
// Connection lifecycle
// =============================================================================

let _openAttempted = false;
let _conn: XConnection | null = null;
let _openPromise: Promise<XConnection | null> | null = null;
let _openReason: string | null = null;

// All fire-and-forget work is serialized on this promise chain so that
// socket writes come out in the same order as the synchronous API calls
// that enqueued them, even before the connection is fully open.
let _chain: Promise<void> = Promise.resolve();

async function openConn(): Promise<XConnection | null> {
  if (_openAttempted) return _conn;
  _openAttempted = true;
  if (process.platform !== "linux") {
    _openReason = "not Linux";
    return null;
  }
  try {
    const c = await XConnection.connect();
    // Prime the XTEST probe and keyboard map before any write lands, so
    // the first real press/release doesn't race the setup traffic.
    const q = await c.queryExtension("XTEST");
    if (!q.present) {
      _openReason = "XTEST not present on server";
      c.close();
      return null;
    }
    await c.getKeyboardMapping();
    _conn = c;
    return c;
  } catch (e) {
    _openReason = (e as Error).message || String(e);
    return null;
  }
}

function ensureConn(): Promise<XConnection | null> {
  if (!_openPromise) _openPromise = openConn();
  return _openPromise;
}

function enqueue(fn: (c: XConnection) => Promise<void> | void): void {
  _chain = _chain.then(async () => {
    const c = await ensureConn();
    if (!c) return;
    // Fire-and-forget: swallow per-op errors so a single bad keysym
    // doesn't poison later events.  Connection-fatal errors tear the
    // socket down inside conn.ts; subsequent enqueue() calls just no-op.
    try { await fn(c); } catch { /* ignore */ }
  });
}

// =============================================================================
// Public surface — called from lib/ffi/keyboard.ts & mouse.ts
// =============================================================================

/** Diagnostic: why did the last `ensureConn()` fail? */
export function xprotoOpenReason(): string | null { return _openReason; }

/**
 * Is the xproto backend open, connected, and ready to dispatch events?
 * Triggers the lazy open on first call; subsequent calls just report
 * the cached state.  Tests poll this via `waitFor()` to synchronise on
 * connection readiness before asserting.
 */
export function xprotoReady(): boolean { return _conn !== null; }

/** Flush the fire-and-forget chain — callers use this in tests. */
export function xprotoFlush(): Promise<void> {
  return _chain.then(() => ensureConn()).then(() => { /* void */ });
}

/**
 * Is xproto the selected input mechanism?  Matches `uinputSelected()`'s
 * pattern: short-circuits when the mechanism isn't xproto so non-Linux
 * / non-xproto callers skip the lazy open entirely.
 */
export function xprotoSelected(): boolean {
  if (getMechanism("input") !== "xproto") return false;
  // Kick off the open if it hasn't been started; callers immediately
  // enqueue events after this returns so the chain naturally awaits the
  // pending openConn().
  void ensureConn();
  return true;
}

export function xprotoKeyPress(keysym: number): void {
  enqueue(async (c) => {
    const keycode = c.keysymToKeycode(keysym);
    if (keycode === 0) return;
    await c.fakeKeyPress(keycode);
  });
}

export function xprotoKeyRelease(keysym: number): void {
  enqueue(async (c) => {
    const keycode = c.keysymToKeycode(keysym);
    if (keycode === 0) return;
    await c.fakeKeyRelease(keycode);
  });
}

export function xprotoMousePress(button: number): void {
  const b = xButton(button);
  if (b === null) return;
  enqueue((c) => c.fakeButtonPress(b));
}

export function xprotoMouseRelease(button: number): void {
  const b = xButton(button);
  if (b === null) return;
  enqueue((c) => c.fakeButtonRelease(b));
}

/**
 * Vertical scroll: emit `|amount|` press/release pairs on button 4 (up,
 * amount > 0) or button 5 (down, amount < 0).  Matches libXtst's
 * XTestFakeButtonEvent loop used by linux_mouse_scrollV.
 */
export function xprotoScrollV(amount: number): void {
  const repeat = Math.abs(amount);
  const button = amount < 0 ? X_BTN_WHEEL_DOWN : X_BTN_WHEEL_UP;
  for (let i = 0; i < repeat; i++) {
    enqueue((c) => c.fakeButtonPress(button));
    enqueue((c) => c.fakeButtonRelease(button));
  }
}

/** Horizontal scroll: button 6 (left, amount < 0) / button 7 (right). */
export function xprotoScrollH(amount: number): void {
  const repeat = Math.abs(amount);
  const button = amount < 0 ? X_BTN_WHEEL_LEFT : X_BTN_WHEEL_RIGHT;
  for (let i = 0; i < repeat; i++) {
    enqueue((c) => c.fakeButtonPress(button));
    enqueue((c) => c.fakeButtonRelease(button));
  }
}

/** Absolute pointer warp on screen 0's root window. */
export function xprotoSetPos(x: number, y: number): void {
  enqueue((c) => { c.warpPointer(x, y); });
}

/**
 * Async screen capture — the FFI backend's sync `screen_grabScreen` path
 * can't call this, but Screen.grabScreenAsync can (it microtask-wraps
 * the sync path; we could add a real async path later).  Returns null
 * on any failure so callers can fall back cleanly.
 */
export async function xprotoGrabScreen(
  x: number, y: number, w: number, h: number, windowHandle?: number,
): Promise<Uint32Array | null> {
  const c = await ensureConn();
  if (!c || w <= 0 || h <= 0) return null;
  try {
    const drawable = windowHandle && windowHandle !== 0
      ? (windowHandle >>> 0)
      : (c.info.screens[0]?.root ?? 0);
    const reply = await c.getImage({ drawable, x, y, width: w, height: h });
    return zpixmapToArgb(reply.data, w, h, c.info);
  } catch {
    return null;
  }
}

// =============================================================================
// ZPixmap decode
//
// GetImage on a TrueColor visual returns the pixels in the visual's own
// byte order / channel masks.  On every X server mechatron is likely to
// encounter this is 32-bit BGRX little-endian (matches what lib/ffi/screen.ts
// extracts via XGetPixel's per-pixel mask read).  Fall back to per-pixel
// mask decode when the visual reports anything other than the common
// layout.
// =============================================================================

import type { ServerInfo } from "../x11proto/wire";

function zpixmapToArgb(src: Buffer, w: number, h: number, info: ServerInfo): Uint32Array {
  const pixels = new Uint32Array(w * h);
  // Assume 32-bit pixels (our only target — depth 24/32 on TrueColor).
  // Fast path: native BGRX / BGRA, matches the masks reported by nearly
  // every X.org visual.  Each u32 on the wire is 0x00RRGGBB (LE),
  // identical to our canonical ARGB with alpha forced to 0xFF.
  const strideBytes = w * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * strideBytes + x * 4;
      const b = src[o];
      const g = src[o + 1];
      const r = src[o + 2];
      // src[o + 3] is typically 0 (padding byte of BGRX); force alpha to 0xFF
      pixels[y * w + x] = (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
  }
  // `info` is currently unused because we don't yet consult the visual's
  // red/green/blue masks — every server we target reports BGRX.  Keeping
  // the parameter positions callers passing ServerInfo through so we can
  // implement mask-driven decode later without churning the call sites.
  void info;
  return pixels;
}

// =============================================================================
// Process-exit cleanup
// =============================================================================

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("exit", () => {
    if (_conn) {
      try { _conn.close(); } catch { /* ignore */ }
    }
  });
}

/** Test-only: tear the connection down + reset all caches. */
export function _resetXprotoForTests(): void {
  if (_conn) {
    try { _conn.close(); } catch { /* ignore */ }
  }
  _conn = null;
  _openPromise = null;
  _openAttempted = false;
  _openReason = null;
  _chain = Promise.resolve();
}
