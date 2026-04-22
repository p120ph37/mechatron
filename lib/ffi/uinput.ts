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
 * BTN_LEFT/RIGHT/MIDDLE/SIDE/EXTRA), EV_REL (X, Y, WHEEL, HWHEEL),
 * EV_ABS (X, Y — emulated digitizer, 0–65535 range), and EV_SYN.
 * That's sufficient for the full Keyboard/Mouse public API.
 * Mouse.setPos uses EV_ABS (emulated digitizer) for absolute positioning;
 * Mouse.getPos reads from X11 since uinput is write-only.
 *
 * Falls back cleanly on non-Linux, non-Bun, or uinput-unavailable
 * systems: `getUinputDevice()` returns null and the caller reverts to
 * the XTest path (see lib/ffi/keyboard.ts / mouse.ts dispatch).
 */

import { openSync, writeSync, closeSync } from "fs";
import { libc, libcFFI, libcOpenReason, O_RDWR } from "./libc";
import { getMechanism } from "../platform";
import {
  EV_SYN, EV_KEY, EV_REL, EV_ABS,
  REL_X, REL_Y, REL_WHEEL, REL_HWHEEL,
  ABS_X, ABS_Y,
  UI_DEV_CREATE, UI_DEV_DESTROY, UI_DEV_SETUP,
  UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_RELBIT, UI_SET_ABSBIT, UI_ABS_SETUP,
  encodeEventBurst, encodeUinputSetup, encodeAbsSetup,
  allSupportedEvdevCodes,
  makeInjectKeysym, makeInjectMouseButton, makeInjectScroll, makeInjectAbsMotion,
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

  for (const ev of [EV_KEY, EV_REL, EV_ABS, EV_SYN]) {
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
  for (const abs of [ABS_X, ABS_Y]) {
    if (ioctl(UI_SET_ABSBIT, abs) < 0) {
      return closeOnErr(`UI_SET_ABSBIT ${abs} failed`);
    }
  }

  // Configure axis ranges: 0–65535 (standard digitizer resolution).
  // The compositor / X input driver maps device coordinates proportionally
  // to screen coordinates based on these declared ranges.
  const ABS_MAX = 65535;
  for (const code of [ABS_X, ABS_Y]) {
    const absBuf = encodeAbsSetup(code, { minimum: 0, maximum: ABS_MAX });
    const absU8 = new Uint8Array(absBuf.buffer, absBuf.byteOffset, absBuf.byteLength);
    const absPtr = _ffi.ptr(absU8);
    if (absPtr == null) return closeOnErr("encodeAbsSetup ptr null");
    if (ioctl(UI_ABS_SETUP, absPtr) < 0) {
      return closeOnErr(`UI_ABS_SETUP ${code} failed`);
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

export const injectKeysym = makeInjectKeysym(emit);
export const injectMouseButton = makeInjectMouseButton(emit);
export const injectScrollV = makeInjectScroll(emit, REL_WHEEL);
export const injectScrollH = makeInjectScroll(emit, REL_HWHEEL);
export const injectAbsMotion = makeInjectAbsMotion(emit);

/** Maximum device coordinate for EV_ABS axes (standard digitizer range). */
export const UINPUT_ABS_MAX = 65535;

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

