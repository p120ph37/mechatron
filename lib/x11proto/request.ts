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

// RANDR extension minor opcodes
export const RANDR_MINOR_QUERY_VERSION = 0;
export const RANDR_MINOR_GET_MONITORS = 42;
// Client-supported RANDR version we negotiate.  RandR 1.5 introduced
// RRGetMonitors, which is all we use.
export const RANDR_CLIENT_MAJOR = 1;
export const RANDR_CLIENT_MINOR = 5;

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
// GetImage (core opcode 73)
//
// Wire layout (20 bytes, length = 5):
//   0   73          opcode
//   1   format      1 = XYPixmap, 2 = ZPixmap
//   2-4 5           length
//   4-8 drawable    DRAWABLE (root window, for screen capture)
//   8-10 x          INT16
//   10-12 y         INT16
//   12-14 width     CARD16
//   14-16 height    CARD16
//   16-20 plane-mask CARD32 (0xFFFFFFFF for all planes)
//
// Reply (32 + 4*replyLen bytes):
//   0   1           Reply
//   1   depth       CARD8 (depth of the source drawable)
//   2-4 seq         u16
//   4-8 length      CARD32 (extra 4-byte units beyond the 32-byte header)
//   8-12 visual     VISUALID or None(0) for InputOnly windows / Pixmaps
//   12-32 unused
//   32+ data        replyLen*4 bytes; pixel layout depends on format,
//                   server image-byte-order, and the visual's RGB masks.
//
// For format=ZPixmap on a TrueColor 24/32-bit visual, each pixel is 4 bytes;
// channel ordering follows the visual's red/green/blue masks (typical X.Org
// is little-endian BGRX or BGRA).  Callers must consult ServerInfo /
// the screen's depth list to interpret the bytes correctly.
// =============================================================================

export const IMAGE_FORMAT_XY_BITMAP = 0;
export const IMAGE_FORMAT_XY_PIXMAP = 1;
export const IMAGE_FORMAT_Z_PIXMAP = 2;

export interface GetImageArgs {
  drawable: number;
  x: number;
  y: number;
  width: number;
  height: number;
  format?: number;       // default ZPixmap
  planeMask?: number;    // default 0xFFFFFFFF
}

export function encodeGetImage(args: GetImageArgs): Buffer {
  const buf = Buffer.alloc(20);
  writeRequestHeader(buf, OP_GET_IMAGE, args.format ?? IMAGE_FORMAT_Z_PIXMAP);
  buf.writeUInt32LE(args.drawable >>> 0, 4);
  buf.writeInt16LE(args.x | 0, 8);
  buf.writeInt16LE(args.y | 0, 10);
  buf.writeUInt16LE(args.width & 0xFFFF, 12);
  buf.writeUInt16LE(args.height & 0xFFFF, 14);
  buf.writeUInt32LE((args.planeMask ?? 0xFFFFFFFF) >>> 0, 16);
  return buf;
}

export interface GetImageReply {
  depth: number;
  visual: number;
  data: Buffer;     // raw pixel bytes (length = replyLen * 4, may include trailing padding for unused row bytes)
}

