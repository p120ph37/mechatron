/**
 * Pure-TS X11 request encoders and reply parsers.
 *
 * Every X11 request shares the same 4-byte header:
 *
 *   byte 0:  major opcode
 *   byte 1:  opcode-specific byte (minor opcode for extensions, a
 *            flags byte for some core requests, or just 0)
 *   byte 2:  request length LO  (CARD16 LE)
 *   byte 3:  request length HI  (CARD16 LE)
 *
 * `length` is in 4-byte units and **includes** the header, so a
 * bare-header request has length=1 (4 bytes).
 *
 * Replies always start with:
 *   byte 0:  1  (distinguishes from events = 2..34 and errors = 0)
 *   byte 1:  opcode-specific
 *   bytes 2-4: sequence number (u16 LE)
 *   bytes 4-8: reply length — CARD32 in 4-byte units *beyond* the
 *              fixed 32-byte reply header (so 0 for small replies).
 *   bytes 8-32: opcode-specific
 *   bytes 32+: opcode-specific, length controlled by the field above
 *
 * Errors are always 32 bytes and look like:
 *   byte 0:  0  (Error)
 *   byte 1:  error code
 *   bytes 2-4: sequence number
 *   bytes 4-8: bad-value / bad-resource-id
 *   bytes 8-10: minor-opcode
 *   byte 10: major-opcode
 *   bytes 11-32: unused
 *
 * Only the pure buffer-shaping is here; the async dispatch layer
 * (sequence-number → pending promise, socket read loop) lives in
 * `lib/x11proto/conn.ts`.
 */

import { pad4 } from "./wire";

// =============================================================================
// Core opcodes we use
// =============================================================================

export const OP_QUERY_EXTENSION = 98;
export const OP_WARP_POINTER = 41;
export const OP_GET_IMAGE = 73;

// XTEST extension minor opcodes (we only ever send FakeInput).
export const XTEST_MINOR_FAKE_INPUT = 2;

// XTestFakeInput event types (mirror core X event codes).
export const XTEST_TYPE_KEY_PRESS = 2;
export const XTEST_TYPE_KEY_RELEASE = 3;
export const XTEST_TYPE_BUTTON_PRESS = 4;
export const XTEST_TYPE_BUTTON_RELEASE = 5;
export const XTEST_TYPE_MOTION_NOTIFY = 6;

// Error codes (core, from X11 protocol spec appendix B)
export const ERR_REQUEST = 1;
export const ERR_VALUE = 2;
export const ERR_WINDOW = 3;
export const ERR_PIXMAP = 4;
export const ERR_ATOM = 5;
export const ERR_CURSOR = 6;
export const ERR_FONT = 7;
export const ERR_MATCH = 8;
export const ERR_DRAWABLE = 9;
export const ERR_ACCESS = 10;
export const ERR_ALLOC = 11;
export const ERR_COLORMAP = 12;
export const ERR_GCONTEXT = 13;
export const ERR_IDCHOICE = 14;
export const ERR_NAME = 15;
export const ERR_LENGTH = 16;
export const ERR_IMPLEMENTATION = 17;

// =============================================================================
// Request header helpers
// =============================================================================

/** Write a standard request header into `buf` at offset 0 and return it. */
export function writeRequestHeader(buf: Buffer, major: number, data1: number): Buffer {
  if (buf.length % 4 !== 0) throw new Error("request buffer must be 4-aligned");
  buf.writeUInt8(major, 0);
  buf.writeUInt8(data1 & 0xFF, 1);
  buf.writeUInt16LE(buf.length / 4, 2);
  return buf;
}

// =============================================================================
// QueryExtension (opcode 98)
//
// Wire layout:
//   0   98           major opcode
//   1   0            unused
//   2-4 length       (2 + pad4(n)/4)
//   4-6 n            name length
//   6-8 unused
//   8+  name + pad
//
// Reply (32 bytes, reply-length = 0):
//   0   1            reply
//   1   0            unused
//   2-4 seq          sequence
//   4-8 0            reply length
//   8   present      0/1
//   9   major-opcode (for XTestFakeInput etc.)
//   10  first-event  (for events originated by this extension)
//   11  first-error  (for errors originated by this extension)
//   12-32 unused
// =============================================================================

export function encodeQueryExtension(name: string): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const total = pad4(8 + nameBuf.length);
  const buf = Buffer.alloc(total);
  writeRequestHeader(buf, OP_QUERY_EXTENSION, 0);
  buf.writeUInt16LE(nameBuf.length, 4);
  // bytes 6..8 unused
  nameBuf.copy(buf, 8);
  return buf;
}

export interface QueryExtensionReply {
  present: boolean;
  majorOpcode: number;
  firstEvent: number;
  firstError: number;
}

export function parseQueryExtensionReply(buf: Buffer): QueryExtensionReply {
  if (buf.length < 32) throw new Error("QueryExtension reply too short");
  return {
    present: buf.readUInt8(8) !== 0,
    majorOpcode: buf.readUInt8(9),
    firstEvent: buf.readUInt8(10),
    firstError: buf.readUInt8(11),
  };
}

