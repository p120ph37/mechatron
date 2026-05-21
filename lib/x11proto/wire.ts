/**
 * Pure-TS X11 wire protocol encoders/decoders and DISPLAY/Xauthority
 * parsers.  This module is the testable half of mechatron's Phase 6d
 * "xproto" fallback — a direct X11 speaker that doesn't depend on
 * `libX11` / `libXtst` / `libXrandr`.  Socket I/O and the request/reply
 * loop live in `lib/x11proto/conn.ts`; everything here is synchronous
 * byte-pushing that can be exercised without a live X server.
 *
 * X11 protocol references:
 *   - https://www.x.org/releases/X11R7.7/doc/xproto/x11protocol.pdf
 *     (chapter 8 "Connection setup" and appendix B "Encoding")
 *   - /usr/include/X11/Xauth.h for the Xauthority record format.
 *
 * Byte order: the X protocol carries a byte-order flag in the first
 * byte of the connection request ('B' for BE, 'l' for LE).  We always
 * use little-endian — every arch we target is LE natively, and Node's
 * Buffer LE helpers are shorter than the equivalent BE dance.
 */
import { readFileSync } from "fs";
import { hostname } from "os";
import { join } from "path";

// =============================================================================
// $DISPLAY parsing
// =============================================================================

/**
 * Where to reach the X server.  `unix` means a local socket at
 * `/tmp/.X11-unix/X<display>`; `tcp` means `{host}:{port}` where
 * `port = 6000 + display`.  `abstract` (Linux-only) uses the abstract
 * namespace `@/tmp/.X11-unix/X<display>` — some hardened containers
 * expose only the abstract socket, not the filesystem one.
 */
export type DisplayEndpoint =
  | { kind: "unix"; path: string; display: number; screen: number }
  | { kind: "abstract"; name: string; display: number; screen: number }
  | { kind: "tcp"; host: string; port: number; display: number; screen: number };

/**
 * Parse a DISPLAY string of the form `[host][:protocol]:display[.screen]`.
 *
 * Recognised forms (standard X syntax):
 *   - `:0`          → local Unix socket, display 0, screen 0
 *   - `:0.1`        → local Unix socket, display 0, screen 1
 *   - `unix:0`      → explicit unix-socket form
 *   - `host:0`      → TCP to host:6000
 *   - `host:1.2`    → TCP to host:6001, screen 2
 *
 * Returns `null` when the string isn't a valid DISPLAY — callers should
 * treat that as "cannot connect" rather than guessing.
 */
export function parseDisplay(display: string): DisplayEndpoint | null {
  if (!display) return null;
  // Split on the last ':' so `unix:0` and `host:0.1` both work.
  const colon = display.lastIndexOf(":");
  if (colon < 0) return null;
  const host = display.slice(0, colon);
  const rest = display.slice(colon + 1);
  const dot = rest.indexOf(".");
  const dispStr = dot < 0 ? rest : rest.slice(0, dot);
  const screenStr = dot < 0 ? "0" : rest.slice(dot + 1);
  const dispNum = Number.parseInt(dispStr, 10);
  const screenNum = Number.parseInt(screenStr, 10);
  if (!Number.isFinite(dispNum) || dispNum < 0 || dispNum > 0xFFFF) return null;
  if (!Number.isFinite(screenNum) || screenNum < 0) return null;
  if (host === "" || host === "unix") {
    return { kind: "unix", path: `/tmp/.X11-unix/X${dispNum}`, display: dispNum, screen: screenNum };
  }
  // Bracketed IPv6 literals: strip brackets for consistency with Node net.
  const cleanHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return {
    kind: "tcp", host: cleanHost, port: 6000 + dispNum, display: dispNum, screen: screenNum,
  };
}

// =============================================================================
// Xauthority parsing
//
// Binary format (big-endian throughout — note this differs from the X11
// wire protocol proper, where we pick LE):
//
//   family: u16
//   address length n: u16; address: n bytes
//   number length m:  u16; number:  m bytes (ASCII display number)
//   name length p:    u16; name:    p bytes ("MIT-MAGIC-COOKIE-1" etc.)
//   data length d:    u16; data:    d bytes (the cookie)
//
// A file contains zero or more concatenated records.  Xauth families:
//   0  Internet (IPv4)
//   1  DECnet  (historical)
//   2  Chaos   (historical)
//   5  ServerInterpreted
//   6  Internet6
//   256  Local     (address = hostname bytes)
//   65535  Wild    (matches anything)
// =============================================================================