export function parseGetImageReply(buf: Buffer): GetImageReply {
  if (buf.length < 32) throw new Error("GetImage reply too short");
  const replyLen = buf.readUInt32LE(4);
  const total = 32 + replyLen * 4;
  if (buf.length < total) throw new Error("GetImage reply truncated");
  return {
    depth: buf.readUInt8(1),
    visual: buf.readUInt32LE(8),
    data: buf.subarray(32, total),
  };
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
// RANDR — RRQueryVersion (minor 0) and RRGetMonitors (minor 42)
//
// RRQueryVersion (12 bytes, length = 3):
//   0   major          RANDR major opcode (from QueryExtension)
//   1   0              RANDR minor (QueryVersion)
//   2-4 3              request length
//   4-8 client-major   CARD32
//   8-12 client-minor  CARD32
// Reply (32 bytes, replyLen = 0):
//   8-12 server-major
//   12-16 server-minor
//   16-32 unused
//
// RRGetMonitors (12 bytes, length = 3):
//   0   major
//   1   42             RANDR minor (GetMonitors)
//   2-4 3
//   4-8 window         WINDOW (any on the target screen; we use root)
//   8   get-active     BOOL (1 = only active monitors)
//   9-12 unused
// Reply (32 + variable):
//   4-8  length        CARD32 (4-byte units of trailing data)
//   8-12 timestamp     TIMESTAMP
//   12-16 nMonitors    CARD32
//   16-20 nOutputs     CARD32 (total across all monitors)
//   20-32 unused
//   32+  MonitorInfo[nMonitors]
//
// MonitorInfo (24 + 4*nOutput bytes):
//   0-4   name         ATOM
//   4     primary      BOOL
//   5     automatic    BOOL
//   6-8   nOutput      CARD16
//   8-10  x            INT16
//   10-12 y            INT16
//   12-14 width        CARD16 (pixels)
//   14-16 height       CARD16 (pixels)
//   16-20 width-mm     CARD32
//   20-24 height-mm    CARD32
//   24+   outputs[nOutput]  CARD32 each
// =============================================================================

export function encodeRRQueryVersion(majorOpcode: number): Buffer {
  const buf = Buffer.alloc(12);
  writeRequestHeader(buf, majorOpcode, RANDR_MINOR_QUERY_VERSION);
  buf.writeUInt32LE(RANDR_CLIENT_MAJOR, 4);
  buf.writeUInt32LE(RANDR_CLIENT_MINOR, 8);
  return buf;
}

export interface RRQueryVersionReply {
  majorVersion: number;
  minorVersion: number;
}

export function parseRRQueryVersionReply(buf: Buffer): RRQueryVersionReply {
  if (buf.length < 32) throw new Error("RRQueryVersion reply too short");
  return {
    majorVersion: buf.readUInt32LE(8),
    minorVersion: buf.readUInt32LE(12),
  };
}

export function encodeRRGetMonitors(majorOpcode: number, window: number, getActive = true): Buffer {
  const buf = Buffer.alloc(12);
  writeRequestHeader(buf, majorOpcode, RANDR_MINOR_GET_MONITORS);
  buf.writeUInt32LE(window >>> 0, 4);
  buf.writeUInt8(getActive ? 1 : 0, 8);
  return buf;
}

export interface MonitorInfo {
  name: number;        // ATOM (caller can look up via GetAtomName if desired)
  primary: boolean;
  automatic: boolean;
  x: number;
  y: number;
  width: number;       // pixels
  height: number;      // pixels
  widthMm: number;
  heightMm: number;
  outputs: number[];   // RANDR output IDs
}

export interface RRGetMonitorsReply {
  timestamp: number;
  monitors: MonitorInfo[];
}

export function parseRRGetMonitorsReply(buf: Buffer): RRGetMonitorsReply {
  if (buf.length < 32) throw new Error("RRGetMonitors reply too short");
  const timestamp = buf.readUInt32LE(8);
  const nMonitors = buf.readUInt32LE(12);
  const monitors: MonitorInfo[] = [];
  let off = 32;
  for (let i = 0; i < nMonitors; i++) {
    if (off + 24 > buf.length) throw new Error("RRGetMonitors reply truncated in MonitorInfo header");
    const nOutput = buf.readUInt16LE(off + 6);
    const blockEnd = off + 24 + nOutput * 4;
    if (blockEnd > buf.length) throw new Error("RRGetMonitors reply truncated in outputs[]");
    const outputs: number[] = [];
    for (let j = 0; j < nOutput; j++) outputs.push(buf.readUInt32LE(off + 24 + j * 4));
    monitors.push({
      name: buf.readUInt32LE(off + 0),
      primary: buf.readUInt8(off + 4) !== 0,
      automatic: buf.readUInt8(off + 5) !== 0,
      x: buf.readInt16LE(off + 8),
      y: buf.readInt16LE(off + 10),
      width: buf.readUInt16LE(off + 12),
      height: buf.readUInt16LE(off + 14),
      widthMm: buf.readUInt32LE(off + 16),
      heightMm: buf.readUInt32LE(off + 20),
      outputs,
    });
    off = blockEnd;
  }
  return { timestamp, monitors };
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
