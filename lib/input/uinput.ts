/**
 * Linux uinput input-injection fallback.
 *
 * When the host doesn't have XTest (libXtst missing or extension disabled),
 * or we're on Wayland where synthetic X events never reach the compositor,
 * we can still synthesise keyboard / mouse events by writing to a virtual
 * input device via `/dev/uinput`:
 *
 *   1. `open("/dev/uinput", O_RDWR)`
 *   2. `ioctl(UI_SET_EVBIT, EV_KEY | EV_REL | EV_SYN)`
 *   3. `ioctl(UI_SET_KEYBIT, <each keycode we might emit>)`
 *   4. `ioctl(UI_SET_RELBIT, REL_X | REL_Y | REL_WHEEL | REL_HWHEEL)`
 *   5. `ioctl(UI_DEV_SETUP, &uinput_setup)` (Linux ≥ 4.5; simpler than the
 *      legacy `write(uinput_user_dev)` path — 92 bytes vs 1116)
 *   6. `ioctl(UI_DEV_CREATE)`
 *   7. For each event `write(struct input_event{sec,usec,type,code,value})`
 *      followed by a `SYN_REPORT` to commit.
 *   8. `ioctl(UI_DEV_DESTROY)` + close on shutdown.
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
 * This file holds the **pure-TS half** of the implementation: event and
 * setup-struct buffer encoding, plus the X11-keysym → evdev-keycode
 * mapping table.  The ioctl / open / write fd plumbing lives in
 * `lib/ffi/uinput.ts` (bun:ffi) because Node's `fs` APIs don't expose
 * `ioctl(2)`.  Splitting it this way keeps the encoding layer unit-
 * testable without touching `/dev/uinput`, which is both privilege-
 * gated and impossible to mock portably.
 */

import { openSync, closeSync } from "fs";

// =============================================================================
// evdev event types / codes (subset of <linux/input-event-codes.h>)
// =============================================================================

export const EV_SYN = 0x00;
export const EV_KEY = 0x01;
export const EV_REL = 0x02;

export const SYN_REPORT = 0;

// O_RDWR for the open(2) flags arg used by openUinputForProbe below.
// Linux defines it as 2 unconditionally on every arch.  The FFI layer
// imports its own copy from lib/ffi/libc.
const O_RDWR = 0x0002;

export const REL_X      = 0x00;
export const REL_Y      = 0x01;
export const REL_HWHEEL = 0x06;
export const REL_WHEEL  = 0x08;

// Mouse buttons — evdev codes from <linux/input-event-codes.h> BTN_MOUSE block.
export const BTN_LEFT   = 0x110;
export const BTN_RIGHT  = 0x111;
export const BTN_MIDDLE = 0x112;
export const BTN_SIDE   = 0x113;
export const BTN_EXTRA  = 0x114;

// =============================================================================
// uinput ioctl request numbers (from <linux/uinput.h>)
//
// `_IO('U', nr)`        → (0 << 30) | (0 << 16) | ('U' << 8) | nr = 0x00005500 | nr
// `_IOW('U', nr, int)`  → (1 << 30) | (4 << 16) | ('U' << 8) | nr = 0x40045500 | nr
// `_IOW('U', nr, uinput_setup)` → (1 << 30) | (92 << 16) | ('U' << 8) | nr
//
// Every Linux arch we target (x86_64, aarch64, arm, riscv64) uses these
// identical encodings.  alpha/mips/powerpc/sparc have different _IOC_SIZEBITS
// layouts but are not in our supported set.
// =============================================================================

export const UI_DEV_CREATE   = 0x5501;   // _IO('U', 1)
export const UI_DEV_DESTROY  = 0x5502;   // _IO('U', 2)
export const UI_SET_EVBIT    = 0x40045564; // _IOW('U', 100, int)
export const UI_SET_KEYBIT   = 0x40045565; // _IOW('U', 101, int)
export const UI_SET_RELBIT   = 0x40045566; // _IOW('U', 102, int)
// UI_DEV_SETUP takes a uinput_setup struct (92 bytes): _IOW('U', 3, uinput_setup)
// = (1 << 30) | (92 << 16) | (0x55 << 8) | 3 = 0x405c5503
export const UI_DEV_SETUP    = 0x405c5503;

// Bus types (from <linux/input.h>) — BUS_VIRTUAL avoids collisions with
// real USB/PS/2 hardware IDs on the compositor side.
export const BUS_VIRTUAL = 0x06;