export const XAUTH_FAMILY_INTERNET = 0;
export const XAUTH_FAMILY_INTERNET6 = 6;
export const XAUTH_FAMILY_LOCAL = 256;
export const XAUTH_FAMILY_WILD = 65535;

export interface XauthEntry {
  family: number;
  address: Buffer;
  number: string;
  name: string;
  data: Buffer;
}

/**
 * Parse an entire Xauthority file into records.  Returns an empty array
 * if the file doesn't look like a valid Xauth blob (e.g. truncated).
 * We don't throw on malformed records — an unreadable cookie is
 * operationally the same as "no cookie", so the caller falls through
 * to authenticate-less connection (which most Xvfb/XWayland setups
 * accept from the local user).
 */
export function parseXauthority(buf: Buffer): XauthEntry[] {
  const out: XauthEntry[] = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const family = buf.readUInt16BE(off); off += 2;
    const [address, a2] = readLenField(buf, off); if (a2 < 0) break; off = a2;
    const [numBuf,  n2] = readLenField(buf, off); if (n2 < 0) break; off = n2;
    const [nameBuf, p2] = readLenField(buf, off); if (p2 < 0) break; off = p2;
    const [data,    d2] = readLenField(buf, off); if (d2 < 0) break; off = d2;
    out.push({
      family, address, number: numBuf.toString("ascii"),
      name: nameBuf.toString("ascii"), data,
    });
  }
  return out;
}

function readLenField(buf: Buffer, off: number): [Buffer, number] {
  if (off + 2 > buf.length) return [Buffer.alloc(0), -1];
  const len = buf.readUInt16BE(off);
  const start = off + 2;
  if (start + len > buf.length) return [Buffer.alloc(0), -1];
  return [buf.subarray(start, start + len), start + len];
}

/**
 * Select the best-matching cookie for `(endpoint, displayNumber)`.
 * The match rules come from X.Org's `XauGetAuthByAddr`:
 *   - family LOCAL matches when address equals the current hostname;
 *   - family WILD always matches;
 *   - family INTERNET / INTERNET6 matches when the endpoint is TCP
 *     and the address bytes match the resolved host (we skip this
 *     for unix endpoints since the hostnames won't line up);
 *   - number matches exact display, or is empty (wildcard).
 *
 * When multiple entries match we pick the first with `name ===
 * "MIT-MAGIC-COOKIE-1"` — that's what every modern display server
 * negotiates and it avoids the obsolete `XDM-AUTHORIZATION-1`
 * time-based scheme which we don't implement.
 */
export function findXauthCookie(
  entries: XauthEntry[],
  endpoint: DisplayEndpoint,
  host: string = hostname(),
): { name: string; data: Buffer } | null {
  const dispStr = String(endpoint.display);
  const hostBytes = Buffer.from(host, "utf8");
  for (const e of entries) {
    if (e.name !== "MIT-MAGIC-COOKIE-1") continue;
    if (e.number !== "" && e.number !== dispStr) continue;
    if (e.family === XAUTH_FAMILY_WILD) return { name: e.name, data: e.data };
    if (e.family === XAUTH_FAMILY_LOCAL &&
        (endpoint.kind === "unix" || endpoint.kind === "abstract") &&
        e.address.equals(hostBytes)) {
      return { name: e.name, data: e.data };
    }
    if ((e.family === XAUTH_FAMILY_INTERNET || e.family === XAUTH_FAMILY_INTERNET6) &&
        endpoint.kind === "tcp" && e.address.toString("utf8") === endpoint.host) {
      return { name: e.name, data: e.data };
    }
  }
  return null;
}

/**
 * Resolve the Xauthority file path the same way libXau does: prefer
 * `$XAUTHORITY`, then `$HOME/.Xauthority`, then give up.  Doesn't
 * throw on missing files — returns an empty cookie record list.
 */
export function loadXauthority(env: NodeJS.ProcessEnv = process.env): XauthEntry[] {
  const path = env.XAUTHORITY || (env.HOME ? join(env.HOME, ".Xauthority") : null);
  if (!path) return [];
  try {
    return parseXauthority(readFileSync(path));
  } catch {
    return [];
  }
}

// =============================================================================
// X11 connection setup request
//
// Wire layout (12 bytes fixed + padded auth name + padded auth data):
//   byte-order:              BYTE  ('l' = LE, 'B' = BE)
//   unused:                  BYTE
//   protocol-major-version:  CARD16 = 11
//   protocol-minor-version:  CARD16 = 0
//   length of auth-protocol-name (n): CARD16
//   length of auth-protocol-data (d): CARD16
//   unused:                  CARD16
//   auth-protocol-name:      STRING8 + pad to 4
//   auth-protocol-data:      STRING8 + pad to 4
// =============================================================================

