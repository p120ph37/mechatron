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
export const OP_GET_KEYBOARD_MAPPING = 101;
export const OP_GET_WINDOW_ATTRIBUTES = 3;
export const OP_DESTROY_WINDOW = 4;
export const OP_MAP_WINDOW = 8;
export const OP_UNMAP_WINDOW = 10;
export const OP_CONFIGURE_WINDOW = 12;
export const OP_GET_GEOMETRY = 14;
export const OP_QUERY_TREE = 15;
export const OP_INTERN_ATOM = 16;
export const OP_GET_ATOM_NAME = 17;
export const OP_CHANGE_PROPERTY = 18;
export const OP_GET_PROPERTY = 20;
export const OP_SEND_EVENT = 25;
export const OP_QUERY_POINTER = 38;
export const OP_TRANSLATE_COORDINATES = 40;
export const OP_CREATE_WINDOW = 1;
export const OP_DELETE_PROPERTY = 19;
export const OP_SET_SELECTION_OWNER = 22;
export const OP_GET_SELECTION_OWNER = 23;
export const OP_CONVERT_SELECTION = 24;
export const OP_QUERY_KEYMAP = 44;

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

export const IMAGE_FORMAT_Z_PIXMAP = 2;   // the only format we actually use

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
// GetKeyboardMapping (core opcode 101)
//
// Wire layout (8 bytes, length = 2):
//   0   101             opcode
//   1   unused
//   2-4 2               length
//   4   first-keycode   KEYCODE (u8) — typically ServerInfo.minKeycode
//   5   count           CARD8 — number of consecutive keycodes to fetch
//   6-8 unused
//
// Reply (32 + 4*replyLen bytes):
//   0   1                reply
//   1   keysyms-per-keycode  CARD8 — width of the per-keycode row
//   2-4 seq              u16
//   4-8 length           CARD32 (count * keysyms-per-keycode, in KEYSYM = u32 units)
//   8-32 unused
//   32+ keysyms          count * keysyms-per-keycode KEYSYMs (CARD32 each)
//
// Slot j of keycode k's row is the j-th keysym assigned to that keycode
// (j=0 is unshifted, j=1 is shifted, j=2/3 are modifier combinations).
// "NoSymbol" (0) fills unused slots.  For keysym→keycode lookup we pick
// the first keycode whose row contains the target keysym in slot 0 or 1.
// =============================================================================

export function encodeGetKeyboardMapping(firstKeycode: number, count: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_GET_KEYBOARD_MAPPING, 0);
  buf.writeUInt8(firstKeycode & 0xFF, 4);
  buf.writeUInt8(count & 0xFF, 5);
  return buf;
}

export interface GetKeyboardMappingReply {
  keysymsPerKeycode: number;
  /** Flat count*keysymsPerKeycode array of KEYSYM values (0 = NoSymbol). */
  keysyms: Uint32Array;
}

export function parseGetKeyboardMappingReply(buf: Buffer): GetKeyboardMappingReply {
  if (buf.length < 32) throw new Error("GetKeyboardMapping reply too short");
  const keysymsPerKeycode = buf.readUInt8(1);
  const replyLen = buf.readUInt32LE(4);
  const total = 32 + replyLen * 4;
  if (buf.length < total) throw new Error("GetKeyboardMapping reply truncated");
  const keysyms = new Uint32Array(replyLen);
  for (let i = 0; i < replyLen; i++) keysyms[i] = buf.readUInt32LE(32 + i * 4);
  return { keysymsPerKeycode, keysyms };
}

// =============================================================================
// GetWindowAttributes (core opcode 3)
//
// Request (8 bytes):  [3, 0, 2, 0, window:u32]
// Reply (44 bytes, reply-length = 3):
//   1   backing-store  8   visual:u32  12 class:u16  14 bit-gravity:u8
//   15  win-gravity:u8 16  backing-planes:u32  20 backing-pixel:u32
//   24  save-under:bool  25 map-is-installed:bool  26 map-state:u8
//   27  override-redirect:bool  28 colormap:u32  32 all-event-masks:u32
//   36  your-event-mask:u32  40 do-not-propagate-mask:u16
// =============================================================================

