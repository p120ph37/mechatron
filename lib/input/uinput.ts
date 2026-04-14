/**
 * Linux uinput input-injection fallback.
 *
 * When the host doesn't have XTest (libXtst missing or extension disabled),
 * or we're on Wayland where synthetic X events never reach the compositor,
 * we can still synthesise keyboard / mouse events by writing to a virtual
 * input device via `/dev/uinput`:
 *
 *   1. open `/dev/uinput` (RW)
 *   2. ioctl(UI_SET_EVBIT, EV_KEY / EV_REL / EV_SYN)
 *   3. ioctl(UI_SET_KEYBIT, <every keycode we might emit>)
 *   4. ioctl(UI_SET_RELBIT, REL_X / REL_Y / REL_WHEEL / REL_HWHEEL)
 *   5. write(uinput_user_dev { name, id: {bustype, vendor, product, version} })
 *   6. ioctl(UI_DEV_CREATE)
 *   7. for each event, write `struct input_event { sec, usec, type, code, value }`
 *      followed by a `SYN_REPORT` to commit.
 *   8. ioctl(UI_DEV_DESTROY) on shutdown.
 *
 * The kernel then creates a regular `/dev/input/eventN` node that the
 * display server (X11, Wayland, or a headless evdev consumer) picks up
 * as a real keyboard/mouse.  Synthesised events go through the normal
 * input-device pipeline — including the compositor's grab detection —
 * so this works where XTest doesn't.
 *
 * Access requirements: `/dev/uinput` is root-only by default.  The
 * portable way to grant non-root access is a udev rule:
 *
 *     KERNEL=="uinput", MODE="0660", GROUP="input"
 *
 * …plus the running user in the `input` group.  The mechanism probe
 * reports `requiresElevatedPrivileges: true` when `/dev/uinput` exists
 * but isn't writable, so callers can surface the need for elevated
 * privileges up front rather than failing silently at call time.
 *
 * This file is a *skeleton* — probe + selection wiring are complete, the
 * actual write path is scaffolded so the existing NAPI / FFI backends
 * can be left untouched while the uinput mechanism matures.  A full
 * implementation will live partly here (ioctl layout, keycode mapping)
 * and partly in the napi `keyboard`/`mouse` crates (the raw fd handling
 * and event writes that need to be fast-path).  See PLAN.md §6c.
 */

import { openSync, writeSync, closeSync, existsSync } from "fs";

// evdev event types / codes (selected subset from <linux/input-event-codes.h>).
export const EV_SYN = 0x00;
export const EV_KEY = 0x01;
export const EV_REL = 0x02;

export const SYN_REPORT = 0;

export const REL_X      = 0x00;
export const REL_Y      = 0x01;
export const REL_WHEEL  = 0x08;
export const REL_HWHEEL = 0x06;

// uinput ioctl request numbers — values derived from `_IO` / `_IOW` in
// <linux/uinput.h>.  Only the handful we care about are listed; expand
// as the mechanism grows.
//
// _IOC(dir, type, nr, size) where type='U' (0x55); direction flags
// align to the kernel's `_IOC_NONE`=0, `_IOC_WRITE`=1 conventions on
// every Linux arch we target (x86_64, aarch64, arm).  These literal
// values match what <linux/uinput.h> expands to.
export const UI_DEV_CREATE  = 0x5501;
export const UI_DEV_DESTROY = 0x5502;
// UI_SET_EVBIT/KEYBIT/RELBIT are `_IOW('U', 100|101|102, int)`.
export const UI_SET_EVBIT   = 0x40045564;
export const UI_SET_KEYBIT  = 0x40045565;
export const UI_SET_RELBIT  = 0x40045566;

export interface UInputDevice {
  fd: number;
  close(): void;
}

/**
 * Open `/dev/uinput` and prepare a virtual input device.  The actual
 * device-creation ioctls live in the native layer (napi backend's
 * `keyboard` / `mouse` crates) because `node:fs` doesn't expose ioctl.
 *
 * This TS-side helper is used by:
 *   - mechanism probing (is /dev/uinput writable?);
 *   - diagnostic output (the `reason` strings in MechanismInfo);
 *   - planned `Platform.checkUinput()` convenience wrapper that
 *     emits a clear actionable error if the fd can't be opened.
 */
export function openUinputForProbe(): { ok: boolean; reason?: string } {
  if (!existsSync("/dev/uinput")) {
    return { ok: false, reason: "/dev/uinput not present" };
  }
  let fd: number;
  try {
    fd = openSync("/dev/uinput", 0x0002 /* O_RDWR */);
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message || "open failed" };
  }
  try {
    return { ok: true };
  } finally {
    closeSync(fd);
  }
}

/**
 * Low-level write helper: emit a `struct input_event` (24 bytes on a
 * 64-bit kernel — seconds:i64, microseconds:i64, type:u16, code:u16,
 * value:i32).  The `input_event` layout changed to the 64-bit-time
 * variant in Linux 5.1 (commit 152194fe); every Linux version we
 * support is post that transition.
 */
export function writeInputEvent(
  fd: number, type: number, code: number, value: number,
): void {
  const buf = Buffer.alloc(24);
  // tv_sec (i64)     @ 0
  // tv_usec (i64)    @ 8
  // type (u16)       @ 16
  // code (u16)       @ 18
  // value (i32)      @ 20
  const now = Date.now();
  buf.writeBigInt64LE(BigInt(Math.floor(now / 1000)), 0);
  buf.writeBigInt64LE(BigInt((now % 1000) * 1000), 8);
  buf.writeUInt16LE(type & 0xFFFF, 16);
  buf.writeUInt16LE(code & 0xFFFF, 18);
  buf.writeInt32LE(value | 0, 20);
  writeSync(fd, buf, 0, 24);
}

/**
 * Submit a burst of events followed by a SYN_REPORT so the kernel
 * commits them as a single input update.  Callers batch related events
 * (e.g. press+release for a click, or dx+dy for a diagonal motion).
 */
export function syncReport(fd: number): void {
  writeInputEvent(fd, EV_SYN, SYN_REPORT, 0);
}

/**
 * Stub: uinput-based keyboard press.  Full implementation requires:
 *   - a UInputDevice cached at module scope (creates/destroys are
 *     expensive; compositors also dedup based on (bustype,vendor,
 *     product,version), so we pick a stable quartet);
 *   - mapping from our KEYS.* keysym table to Linux evdev keycodes
 *     (EV_KEY codes: KEY_A=30, KEY_1=2, …).  The table lives in the
 *     existing `lib/keyboard/constants.ts` once the Linux mapping
 *     column is added.
 *
 * Until both land, this path falls back to the native backend by
 * returning `false` from `uinputAvailable()`.
 */
export function uinputAvailable(): boolean {
  // The full device-create path isn't wired yet (see PLAN.md §6c).
  // Returning false here means the mechanism is reported as available
  // only for probe/diagnostic purposes; attempts to use it for real
  // input injection transparently fall back to the primary (XTest).
  return false;
}