export const X_PROTOCOL_MAJOR = 11;
export const X_PROTOCOL_MINOR = 0;

/** Round `n` up to the next multiple of 4 — X11 pads everything. */
export function pad4(n: number): number { return (n + 3) & ~3; }

export function encodeConnectionSetup(
  authName: string = "",
  authData: Buffer = Buffer.alloc(0),
): Buffer {
  const nameBuf = Buffer.from(authName, "utf8");
  const namePad = pad4(nameBuf.length);
  const dataPad = pad4(authData.length);
  const buf = Buffer.alloc(12 + namePad + dataPad);
  buf.writeUInt8(0x6c, 0);               // 'l' — little-endian
  // buf[1] = 0 unused
  buf.writeUInt16LE(X_PROTOCOL_MAJOR, 2);
  buf.writeUInt16LE(X_PROTOCOL_MINOR, 4);
  buf.writeUInt16LE(nameBuf.length, 6);
  buf.writeUInt16LE(authData.length, 8);
  // buf[10..12] = 0 unused
  nameBuf.copy(buf, 12);
  authData.copy(buf, 12 + namePad);
  return buf;
}

// =============================================================================
// X11 connection setup reply parsing
//
// Three outcomes distinguished by the first byte:
//   0  Failed — reason string follows
//   1  Success — the giant screen/visual blob
//   2  Authenticate — further auth exchange needed (not supported here)
//
// Layout of the 8-byte fixed prefix of *every* reply form:
//   response:  BYTE
//   reason-length n (Failed) / unused (Success/Auth): BYTE
//   protocol-major: CARD16
//   protocol-minor: CARD16
//   additional-data length (in 4-byte units): CARD16
// =============================================================================

export type ConnReply =
  | { kind: "failed"; major: number; minor: number; reason: string }
  | { kind: "authenticate"; reason: string }
  | { kind: "success"; info: ServerInfo };

export interface PixmapFormat {
  depth: number;
  bitsPerPixel: number;
  scanlinePad: number;
}

export interface Visual {
  id: number;
  class: number;
  bitsPerRgbValue: number;
  colormapEntries: number;
  redMask: number;
  greenMask: number;
  blueMask: number;
}

export interface Depth {
  depth: number;
  visuals: Visual[];
}

export interface Screen {
  root: number;
  defaultColormap: number;
  whitePixel: number;
  blackPixel: number;
  currentInputMasks: number;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  minInstalledMaps: number;
  maxInstalledMaps: number;
  rootVisual: number;
  backingStores: number;
  saveUnders: number;
  rootDepth: number;
  depths: Depth[];
}

export interface ServerInfo {
  releaseNumber: number;
  resourceIdBase: number;
  resourceIdMask: number;
  motionBufferSize: number;
  maximumRequestLength: number;
  imageByteOrder: number;
  bitmapFormatBitOrder: number;
  bitmapFormatScanlineUnit: number;
  bitmapFormatScanlinePad: number;
  minKeycode: number;
  maxKeycode: number;
  vendor: string;
  pixmapFormats: PixmapFormat[];
  screens: Screen[];
}

/**
 * How many bytes does the server want us to read before we can parse
 * the reply?  The first 8 bytes tell us; this returns the total size
 * (including those 8).  Used by the socket layer to do one coarse
 * read, then one fine read of exactly the advertised payload.
 */
export function connReplyTotalLength(prefix: Buffer): number {
  if (prefix.length < 8) throw new Error("prefix too short");
  const extra = prefix.readUInt16LE(6);   // in 4-byte units
  return 8 + extra * 4;
}

/**
 * Parse a fully-read connection setup reply buffer.  The Success case
 * walks the screen/depth/visual forest; on Failed/Authenticate we only
 * surface the reason string (most operators want to see "no protocol
 * specified" or "Invalid MIT-MAGIC-COOKIE-1 key" verbatim).
 */
