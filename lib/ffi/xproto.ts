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
import { linux_xButton } from "./mouse";

// X11 wheel-button numbers (libXtst convention): 4=up 5=down 6=left 7=right.
const X_BTN_WHEEL_UP = 4, X_BTN_WHEEL_DOWN = 5;
const X_BTN_WHEEL_LEFT = 6, X_BTN_WHEEL_RIGHT = 7;

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
  // The chain's first step awaits ensureConn() before it runs `fn`, so
  // waiting on _chain alone covers both connect-in-flight and every
  // enqueued op.
  return _chain;
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
  const b = linux_xButton(button);
  if (b === null) return;
  enqueue((c) => c.fakeButtonPress(b));
}

export function xprotoMouseRelease(button: number): void {
  const b = linux_xButton(button);
  if (b === null) return;
  enqueue((c) => c.fakeButtonRelease(b));
}

/**
 * Scroll: emit `|amount|` press/release pairs on a wheel button.  Single
 * enqueue runs the loop in one chain step to avoid microtask spam when
 * scrolling large amounts.  Matches libXtst's XTestFakeButtonEvent loop.
 */
function xprotoScroll(amount: number, negBtn: number, posBtn: number): void {
  const repeat = Math.abs(amount);
  if (repeat === 0) return;
  const button = amount < 0 ? negBtn : posBtn;
  enqueue(async (c) => {
    for (let i = 0; i < repeat; i++) {
      await c.fakeButtonPress(button);
      await c.fakeButtonRelease(button);
    }
  });
}

export function xprotoScrollV(amount: number): void {
  xprotoScroll(amount, X_BTN_WHEEL_DOWN, X_BTN_WHEEL_UP);
}

export function xprotoScrollH(amount: number): void {
  xprotoScroll(amount, X_BTN_WHEEL_LEFT, X_BTN_WHEEL_RIGHT);
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
    return zpixmapToArgb(reply.data, w, h);
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

function zpixmapToArgb(src: Buffer, w: number, h: number): Uint32Array {
  // 32-bit ZPixmap on TrueColor BGRX/BGRA visuals (every X server we
  // target): each source u32 is 0x00RRGGBB (LE), matching our canonical
  // ARGB once alpha is forced to 0xFF.  No row padding at 32bpp.
  const n = w * h;
  const srcU32 = new Uint32Array(src.buffer, src.byteOffset, n);
  const pixels = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    pixels[i] = (0xFF000000 | (srcU32[i] & 0x00FFFFFF)) >>> 0;
  }
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