// =============================================================================
// X11 keysym → Linux evdev keycode mapping.
//
// mechatron's platform-independent KEYS.* table on Linux holds X11 keysym
// values (see lib/keyboard/constants.ts's linuxKeys map).  Translating to
// uinput requires a second lookup: X11 keysym → evdev KEY_* code.
//
// Values below are the kernel's `KEY_A` / `KEY_1` / etc. from
// <linux/input-event-codes.h>.  We only list the entries in mechatron's
// public KEYS.* surface (constants.ts's KeyTable interface); unknown
// keysyms fall back to `mapKeysymToKeycode()` returning 0, which the
// caller should skip.
// =============================================================================

export const KEYSYM_TO_EVDEV: Record<number, number> = {
  // Letters (X11 lowercase latin keysyms = ASCII)
  0x0061: 30, 0x0062: 48, 0x0063: 46, 0x0064: 32, 0x0065: 18, // a-e
  0x0066: 33, 0x0067: 34, 0x0068: 35, 0x0069: 23, 0x006A: 36, // f-j
  0x006B: 37, 0x006C: 38, 0x006D: 50, 0x006E: 49, 0x006F: 24, // k-o
  0x0070: 25, 0x0071: 16, 0x0072: 19, 0x0073: 31, 0x0074: 20, // p-t
  0x0075: 22, 0x0076: 47, 0x0077: 17, 0x0078: 45, 0x0079: 21, // u-y
  0x007A: 44,                                                  // z
  // Digits (row above letters)
  0x0030: 11, 0x0031: 2,  0x0032: 3,  0x0033: 4,  0x0034: 5,  // 0-4
  0x0035: 6,  0x0036: 7,  0x0037: 8,  0x0038: 9,  0x0039: 10, // 5-9
  // Punctuation
  0x0020: 57, // space
  0x0060: 41, // grave `
  0x002D: 12, // minus -
  0x003D: 13, // equal =
  0x005B: 26, // [
  0x005D: 27, // ]
  0x005C: 43, // backslash
  0x003B: 39, // ;
  0x0027: 40, // '
  0x002C: 51, // ,
  0x002E: 52, // .
  0x002F: 53, // /
  // Navigation / editing (X11 0xFF keysyms)
  0xFF08: 14,  // BackSpace
  0xFF09: 15,  // Tab
  0xFF0D: 28,  // Return
  0xFF13: 119, // Pause
  0xFF14: 70,  // Scroll_Lock
  0xFF1B: 1,   // Escape
  0xFF50: 102, // Home
  0xFF51: 105, // Left
  0xFF52: 103, // Up
  0xFF53: 106, // Right
  0xFF54: 108, // Down
  0xFF55: 104, // Prior (Page_Up)
  0xFF56: 109, // Next (Page_Down)
  0xFF57: 107, // End
  0xFF61: 99,  // Print
  0xFF63: 110, // Insert
  0xFFFF: 111, // Delete
  // Function keys
  0xFFBE: 59, 0xFFBF: 60, 0xFFC0: 61, 0xFFC1: 62, // F1-F4
  0xFFC2: 63, 0xFFC3: 64, 0xFFC4: 65, 0xFFC5: 66, // F5-F8
  0xFFC6: 67, 0xFFC7: 68, 0xFFC8: 87, 0xFFC9: 88, // F9-F12
  // Numpad
  0xFFAB: 78,  // KP_Add (+)
  0xFFAD: 74,  // KP_Subtract (-)
  0xFFAA: 55,  // KP_Multiply (*)
  0xFFAF: 98,  // KP_Divide (/)
  0xFFAE: 83,  // KP_Decimal (.)
  0xFF8D: 96,  // KP_Enter
  0xFFB0: 82, 0xFFB1: 79, 0xFFB2: 80, 0xFFB3: 81, 0xFFB4: 75, // KP_0-4
  0xFFB5: 76, 0xFFB6: 77, 0xFFB7: 71, 0xFFB8: 72, 0xFFB9: 73, // KP_5-9
  // Modifiers
  0xFFE1: 42,  // Shift_L
  0xFFE2: 54,  // Shift_R
  0xFFE3: 29,  // Control_L
  0xFFE4: 97,  // Control_R
  0xFFE5: 58,  // Caps_Lock
  0xFF7F: 69,  // Num_Lock
  0xFFE9: 56,  // Alt_L
  0xFFEA: 100, // Alt_R
  0xFFEB: 125, // Super_L (LeftMeta)
  0xFFEC: 126, // Super_R (RightMeta)
};