export function parseConnectionSetupReply(buf: Buffer): ConnReply {
  if (buf.length < 8) throw new Error("reply too short");
  const response = buf.readUInt8(0);
  const major = buf.readUInt16LE(2);
  const minor = buf.readUInt16LE(4);
  if (response === 0) {
    const reasonLen = buf.readUInt8(1);
    const reason = buf.toString("utf8", 8, 8 + reasonLen);
    return { kind: "failed", major, minor, reason };
  }
  if (response === 2) {
    // "Authenticate" — the remainder is a reason string, NUL-padded to 4.
    const reason = buf.toString("utf8", 8).replace(/\0+$/, "");
    return { kind: "authenticate", reason };
  }
  // Success.  Parse the 32-byte fixed header (bytes 8..40).
  const releaseNumber = buf.readUInt32LE(8);
  const resourceIdBase = buf.readUInt32LE(12);
  const resourceIdMask = buf.readUInt32LE(16);
  const motionBufferSize = buf.readUInt32LE(20);
  const vendorLen = buf.readUInt16LE(24);
  const maximumRequestLength = buf.readUInt16LE(26);
  const numScreens = buf.readUInt8(28);
  const numPixmapFormats = buf.readUInt8(29);
  const imageByteOrder = buf.readUInt8(30);
  const bitmapFormatBitOrder = buf.readUInt8(31);
  const bitmapFormatScanlineUnit = buf.readUInt8(32);
  const bitmapFormatScanlinePad = buf.readUInt8(33);
  const minKeycode = buf.readUInt8(34);
  const maxKeycode = buf.readUInt8(35);
  // bytes 36..40 unused
  let off = 40;
  const vendor = buf.toString("utf8", off, off + vendorLen);
  off += pad4(vendorLen);
  const pixmapFormats: PixmapFormat[] = [];
  for (let i = 0; i < numPixmapFormats; i++) {
    pixmapFormats.push({
      depth: buf.readUInt8(off),
      bitsPerPixel: buf.readUInt8(off + 1),
      scanlinePad: buf.readUInt8(off + 2),
      // bytes off+3..off+8 unused
    });
    off += 8;
  }
  const screens: Screen[] = [];
  for (let i = 0; i < numScreens; i++) {
    const s = parseScreen(buf, off);
    screens.push(s.screen);
    off = s.next;
  }
  return {
    kind: "success",
    info: {
      releaseNumber, resourceIdBase, resourceIdMask, motionBufferSize,
      maximumRequestLength, imageByteOrder, bitmapFormatBitOrder,
      bitmapFormatScanlineUnit, bitmapFormatScanlinePad, minKeycode, maxKeycode,
      vendor, pixmapFormats, screens,
    },
  };
}

function parseScreen(buf: Buffer, off: number): { screen: Screen; next: number } {
  const root = buf.readUInt32LE(off);
  const defaultColormap = buf.readUInt32LE(off + 4);
  const whitePixel = buf.readUInt32LE(off + 8);
  const blackPixel = buf.readUInt32LE(off + 12);
  const currentInputMasks = buf.readUInt32LE(off + 16);
  const widthPx = buf.readUInt16LE(off + 20);
  const heightPx = buf.readUInt16LE(off + 22);
  const widthMm = buf.readUInt16LE(off + 24);
  const heightMm = buf.readUInt16LE(off + 26);
  const minInstalledMaps = buf.readUInt16LE(off + 28);
  const maxInstalledMaps = buf.readUInt16LE(off + 30);
  const rootVisual = buf.readUInt32LE(off + 32);
  const backingStores = buf.readUInt8(off + 36);
  const saveUnders = buf.readUInt8(off + 37);
  const rootDepth = buf.readUInt8(off + 38);
  const numDepths = buf.readUInt8(off + 39);
  let p = off + 40;
  const depths: Depth[] = [];
  for (let i = 0; i < numDepths; i++) {
    const d = parseDepth(buf, p);
    depths.push(d.depth);
    p = d.next;
  }
  return {
    screen: {
      root, defaultColormap, whitePixel, blackPixel, currentInputMasks,
      widthPx, heightPx, widthMm, heightMm, minInstalledMaps, maxInstalledMaps,
      rootVisual, backingStores, saveUnders, rootDepth, depths,
    },
    next: p,
  };
}

function parseDepth(buf: Buffer, off: number): { depth: Depth; next: number } {
  const depth = buf.readUInt8(off);
  // byte off+1 unused
  const numVisuals = buf.readUInt16LE(off + 2);
  // bytes off+4..off+8 unused
  let p = off + 8;
  const visuals: Visual[] = [];
  for (let i = 0; i < numVisuals; i++) {
    visuals.push({
      id:                buf.readUInt32LE(p),
      class:             buf.readUInt8(p + 4),
      bitsPerRgbValue:   buf.readUInt8(p + 5),
      colormapEntries:   buf.readUInt16LE(p + 6),
      redMask:           buf.readUInt32LE(p + 8),
      greenMask:         buf.readUInt32LE(p + 12),
      blueMask:          buf.readUInt32LE(p + 16),
      // bytes p+20..p+24 unused
    });
    p += 24;
  }
  return { depth: { depth, visuals }, next: p };
}
