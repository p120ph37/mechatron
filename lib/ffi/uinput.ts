/**
 * Bun-FFI layer for Linux `/dev/uinput`.
 *
 * The uinput device-create path requires `ioctl(2)`, which `node:fs`
 * doesn't expose.  This file bridges the gap by dlopening libc and
 * calling `ioctl` directly, while keeping the fd open/close and the
 * `write(struct input_event)` fast-path in pure `node:fs` — both of
 * those work fine against `/dev/uinput`.
 *
 * Lifetime model: a single uinput device per process.  Creating /
 * destroying uinput devices involves udev round-trips that compositors
 * have to process; we do it once at first use (lazy) and tear it down
 * on an explicit `closeUinputDevice()` or process exit.
 *
 * The device we expose advertises EV_KEY (all mechatron-public keysyms +
 * BTN_LEFT/RIGHT/MIDDLE/SIDE/EXTRA), EV_REL (X, Y, WHEEL, HWHEEL), and
 * EV_SYN.  That's sufficient for the full Keyboard/Mouse public API
 * except absolute positioning (`Mouse.setPos`), which stays on the
 * XTest path — uinput can't teleport the X cursor without also
 * implementing EV_ABS + compositor-side pointer-acceleration bypass.
 *
 * Falls back cleanly on non-Linux, non-Bun, or uinput-unavailable
 * systems: `getUinputDevice()` returns null and the caller reverts to
 * the XTest path (see lib/ffi/keyboard.ts / mouse.ts dispatch).
 */

import { openSync, writeSync, closeSync } from "fs";
import { libc, libcFFI, libcOpenReason, O_RDWR } from "./libc";
import { getMechanism } from "../platform";
import {
  BUTTON_LEFT as BTN_IDX_LEFT, BUTTON_MID as BTN_IDX_MID,
  BUTTON_RIGHT as BTN_IDX_RIGHT, BUTTON_X1 as BTN_IDX_X1, BUTTON_X2 as BTN_IDX_X2,
} from "../mouse/constants";
import {
  EV_SYN, EV_KEY, EV_REL,
  REL_X, REL_Y, REL_WHEEL, REL_HWHEEL,
  BTN_LEFT, BTN_RIGHT, BTN_MIDDLE, BTN_SIDE, BTN_EXTRA,
  UI_DEV_CREATE, UI_DEV_DESTROY, UI_DEV_SETUP,
  UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_RELBIT,
  encodeEventBurst, encodeUinputSetup,
  allSupportedEvdevCodes, mapKeysymToKeycode,
  type UInputEvent,
} from "../input/uinput";

// =============================================================================
// Device lifecycle
// =============================================================================

export interface UInputDevice {
  fd: number;
  close(): void;
}

let _device: UInputDevice | null = null;
let _openAttempted = false;
let _openReason: string | null = null;

/**
 * Open `/dev/uinput`, configure capability bits, submit the setup struct,
 * and issue `UI_DEV_CREATE`.  Cached at module scope — call
 * `closeUinputDevice()` to tear down.
 *
 * Returns null (and sets a diagnostic string readable via
 * `uinputOpenReason()`) on any failure: libc unavailable, device missing
 * or not writable, ioctl error, etc.
 */
export function getUinputDevice(): UInputDevice | null {
  if (_device) return _device;
  if (_openAttempted) return null;
  _openAttempted = true;

  if (process.platform !== "linux") {
    _openReason = "not Linux";
    return null;
  }
  const _libc = libc();
  const _ffi = libcFFI();
  if (!_libc || !_ffi) {
    _openReason = "libc unavailable: " + (libcOpenReason() || "unknown");
    return null;
  }

  let fd: number;
  try {
    fd = openSync("/dev/uinput", O_RDWR);
  } catch (e) {
    _openReason = "open(/dev/uinput): " + ((e as Error).message || String(e));
    return null;
  }

  const closeOnErr = (reason: string): null => {
    _openReason = reason;
    try { closeSync(fd); } catch { /* ignore */ }
    return null;
  };

  const ioctl = (req: number, arg: number | bigint): number => {
    return _libc!.ioctl(fd, BigInt(req), typeof arg === "bigint" ? arg : BigInt(arg));
  };

  for (const ev of [EV_KEY, EV_REL, EV_SYN]) {
    if (ioctl(UI_SET_EVBIT, ev) < 0) {
      return closeOnErr(`UI_SET_EVBIT ${ev} failed`);
    }
  }
  for (const code of allSupportedEvdevCodes()) {
    if (ioctl(UI_SET_KEYBIT, code) < 0) {
      return closeOnErr(`UI_SET_KEYBIT ${code} failed`);
    }
  }
  for (const rel of [REL_X, REL_Y, REL_WHEEL, REL_HWHEEL]) {
    if (ioctl(UI_SET_RELBIT, rel) < 0) {
      return closeOnErr(`UI_SET_RELBIT ${rel} failed`);
    }
  }

  const setupBuf = encodeUinputSetup("mechatron virtual input");
  const setupU8 = new Uint8Array(setupBuf.buffer, setupBuf.byteOffset, setupBuf.byteLength);
  const setupPtr = _ffi.ptr(setupU8);
  if (setupPtr == null) return closeOnErr("encodeUinputSetup ptr null");
  if (ioctl(UI_DEV_SETUP, setupPtr) < 0) {
    return closeOnErr("UI_DEV_SETUP failed");
  }

  if (ioctl(UI_DEV_CREATE, 0n) < 0) {
    return closeOnErr("UI_DEV_CREATE failed");
  }

  _device = {
    fd,
    close(): void {
      ioctl(UI_DEV_DESTROY, 0n);
      try { closeSync(fd); } catch { /* ignore */ }
      _device = null;
    },
  };
  return _device;
}