/**
 * Translate an X11 keysym (as stored in mechatron's platform-independent
 * `KEYS.*` table on Linux) to a Linux evdev keycode.  Returns 0 when no
 * mapping exists — callers should skip un-mappable events rather than
 * emitting a KEY_RESERVED (evdev code 0), which would be an actual event
 * the kernel would happily deliver.
 */
export function mapKeysymToKeycode(keysym: number): number {
  return KEYSYM_TO_EVDEV[keysym] || 0;
}

/**
 * All evdev keycodes that this module might ever emit — registered once at
 * device-create time via UI_SET_KEYBIT.  Includes the BTN_* mouse buttons
 * so a single uinput device can multiplex keyboard + mouse, which is
 * simpler than managing two devices (compositors expose both as a single
 * pair of evdev nodes that way too).
 */
export function allSupportedEvdevCodes(): number[] {
  const keys = Object.values(KEYSYM_TO_EVDEV);
  const buttons = [BTN_LEFT, BTN_RIGHT, BTN_MIDDLE, BTN_SIDE, BTN_EXTRA];
  return Array.from(new Set([...keys, ...buttons])).sort((a, b) => a - b);
}

// =============================================================================
// Pure buffer encoders (testable without a real uinput fd)
// =============================================================================

/**
 * Encode a `struct input_event` (24 bytes on a 64-bit kernel —
 * `seconds:i64`, `microseconds:i64`, `type:u16`, `code:u16`, `value:i32`).
 *
 * The `input_event` layout changed to the 64-bit-time variant in Linux 5.1
 * (commit 152194fe1400); every Linux version we support is post that
 * transition.  On 32-bit arches the kernel's compat layer re-expands
 * userspace's 64-bit layout, so the same encoding works there too.
 *
 * `timestampMs` defaults to `Date.now()`.  Passing an explicit value makes
 * this function deterministic for unit tests.
 */
export function encodeInputEvent(
  type: number, code: number, value: number,
  timestampMs: number = Date.now(),
): Buffer {
  // Layout: tv_sec@0, tv_usec@8, type@16, code@18, value@20.  All 24
  // bytes are assigned, so allocUnsafe (no zero-fill) is safe.
  const buf = Buffer.allocUnsafe(24);
  buf.writeBigInt64LE(BigInt(Math.floor(timestampMs / 1000)), 0);
  buf.writeBigInt64LE(BigInt((timestampMs % 1000) * 1000), 8);
  buf.writeUInt16LE(type & 0xFFFF, 16);
  buf.writeUInt16LE(code & 0xFFFF, 18);
  buf.writeInt32LE(value | 0, 20);
  return buf;
}

/**
 * Encode a `struct uinput_setup` (92 bytes, Linux ≥ 4.5) for the
 * `UI_DEV_SETUP` ioctl.  Layout:
 *
 *   struct input_id {
 *     __u16 bustype;
 *     __u16 vendor;
 *     __u16 product;
 *     __u16 version;
 *   };                        // 8 bytes
 *   struct uinput_setup {
 *     struct input_id id;     // 8
 *     char name[80];          // 8+80 = 88
 *     __u32 ff_effects_max;   // 88+4 = 92
 *   };
 *
 * `name` is padded with NUL bytes to 80 bytes; over-length names are
 * silently truncated to fit with a trailing NUL.  We pick `BUS_VIRTUAL`
 * + an arbitrary-but-stable vendor/product quartet so a long-running
 * application doesn't register as a different device on each restart.
 */
export function encodeUinputSetup(
  name: string,
  opts: { bustype?: number; vendor?: number; product?: number; version?: number; ffEffectsMax?: number } = {},
): Buffer {
  const buf = Buffer.alloc(92);
  buf.writeUInt16LE((opts.bustype ?? BUS_VIRTUAL) & 0xFFFF, 0);
  buf.writeUInt16LE((opts.vendor ?? 0x1209) & 0xFFFF, 2);   // 0x1209 = pid.codes block
  buf.writeUInt16LE((opts.product ?? 0x7070) & 0xFFFF, 4);  // arbitrary stable product
  buf.writeUInt16LE((opts.version ?? 1) & 0xFFFF, 6);
  const nameBytes = Buffer.from(name, "utf8");
  const nameLen = Math.min(nameBytes.length, 79); // leave 1 for NUL
  nameBytes.copy(buf, 8, 0, nameLen);
  // bytes 8+nameLen .. 88 are already zero-filled by Buffer.alloc.
  buf.writeUInt32LE((opts.ffEffectsMax ?? 0) >>> 0, 88);
  return buf;
}