export function encodeGetWindowAttributes(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_GET_WINDOW_ATTRIBUTES, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

export interface GetWindowAttributesReply {
  backingStore: number;
  visual: number;
  windowClass: number;     // 1=InputOutput, 2=InputOnly
  bitGravity: number;
  winGravity: number;
  backingPlanes: number;
  backingPixel: number;
  saveUnder: boolean;
  mapIsInstalled: boolean;
  mapState: number;        // 0=Unmapped, 1=Unviewable, 2=Viewable
  overrideRedirect: boolean;
  colormap: number;
  allEventMasks: number;
  yourEventMask: number;
  doNotPropagateMask: number;
}

export function parseGetWindowAttributesReply(buf: Buffer): GetWindowAttributesReply {
  if (buf.length < 44) throw new Error("GetWindowAttributes reply too short");
  return {
    backingStore: buf.readUInt8(1),
    visual: buf.readUInt32LE(8),
    windowClass: buf.readUInt16LE(12),
    bitGravity: buf.readUInt8(14),
    winGravity: buf.readUInt8(15),
    backingPlanes: buf.readUInt32LE(16),
    backingPixel: buf.readUInt32LE(20),
    saveUnder: buf.readUInt8(24) !== 0,
    mapIsInstalled: buf.readUInt8(25) !== 0,
    mapState: buf.readUInt8(26),
    overrideRedirect: buf.readUInt8(27) !== 0,
    colormap: buf.readUInt32LE(28),
    allEventMasks: buf.readUInt32LE(32),
    yourEventMask: buf.readUInt32LE(36),
    doNotPropagateMask: buf.readUInt16LE(40),
  };
}

// =============================================================================
// DestroyWindow (core opcode 4)  — no reply
// =============================================================================

export function encodeDestroyWindow(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_DESTROY_WINDOW, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

// =============================================================================
// MapWindow (core opcode 8)  — no reply
// =============================================================================

export function encodeMapWindow(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_MAP_WINDOW, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

// =============================================================================
// UnmapWindow (core opcode 10)  — no reply
// =============================================================================

export function encodeUnmapWindow(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_UNMAP_WINDOW, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

// =============================================================================
// ConfigureWindow (core opcode 12)
//
// Wire (12 + 4*popcount(mask)):
//   0  12  opcode        1  unused      2-4  length
//   4-8  window          8-10  value-mask:u16   10-12  unused
//   12+  values[], one u32 per set bit in mask
//
// Mask bits:   0x01=x  0x02=y  0x04=width  0x08=height
//              0x10=border-width  0x20=sibling  0x40=stack-mode
// =============================================================================

export const CW_X            = 0x01;
export const CW_Y            = 0x02;
export const CW_WIDTH        = 0x04;
export const CW_HEIGHT       = 0x08;
export const CW_BORDER_WIDTH = 0x10;
export const CW_SIBLING      = 0x20;
export const CW_STACK_MODE   = 0x40;

export interface ConfigureWindowArgs {
  window: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  borderWidth?: number;
  sibling?: number;
  stackMode?: number;       // 0=Above, 1=Below, 2=TopIf, 3=BottomIf, 4=Opposite
}

export function encodeConfigureWindow(args: ConfigureWindowArgs): Buffer {
  const vals: { mask: number; v: number }[] = [];
  if (args.x !== undefined)           vals.push({ mask: CW_X, v: args.x | 0 });
  if (args.y !== undefined)           vals.push({ mask: CW_Y, v: args.y | 0 });
  if (args.width !== undefined)       vals.push({ mask: CW_WIDTH, v: args.width & 0xFFFF });
  if (args.height !== undefined)      vals.push({ mask: CW_HEIGHT, v: args.height & 0xFFFF });
  if (args.borderWidth !== undefined) vals.push({ mask: CW_BORDER_WIDTH, v: args.borderWidth & 0xFFFF });
  if (args.sibling !== undefined)     vals.push({ mask: CW_SIBLING, v: args.sibling >>> 0 });
  if (args.stackMode !== undefined)   vals.push({ mask: CW_STACK_MODE, v: args.stackMode & 0xFF });
  let combinedMask = 0;
  for (const e of vals) combinedMask |= e.mask;
  const buf = Buffer.alloc(12 + vals.length * 4);
  writeRequestHeader(buf, OP_CONFIGURE_WINDOW, 0);
  buf.writeUInt32LE(args.window >>> 0, 4);
  buf.writeUInt16LE(combinedMask, 8);
  for (let i = 0; i < vals.length; i++) buf.writeInt32LE(vals[i].v, 12 + i * 4);
  return buf;
}

// =============================================================================
// GetGeometry (core opcode 14)
//
// Request (8 bytes):  [14, 0, 2, 0, drawable:u32]
// Reply (32 bytes, reply-length = 0):
//   1 depth  8 root:u32  12 x:i16  14 y:i16  16 width:u16  18 height:u16
//   20 border-width:u16
// =============================================================================

export function encodeGetGeometry(drawable: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_GET_GEOMETRY, 0);
  buf.writeUInt32LE(drawable >>> 0, 4);
  return buf;
}

export interface GetGeometryReply {
  depth: number;
  root: number;
  x: number;
  y: number;
  width: number;
  height: number;
  borderWidth: number;
}

export function parseGetGeometryReply(buf: Buffer): GetGeometryReply {
  if (buf.length < 32) throw new Error("GetGeometry reply too short");
  return {
    depth: buf.readUInt8(1),
    root: buf.readUInt32LE(8),
    x: buf.readInt16LE(12),
    y: buf.readInt16LE(14),
    width: buf.readUInt16LE(16),
    height: buf.readUInt16LE(18),
    borderWidth: buf.readUInt16LE(20),
  };
}

// =============================================================================
// QueryTree (core opcode 15)
//
// Request (8 bytes):  [15, 0, 2, 0, window:u32]
// Reply (32 + 4*nChildren):
//   8 root:u32  12 parent:u32(0=None)  16 nChildren:u16  32+ children[]:u32
// =============================================================================

export function encodeQueryTree(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_QUERY_TREE, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

export interface QueryTreeReply {
  root: number;
  parent: number;       // 0 = None (the root window's parent)
  children: number[];
}

export function parseQueryTreeReply(buf: Buffer): QueryTreeReply {
  if (buf.length < 32) throw new Error("QueryTree reply too short");
  const nChildren = buf.readUInt16LE(16);
  const children: number[] = [];
  for (let i = 0; i < nChildren; i++) children.push(buf.readUInt32LE(32 + i * 4));
  return {
    root: buf.readUInt32LE(8),
    parent: buf.readUInt32LE(12),
    children,
  };
}

// =============================================================================
// InternAtom (core opcode 16)
//
// Request (8 + pad4(n)):
//   0  16  opcode  1  only-if-exists:bool  4-6  name-length:u16  8+  name
// Reply (32 bytes):   8  atom:u32 (0 = None when only-if-exists && not found)
// =============================================================================

export function encodeInternAtom(name: string, onlyIfExists = false): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const total = pad4(8 + nameBuf.length);
  const buf = Buffer.alloc(total);
  writeRequestHeader(buf, OP_INTERN_ATOM, onlyIfExists ? 1 : 0);
  buf.writeUInt16LE(nameBuf.length, 4);
  nameBuf.copy(buf, 8);
  return buf;
}

export interface InternAtomReply {
  atom: number;     // 0 = None
}

export function parseInternAtomReply(buf: Buffer): InternAtomReply {
  if (buf.length < 32) throw new Error("InternAtom reply too short");
  return { atom: buf.readUInt32LE(8) };
}

// =============================================================================
// GetAtomName (core opcode 17)
//
// Request (8 bytes):  [17, 0, 2, 0, atom:u32]
// Reply (32 + pad4(n)):  8  name-length:u16   32+  name
// =============================================================================

export function encodeGetAtomName(atom: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_GET_ATOM_NAME, 0);
  buf.writeUInt32LE(atom >>> 0, 4);
  return buf;
}

export interface GetAtomNameReply {
  name: string;
}

export function parseGetAtomNameReply(buf: Buffer): GetAtomNameReply {
  if (buf.length < 32) throw new Error("GetAtomName reply too short");
  const n = buf.readUInt16LE(8);
  return { name: buf.toString("utf8", 32, 32 + n) };
}

// =============================================================================
// ChangeProperty (core opcode 18)  — no reply
//
// Request (24 + pad4(data)):
//   0  18  opcode  1  mode:u8 (0=Replace,1=Prepend,2=Append)
//   4  window:u32  8  property:atom  12  type:atom
//   16  format:u8 (8,16,32)  20  length:u32 (in format units)
//   24+ data  (n = length * format/8 bytes)
// =============================================================================

export const PROP_MODE_REPLACE = 0;
export const PROP_MODE_PREPEND = 1;
export const PROP_MODE_APPEND  = 2;

export interface ChangePropertyArgs {
  mode?: number;       // PROP_MODE_REPLACE by default
  window: number;
  property: number;    // atom
  type: number;        // atom
  format: 8 | 16 | 32;
  data: Buffer;        // raw bytes (must be format-aligned)
}

export function encodeChangeProperty(args: ChangePropertyArgs): Buffer {
  const dataLen = args.data.length;
  const total = pad4(24 + dataLen);
  const buf = Buffer.alloc(total);
  writeRequestHeader(buf, OP_CHANGE_PROPERTY, args.mode ?? PROP_MODE_REPLACE);
  buf.writeUInt32LE(args.window >>> 0, 4);
  buf.writeUInt32LE(args.property >>> 0, 8);
  buf.writeUInt32LE(args.type >>> 0, 12);
  buf.writeUInt8(args.format, 16);
  buf.writeUInt32LE((dataLen / (args.format / 8)) >>> 0, 20);
  args.data.copy(buf, 24);
  return buf;
}

// =============================================================================
// GetProperty (core opcode 20)
//
// Request (24 bytes):
//   0  20  opcode  1  delete:bool  4  window:u32  8  property:atom
//   12  type:atom (0=AnyPropertyType)  16  long-offset:u32  20  long-length:u32
// Reply (32 + pad4(n)):
//   1  format:u8 (0/8/16/32)  8  type:atom  12  bytes-after:u32
//   16  value-length:u32 (in format units)  32+  value
// =============================================================================

export interface GetPropertyArgs {
  window: number;
  property: number;    // atom
  type?: number;       // 0 = AnyPropertyType
  longOffset?: number;
  longLength?: number; // max 4-byte units to return (default 1024 = 4KB)
  delete?: boolean;
}

export function encodeGetProperty(args: GetPropertyArgs): Buffer {
  const buf = Buffer.alloc(24);
  writeRequestHeader(buf, OP_GET_PROPERTY, args.delete ? 1 : 0);
  buf.writeUInt32LE(args.window >>> 0, 4);
  buf.writeUInt32LE(args.property >>> 0, 8);
  buf.writeUInt32LE((args.type ?? 0) >>> 0, 12);
  buf.writeUInt32LE((args.longOffset ?? 0) >>> 0, 16);
  buf.writeUInt32LE((args.longLength ?? 1024) >>> 0, 20);
  return buf;
}

export interface GetPropertyReply {
  format: number;       // 0 = property doesn't exist, 8/16/32 = data element size
  type: number;         // atom
  bytesAfter: number;   // remaining bytes not returned
  value: Buffer;        // raw data (length = valueLength * format/8)
}

export function parseGetPropertyReply(buf: Buffer): GetPropertyReply {
  if (buf.length < 32) throw new Error("GetProperty reply too short");
  const format = buf.readUInt8(1);
  const type = buf.readUInt32LE(8);
  const bytesAfter = buf.readUInt32LE(12);
  const valueLength = buf.readUInt32LE(16);
  const byteLen = format === 0 ? 0 : valueLength * (format / 8);
  return {
    format, type, bytesAfter,
    value: buf.subarray(32, 32 + byteLen),
  };
}

// =============================================================================
// SendEvent (core opcode 25)  — no reply
//
// Request (44 bytes):
//   0  25  opcode  1  propagate:bool
//   4  destination:u32 (0=PointerWindow, 1=InputFocus, or a window)
//   8  event-mask:u32
//   12  event[32]  (raw 32-byte event to send)
// =============================================================================

export interface SendEventArgs {
  propagate?: boolean;
  destination: number;
  eventMask: number;
  event: Buffer;         // must be exactly 32 bytes
}

export function encodeSendEvent(args: SendEventArgs): Buffer {
  const buf = Buffer.alloc(44);
  writeRequestHeader(buf, OP_SEND_EVENT, args.propagate ? 1 : 0);
  buf.writeUInt32LE(args.destination >>> 0, 4);
  buf.writeUInt32LE(args.eventMask >>> 0, 8);
  if (args.event.length !== 32) throw new Error("SendEvent: event must be exactly 32 bytes");
  args.event.copy(buf, 12);
  return buf;
}

// =============================================================================
// QueryPointer (core opcode 38)
//
// Request (8 bytes):  [38, 0, 2, 0, window:u32]
// Reply (32 bytes, reply-length = 0):
//   1  same-screen:bool  8  root:u32  12  child:u32(0=None)
//   16  root-x:i16  18  root-y:i16  20  win-x:i16  22  win-y:i16
//   24  mask:u16 (key/button state)
// =============================================================================

export function encodeQueryPointer(window: number): Buffer {
  const buf = Buffer.alloc(8);
  writeRequestHeader(buf, OP_QUERY_POINTER, 0);
  buf.writeUInt32LE(window >>> 0, 4);
  return buf;
}

export interface QueryPointerReply {
  sameScreen: boolean;
  root: number;
  child: number;        // 0 = None
  rootX: number;
  rootY: number;
  winX: number;
  winY: number;
  mask: number;          // key/button modifier mask
}

export function parseQueryPointerReply(buf: Buffer): QueryPointerReply {
  if (buf.length < 32) throw new Error("QueryPointer reply too short");
  return {
    sameScreen: buf.readUInt8(1) !== 0,
    root: buf.readUInt32LE(8),
    child: buf.readUInt32LE(12),
    rootX: buf.readInt16LE(16),
    rootY: buf.readInt16LE(18),
    winX: buf.readInt16LE(20),
    winY: buf.readInt16LE(22),
    mask: buf.readUInt16LE(24),
  };
}

// =============================================================================
// TranslateCoordinates (core opcode 40)
//
// Request (16 bytes):
//   4  src-window:u32  8  dst-window:u32  12  src-x:i16  14  src-y:i16
// Reply (32 bytes, reply-length = 0):
//   1  same-screen:bool  8  child:u32(0=None)  12  dst-x:i16  14  dst-y:i16
// =============================================================================

export function encodeTranslateCoordinates(
  srcWindow: number, dstWindow: number, srcX: number, srcY: number,
): Buffer {
  const buf = Buffer.alloc(16);
  writeRequestHeader(buf, OP_TRANSLATE_COORDINATES, 0);
  buf.writeUInt32LE(srcWindow >>> 0, 4);
  buf.writeUInt32LE(dstWindow >>> 0, 8);
  buf.writeInt16LE(srcX | 0, 12);
  buf.writeInt16LE(srcY | 0, 14);
  return buf;
}

export interface TranslateCoordinatesReply {
  sameScreen: boolean;
  child: number;
  dstX: number;
  dstY: number;
}

export function parseTranslateCoordinatesReply(buf: Buffer): TranslateCoordinatesReply {
  if (buf.length < 32) throw new Error("TranslateCoordinates reply too short");
  return {
    sameScreen: buf.readUInt8(1) !== 0,
    child: buf.readUInt32LE(8),
    dstX: buf.readInt16LE(12),
    dstY: buf.readInt16LE(14),
  };
}

// =============================================================================
// QueryKeymap (core opcode 44)
//
// Request (4 bytes): just the header [44, 0, 1, 0]
// Reply (40 bytes, reply-length = 2):
//   bytes 8-39: keys[32] — 256-bit bitmap of currently-pressed keycodes
//   Bit N corresponds to keycode N: byte (N >> 3), bit (N & 7).
// =============================================================================

export function encodeQueryKeymap(): Buffer {
  const buf = Buffer.alloc(4);
  writeRequestHeader(buf, OP_QUERY_KEYMAP, 0);
  return buf;
}

export interface QueryKeymapReply {
  keys: Uint8Array;     // 32-byte bitmap
}

export function parseQueryKeymapReply(buf: Buffer): QueryKeymapReply {
  if (buf.length < 40) throw new Error("QueryKeymap reply too short");
  return { keys: new Uint8Array(buf.buffer, buf.byteOffset + 8, 32) };
}

// =============================================================================
// CreateWindow (core opcode 1)
//
// Input-only window, no attributes.
// Wire layout (32 bytes, length = 8):
//   0   1           opcode
//   1   depth       0 = CopyFromParent
//   2-4 8           length in 4-byte units
//   4-8 wid         WINDOW
//   8-12 parent     WINDOW
//   12-14 x         INT16
//   14-16 y         INT16
//   16-18 width     CARD16
//   18-20 height    CARD16
//   20-22 border-w  CARD16
//   22-24 class     CARD16 (2 = InputOnly)
//   24-28 visual    VISUALID (0 = CopyFromParent)
//   28-32 value-mask CARD32 (0 = none)
// =============================================================================

export function encodeCreateWindow(
  wid: number, parent: number, x: number, y: number,
  width: number, height: number,
): Buffer {
  const buf = Buffer.allocUnsafe(32);
  buf.writeUInt8(OP_CREATE_WINDOW, 0);
  buf.writeUInt8(0, 1); // depth = CopyFromParent
  buf.writeUInt16LE(8, 2); // length in 4-byte units
  buf.writeUInt32LE(wid, 4);
  buf.writeUInt32LE(parent, 8);
  buf.writeInt16LE(x, 12);
  buf.writeInt16LE(y, 14);
  buf.writeUInt16LE(width, 16);
  buf.writeUInt16LE(height, 18);
  buf.writeUInt16LE(0, 20); // border_width
  buf.writeUInt16LE(2, 22); // class = InputOnly
  buf.writeUInt32LE(0, 24); // visual = CopyFromParent
  buf.writeUInt32LE(0, 28); // value_mask = none
  return buf;
}

// =============================================================================
// DeleteProperty (core opcode 19)  — no reply
//
// Wire layout (12 bytes, length = 3):
//   0   19          opcode
//   1   unused
//   2-4 3           length
//   4-8 window      WINDOW
//   8-12 property   ATOM
// =============================================================================

export function encodeDeleteProperty(window: number, property: number): Buffer {
  const buf = Buffer.allocUnsafe(12);
  buf.writeUInt8(19, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt16LE(3, 2);
  buf.writeUInt32LE(window, 4);
  buf.writeUInt32LE(property, 8);
  return buf;
}

// =============================================================================
// SetSelectionOwner (core opcode 22)  — no reply
//
// Wire layout (16 bytes, length = 4):
//   0   22          opcode
//   1   unused
//   2-4 4           length
//   4-8 owner       WINDOW (0 = None)
//   8-12 selection  ATOM
//   12-16 timestamp TIMESTAMP (0 = CurrentTime)
// =============================================================================

export function encodeSetSelectionOwner(owner: number, selection: number, timestamp = 0): Buffer {
  const buf = Buffer.allocUnsafe(16);
  buf.writeUInt8(OP_SET_SELECTION_OWNER, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt16LE(4, 2);
  buf.writeUInt32LE(owner, 4);
  buf.writeUInt32LE(selection, 8);
  buf.writeUInt32LE(timestamp, 12);
  return buf;
}

// =============================================================================
// GetSelectionOwner (core opcode 23)
//
// Request (8 bytes, length = 2):
//   0   23          opcode
//   1   unused
//   2-4 2           length
//   4-8 selection   ATOM
//
// Reply (32 bytes, reply-length = 0):
//   8-12 owner      WINDOW (0 = None)
// =============================================================================

export function encodeGetSelectionOwner(selection: number): Buffer {
  const buf = Buffer.allocUnsafe(8);
  buf.writeUInt8(OP_GET_SELECTION_OWNER, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt16LE(2, 2);
  buf.writeUInt32LE(selection, 4);
  return buf;
}

export function parseGetSelectionOwnerReply(buf: Buffer): { owner: number } {
  return { owner: buf.readUInt32LE(8) };
}

// =============================================================================
// ConvertSelection (core opcode 24)  — no reply
//
// Wire layout (24 bytes, length = 6):
//   0   24          opcode
//   1   unused
//   2-4 6           length
//   4-8 requestor   WINDOW
//   8-12 selection  ATOM
//   12-16 target    ATOM
//   16-20 property  ATOM
//   20-24 timestamp TIMESTAMP (0 = CurrentTime)
// =============================================================================

export function encodeConvertSelection(
  requestor: number, selection: number, target: number,
  property: number, timestamp = 0,
): Buffer {
  const buf = Buffer.allocUnsafe(24);
  buf.writeUInt8(OP_CONVERT_SELECTION, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt16LE(6, 2);
  buf.writeUInt32LE(requestor, 4);
  buf.writeUInt32LE(selection, 8);
  buf.writeUInt32LE(target, 12);
  buf.writeUInt32LE(property, 16);
  buf.writeUInt32LE(timestamp, 20);
  return buf;
}

// =============================================================================
// Selection event parsers
// =============================================================================

// X11 event type codes for selections
export const EVENT_SELECTION_REQUEST = 30;
export const EVENT_SELECTION_NOTIFY = 31;

export interface SelectionRequestEvent {
  time: number;
  owner: number;
  requestor: number;
  selection: number;
  target: number;
  property: number;
}

export interface SelectionNotifyEvent {
  time: number;
  requestor: number;
  selection: number;
  target: number;
  property: number; // 0 = None (conversion failed)
}

export function parseSelectionRequestEvent(buf: Buffer): SelectionRequestEvent {
  return {
    time: buf.readUInt32LE(4),
    owner: buf.readUInt32LE(8),
    requestor: buf.readUInt32LE(12),
    selection: buf.readUInt32LE(16),
    target: buf.readUInt32LE(20),
    property: buf.readUInt32LE(24),
  };
}

export function parseSelectionNotifyEvent(buf: Buffer): SelectionNotifyEvent {
  return {
    time: buf.readUInt32LE(4),
    requestor: buf.readUInt32LE(8),
    selection: buf.readUInt32LE(12),
    target: buf.readUInt32LE(16),
    property: buf.readUInt32LE(20),
  };
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