/** Diagnostic: why did the last `getUinputDevice()` fail? */
export function uinputOpenReason(): string | null {
  return _openReason;
}

/** Tear down the cached device (called from tests + process exit). */
export function closeUinputDevice(): void {
  if (_device) _device.close();
}

// Best-effort auto-teardown on process exit so we don't leak virtual
// input devices across test runs.  Only registered on Linux — other
// platforms never open the device, so there's nothing to clean up.
if (process.platform === "linux" && typeof process.on === "function") {
  process.on("exit", () => {
    if (_device) {
      try { _device.close(); } catch { /* ignore */ }
    }
  });
}

// =============================================================================
// Event-emission helpers
// =============================================================================

// Write a batch of events plus a trailing `SYN_REPORT` so the kernel
// commits them as a single input frame.  Returns true on success, false
// if the write failed (device was torn down mid-call, EAGAIN, etc.).
function writeEvents(fd: number, events: UInputEvent[]): boolean {
  try {
    const buf = encodeEventBurst(events);
    writeSync(fd, buf, 0, buf.length);
    return true;
  } catch {
    return false;
  }
}

function emit(events: UInputEvent[]): boolean {
  const dev = getUinputDevice();
  return dev ? writeEvents(dev.fd, events) : false;
}

/**
 * Press or release a mechatron KEYS.* keysym via uinput.  Returns true
 * when the keysym mapped to a valid evdev code and the write succeeded,
 * false when the keysym is unknown to the mapping (caller's responsibility
 * to fall back — the dispatcher in keyboard.ts routes unknown keys to
 * XTest if available).
 */
export function injectKeysym(keysym: number, press: boolean): boolean {
  const code = mapKeysymToKeycode(keysym);
  if (code === 0) return false;
  return emit([{ type: EV_KEY, code, value: press ? 1 : 0 }]);
}

/**
 * Press or release a mouse button.  `button` is 0=Left, 1=Middle,
 * 2=Right, 3=Back/X1, 4=Forward/X2 (matches mechatron BUTTON_* values).
 */
export function injectMouseButton(button: number, press: boolean): boolean {
  let code: number;
  switch (button) {
    case BTN_IDX_LEFT:  code = BTN_LEFT; break;
    case BTN_IDX_MID:   code = BTN_MIDDLE; break;
    case BTN_IDX_RIGHT: code = BTN_RIGHT; break;
    case BTN_IDX_X1:    code = BTN_SIDE; break;
    case BTN_IDX_X2:    code = BTN_EXTRA; break;
    default: return false;
  }
  return emit([{ type: EV_KEY, code, value: press ? 1 : 0 }]);
}

/**
 * Vertical scroll.  evdev `REL_WHEEL` expresses discrete notches, not
 * pixels — a value of 1 is "one notch up" which the compositor then
 * maps to pixels via its own scroll acceleration curves.  mechatron's
 * public scroll* API is discrete notches too, so a straight pass-through
 * is correct.  Zero-amount is an inert success — skip the device-open
 * trigger entirely.
 */
export function injectScrollV(amount: number): boolean {
  if (amount === 0) return true;
  return emit([{ type: EV_REL, code: REL_WHEEL, value: amount }]);
}

/** Horizontal scroll — same discrete-notches semantics as `injectScrollV`. */
export function injectScrollH(amount: number): boolean {
  if (amount === 0) return true;
  return emit([{ type: EV_REL, code: REL_HWHEEL, value: amount }]);
}

/**
 * Is the uinput path fully operational?  True when the module has
 * successfully opened, set up, and created the virtual device.  Calling
 * this triggers the lazy open, so it's also used by
 * `lib/platform/mechanisms.ts` (via a cheap indirection) to confirm the
 * selection choice is viable before the first event fires.
 */
export function uinputReady(): boolean {
  return getUinputDevice() !== null;
}

/**
 * Is uinput the selected input mechanism AND is the device live?  The
 * short-circuit avoids the lazy open when the mechanism isn't uinput.
 * Callers in keyboard/mouse dispatch use this as the gate for routing
 * events through uinput instead of XTest.
 */
export function uinputSelected(): boolean {
  return getMechanism("input") === "uinput" && uinputReady();
}