/**
 * Encode an event burst: the given events followed by a `SYN_REPORT`.
 *
 * Callers batch related events (press+release for a click, dx+dy for
 * diagonal motion) into a single burst so the kernel commits them as
 * one input update — a "frame" in evdev parlance.  Without the trailing
 * SYN_REPORT the kernel buffers indefinitely.
 *
 * The whole burst is packed into a single `Buffer.alloc` with the
 * timestamp BigInts hoisted out of the per-event loop — typical press/
 * release bursts are on the hot path, and the naive
 * "alloc-per-event + Buffer.concat" is measurably wasteful there.
 */
export interface UInputEvent {
  type: number;
  code: number;
  value: number;
}
export function encodeEventBurst(
  events: UInputEvent[],
  timestampMs: number = Date.now(),
): Buffer {
  const total = (events.length + 1) * 24;
  // Every byte is written (24 × (events + SYN)), so allocUnsafe is safe.
  const buf = Buffer.allocUnsafe(total);
  const secBig = BigInt(Math.floor(timestampMs / 1000));
  const usecBig = BigInt((timestampMs % 1000) * 1000);
  const writeAt = (off: number, type: number, code: number, value: number) => {
    buf.writeBigInt64LE(secBig, off);
    buf.writeBigInt64LE(usecBig, off + 8);
    buf.writeUInt16LE(type & 0xFFFF, off + 16);
    buf.writeUInt16LE(code & 0xFFFF, off + 18);
    buf.writeInt32LE(value | 0, off + 20);
  };
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    writeAt(i * 24, e.type, e.code, e.value);
  }
  writeAt(events.length * 24, EV_SYN, SYN_REPORT, 0);
  return buf;
}

// =============================================================================
// Shared inject helpers (used by both ffi/uinput.ts and nolib/uinput.ts)
// =============================================================================

import {
  BUTTON_LEFT as BTN_IDX_LEFT, BUTTON_MID as BTN_IDX_MID,
  BUTTON_RIGHT as BTN_IDX_RIGHT, BUTTON_X1 as BTN_IDX_X1, BUTTON_X2 as BTN_IDX_X2,
} from "../mouse/constants";

type Emitter = (events: UInputEvent[]) => boolean;

export function makeInjectKeysym(emit: Emitter) {
  return (keysym: number, press: boolean): boolean => {
    const code = mapKeysymToKeycode(keysym);
    if (code === 0) return false;
    return emit([{ type: EV_KEY, code, value: press ? 1 : 0 }]);
  };
}

export function makeInjectMouseButton(emit: Emitter) {
  return (button: number, press: boolean): boolean => {
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
  };
}

export function makeInjectScroll(emit: Emitter, axis: number) {
  return (amount: number): boolean => {
    if (amount === 0) return true;
    return emit([{ type: EV_REL, code: axis, value: amount }]);
  };
}

export function makeInjectRelMotion(emit: Emitter) {
  return (dx: number, dy: number): boolean => {
    const events: UInputEvent[] = [];
    if (dx !== 0) events.push({ type: EV_REL, code: REL_X, value: dx });
    if (dy !== 0) events.push({ type: EV_REL, code: REL_Y, value: dy });
    if (events.length === 0) return true;
    return emit(events);
  };
}

// =============================================================================
// Probe / availability
// =============================================================================

/**
 * Cheap probe: can we open `/dev/uinput` at all?  Used by
 * `lib/platform/mechanisms.ts` for diagnostic output and by test harnesses
 * to decide whether to skip the uinput integration tests.
 */
export function openUinputForProbe(): { ok: boolean; reason?: string } {
  let fd: number;
  try {
    fd = openSync("/dev/uinput", O_RDWR);
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
 * Is the uinput write path plausibly operational on this host?  A cheap
 * synchronous probe that only checks whether `/dev/uinput` exists and is
 * writable by the current process — it does **not** create a virtual
 * device (that requires `UI_DEV_CREATE`, which belongs to the FFI layer).
 *
 * Callers that need an authoritative "is the device actually live" answer
 * should use `lib/ffi/uinput.ts`'s `uinputReady()`, which triggers the
 * full open + ioctl + create dance (and caches the result).
 *
 * Returning `false` here (e.g. on non-Linux, when the device is missing,
 * or when the current uid lacks write permission) tells mechanism
 * dispatch that this host can't even begin to synthesise uinput events,
 * so it shouldn't bother loading the FFI layer.
 */
export function uinputAvailable(): boolean {
  return openUinputForProbe().ok;
}