// =============================================================================
// WarpPointer (core opcode 41)
//
// Wire layout (24 bytes, length = 6):
//   0   41          opcode
//   1   unused
//   2-4 6           length
//   4-8 src-window  WINDOW (None=0 to skip the source rectangle test)
//   8-12 dst-window WINDOW (None=0 to make dst-x/y relative to current pos)
//   12-14 src-x     INT16
//   14-16 src-y     INT16
//   16-18 src-w     CARD16  (0 = "rest of window")
//   18-20 src-h     CARD16
//   20-22 dst-x     INT16
//   22-24 dst-y     INT16
//
// Common case (absolute warp on root): srcWindow=0, dstWindow=root,
// src-rect ignored (0/0/0/0), dst-x/y = absolute root coords.
// =============================================================================

export interface WarpPointerArgs {
  srcWindow?: number;   // default 0 (None)
  dstWindow: number;    // typically root window id
  srcX?: number;
  srcY?: number;
  srcW?: number;
  srcH?: number;
  dstX: number;
  dstY: number;
}

export function encodeWarpPointer(args: WarpPointerArgs): Buffer {
  const buf = Buffer.alloc(24);
  writeRequestHeader(buf, OP_WARP_POINTER, 0);
  buf.writeUInt32LE((args.srcWindow ?? 0) >>> 0, 4);
  buf.writeUInt32LE(args.dstWindow >>> 0, 8);
  buf.writeInt16LE((args.srcX ?? 0) | 0, 12);
  buf.writeInt16LE((args.srcY ?? 0) | 0, 14);
  buf.writeUInt16LE((args.srcW ?? 0) & 0xFFFF, 16);
  buf.writeUInt16LE((args.srcH ?? 0) & 0xFFFF, 18);
  buf.writeInt16LE(args.dstX | 0, 20);
  buf.writeInt16LE(args.dstY | 0, 22);
  return buf;
}

// =============================================================================
// XTestFakeInput (XTEST minor 2)
//
// Wire layout (36 bytes, length = 9):
//   0   major        XTEST major opcode (from QueryExtension)
//   1   2            minor (FakeInput)
//   2-4 9            request length
//   4   type         KeyPress=2, KeyRelease=3, ButtonPress=4,
//                    ButtonRelease=5, MotionNotify=6
//   5   detail       keycode (key events), button# (button events),
//                    or relative-flag (0=absolute, 1=relative) for motion
//   6-8 unused
//   8-12 delay       milliseconds (CARD32) — server delays before injecting
//   12-16 root       window id, or 0 (None) to use current root
//   16-24 unused
//   24-26 rootX      INT16 — for MotionNotify
//   26-28 rootY      INT16
//   28-36 unused
//
// The server treats button presses on buttons 4-7 as wheel events, which
// is the conventional way to inject scroll input via XTEST.
// =============================================================================

export interface XTestFakeInputArgs {
  type: number;          // XTEST_TYPE_*
  detail?: number;       // keycode/button/relative-flag (default 0)
  delayMs?: number;      // server-side delay before injection (default 0)
  root?: number;         // window id (default 0 = current root)
  rootX?: number;        // for MOTION_NOTIFY (default 0)
  rootY?: number;        // for MOTION_NOTIFY (default 0)
}

export function encodeXTestFakeInput(majorOpcode: number, args: XTestFakeInputArgs): Buffer {
  const buf = Buffer.alloc(36);
  writeRequestHeader(buf, majorOpcode, XTEST_MINOR_FAKE_INPUT);
  buf.writeUInt8(args.type & 0xFF, 4);
  buf.writeUInt8((args.detail ?? 0) & 0xFF, 5);
  // bytes 6-8 unused
  buf.writeUInt32LE((args.delayMs ?? 0) >>> 0, 8);
  buf.writeUInt32LE((args.root ?? 0) >>> 0, 12);
  // bytes 16-24 unused
  buf.writeInt16LE((args.rootX ?? 0) | 0, 24);
  buf.writeInt16LE((args.rootY ?? 0) | 0, 26);
  // bytes 28-36 unused
  return buf;
}

// =============================================================================
// Error decoding (shared across all requests)
// =============================================================================

export interface XError {
  code: number;
  sequence: number;
  badValue: number;
  minorOpcode: number;
  majorOpcode: number;
}

export function parseError(buf: Buffer): XError {
  if (buf.length < 32) throw new Error("error packet too short");
  return {
    code: buf.readUInt8(1),
    sequence: buf.readUInt16LE(2),
    badValue: buf.readUInt32LE(4),
    minorOpcode: buf.readUInt16LE(8),
    majorOpcode: buf.readUInt8(10),
  };
}

/** Extract the sequence number from a reply/error header. Returns -1 for events. */
export function sequenceOf(buf: Buffer): number {
  if (buf.length < 4) return -1;
  const kind = buf.readUInt8(0);
  if (kind === 0 || kind === 1) return buf.readUInt16LE(2);
  return -1;   // event
}

/**
 * How many total bytes does a reply / error / event packet occupy?
 * All events and errors are 32 bytes; replies are `32 + 4 * length`.
 * The caller passes the first 8 bytes (enough to read the length field).
 */
export function packetTotalLength(prefix: Buffer): number {
  if (prefix.length < 8) throw new Error("packet prefix too short");
  const kind = prefix.readUInt8(0);
  if (kind === 1) {
    const extra = prefix.readUInt32LE(4);
    return 32 + extra * 4;
  }
  return 32;  // error or event
}
