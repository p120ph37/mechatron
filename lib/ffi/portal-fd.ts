/**
 * Raw-socket D-Bus client for portal fd acquisition.
 *
 * Implements just enough of the D-Bus wire protocol to negotiate
 * RemoteDesktop (→ EIS fd for libei) and ScreenCast (→ PipeWire fd)
 * portal sessions.  Uses bun:ffi libc bindings for socket operations
 * with SCM_RIGHTS support — the standard lib/dbus/connection.ts cannot
 * receive ancillary file descriptors.
 *
 * Message encoding/decoding is delegated to lib/dbus/wire.ts.
 */

import { getBunFFI, bp } from "./bun";
import {
  encodeMessage, decodeMessage,
  MSG_METHOD_CALL, MSG_METHOD_RETURN, MSG_SIGNAL,
  type Message,
} from "../dbus/wire";
import { existsSync } from "fs";

const F = getBunFFI()!;
const T = F.FFIType;

const lc = F.dlopen("libc.so.6", {
  socket:  { args: [T.i32, T.i32, T.i32], returns: T.i32 },
  connect: { args: [T.i32, T.i64, T.u32], returns: T.i32 },
  write:   { args: [T.i32, T.i64, T.u64], returns: T.i64 },
  read:    { args: [T.i32, T.i64, T.u64], returns: T.i64 },
  close:   { args: [T.i32], returns: T.i32 },
  recvmsg: { args: [T.i32, T.i64, T.i32], returns: T.i64 },
  getuid:  { args: [], returns: T.u32 },
  getpid:  { args: [], returns: T.i32 },
}).symbols;

const AF_UNIX = 1;
const SOCK_STREAM = 1;

// ── Socket helpers ──────────────────────────────────────────────────

function sessionBusPath(): string | null {
  const addr = process.env.DBUS_SESSION_BUS_ADDRESS;
  if (addr) {
    for (const part of addr.split(";")) {
      if (!part.startsWith("unix:")) continue;
      for (const kv of part.slice(5).split(",")) {
        if (kv.startsWith("path=")) return kv.slice(5);
      }
    }
  }
  const uid = lc.getuid();
  const p = `/run/user/${uid}/bus`;
  return existsSync(p) ? p : null;
}

function sockWriteAll(fd: number, data: Uint8Array): boolean {
  let written = 0;
  while (written < data.length) {
    const slice = data.subarray(written);
    const n = Number(lc.write(fd, bp(slice), BigInt(slice.length)));
    if (n <= 0) return false;
    written += n;
  }
  return true;
}

function sockReadExact(fd: number, len: number): Uint8Array | null {
  const buf = new Uint8Array(len);
  let done = 0;
  while (done < len) {
    const n = Number(lc.read(fd, bp(buf.subarray(done)), BigInt(len - done)));
    if (n <= 0) return null;
    done += n;
  }
  return buf;
}

function sockReadLine(fd: number): string | null {
  const buf = new Uint8Array(256);
  let len = 0;
  while (len < 254) {
    const n = Number(lc.read(fd, bp(buf.subarray(len, len + 1)), 1n));
    if (n <= 0) return null;
    len++;
    if (len >= 2 && buf[len - 2] === 0x0D && buf[len - 1] === 0x0A) {
      return new TextDecoder().decode(buf.subarray(0, len));
    }
  }
  return null;
}

// ── recvmsg with SCM_RIGHTS ─────────────────────────────────────────
// msghdr layout (x86_64): 56 bytes
//   [0..8)   msg_name        void*
//   [8..12)  msg_namelen      u32
//   [12..16) padding
//   [16..24) msg_iov          iovec*
//   [24..32) msg_iovlen       size_t
//   [32..40) msg_control      void*
//   [40..48) msg_controllen   size_t
//   [48..52) msg_flags        int
//   [52..56) padding
//
// iovec layout: 16 bytes
//   [0..8) iov_base   void*
//   [8..16) iov_len   size_t
//
// cmsghdr layout:
//   [0..8)   cmsg_len    size_t
//   [8..12)  cmsg_level  int
//   [12..16) cmsg_type   int
//   [16..)   fd data

function recvDbusMsg(fd: number): { msg: Buffer; fds: number[] } | null {
  const hdr = sockReadExact(fd, 16);
  if (!hdr) return null;

  const bodyLen = hdr[4] | (hdr[5] << 8) | (hdr[6] << 16) | (hdr[7] << 24);
  const fieldsLen = hdr[12] | (hdr[13] << 8) | (hdr[14] << 16) | (hdr[15] << 24);
  const fieldsPadded = (fieldsLen + 7) & ~7;
  const remaining = fieldsPadded + bodyLen;

  if (remaining === 0) {
    return { msg: Buffer.from(hdr), fds: [] };
  }

  const restBuf = new Uint8Array(remaining);
  const cmsgBuf = new Uint8Array(64);
  const iovBuf = new Uint8Array(16);
  const msgBuf = new Uint8Array(56);

  const restPtr = bp(restBuf);
  const cmsgPtr = bp(cmsgBuf);
  const iovPtr = bp(iovBuf);
  const msgPtr = bp(msgBuf);

  const iovDv = new DataView(iovBuf.buffer);
  const msgDv = new DataView(msgBuf.buffer);

  msgDv.setBigUint64(16, iovPtr, true);
  msgDv.setBigUint64(24, 1n, true);

  let totalRead = 0;
  const allFds: number[] = [];

  while (totalRead < remaining) {
    iovDv.setBigUint64(0, restPtr + BigInt(totalRead), true);
    iovDv.setBigUint64(8, BigInt(remaining - totalRead), true);

    cmsgBuf.fill(0);
    msgDv.setBigUint64(32, cmsgPtr, true);
    msgDv.setBigUint64(40, BigInt(cmsgBuf.length), true);

    const n = Number(lc.recvmsg(fd, msgPtr, 0));
    if (n <= 0) return null;
    totalRead += n;

    const cmsgDv = new DataView(cmsgBuf.buffer);
    const cmsgLen = Number(cmsgDv.getBigUint64(0, true));
    if (cmsgLen >= 20) {
      const level = cmsgDv.getInt32(8, true);
      const ctype = cmsgDv.getInt32(12, true);
      if (level === 1 && ctype === 1) {
        const fdDataLen = cmsgLen - 16;
        const nFds = Math.floor(fdDataLen / 4);
        for (let i = 0; i < nFds; i++) {
          allFds.push(cmsgDv.getInt32(16 + i * 4, true));
        }
      }
    }
  }

  const full = Buffer.alloc(16 + remaining);
  full.set(hdr, 0);
  full.set(restBuf, 16);
  return { msg: full, fds: allFds };
}

// ── D-Bus connection ────────────────────────────────────────────────

interface DBusConn {
  fd: number;
  serial: number;
  uniqueName: string;
}

function dbusConnect(): DBusConn | null {
  const busPath = sessionBusPath();
  if (!busPath) return null;

  const fd = lc.socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return null;

  const pathBytes = new TextEncoder().encode(busPath);
  const addr = new Uint8Array(110);
  addr[0] = AF_UNIX;
  addr.set(pathBytes, 2);

  if (lc.connect(fd, bp(addr), 110) !== 0) {
    lc.close(fd);
    return null;
  }

  const uid = lc.getuid();
  const hexUid = String(uid).split("").map(c =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
  const auth = new TextEncoder().encode(`\0AUTH EXTERNAL ${hexUid}\r\n`);
  if (!sockWriteAll(fd, auth)) { lc.close(fd); return null; }

  const okLine = sockReadLine(fd);
  if (!okLine || !okLine.startsWith("OK")) { lc.close(fd); return null; }

  sockWriteAll(fd, new TextEncoder().encode("NEGOTIATE_UNIX_FD\r\n"));
  sockReadLine(fd);
  if (!sockWriteAll(fd, new TextEncoder().encode("BEGIN\r\n"))) {
    lc.close(fd);
    return null;
  }

  const helloMsg = encodeMessage({
    type: MSG_METHOD_CALL, flags: 0, serial: 1,
    path: "/org/freedesktop/DBus",
    interface: "org.freedesktop.DBus",
    member: "Hello",
    destination: "org.freedesktop.DBus",
    body: [],
  });
  if (!sockWriteAll(fd, new Uint8Array(helloMsg))) {
    lc.close(fd);
    return null;
  }

  const reply = recvDbusMsg(fd);
  if (!reply) { lc.close(fd); return null; }
  const decoded = decodeMessage(reply.msg);
  if (!decoded || decoded.type !== MSG_METHOD_RETURN) {
    lc.close(fd);
    return null;
  }

  return { fd, serial: 1, uniqueName: decoded.body[0] as string };
}

// ── Portal helpers ──────────────────────────────────────────────────

const PORTAL_DEST = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";

function requestPath(uniqueName: string, token: string): string {
  const sender = uniqueName.replace(/\./g, "_").replace(/:/g, "");
  return `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
}

function addMatch(conn: DBusConn, rule: string): void {
  conn.serial++;
  const msg = encodeMessage({
    type: MSG_METHOD_CALL, flags: 0, serial: conn.serial,
    path: "/org/freedesktop/DBus",
    interface: "org.freedesktop.DBus",
    member: "AddMatch",
    destination: "org.freedesktop.DBus",
    signature: "s",
    body: [rule],
  });
  sockWriteAll(conn.fd, new Uint8Array(msg));
}

function waitForResponse(conn: DBusConn, reqPath: string): any[] | null {
  for (let i = 0; i < 200; i++) {
    const r = recvDbusMsg(conn.fd);
    if (!r) return null;
    const msg = decodeMessage(r.msg);
    if (!msg) continue;
    if (msg.type !== MSG_SIGNAL) continue;
    if (msg.path !== reqPath || msg.member !== "Response") continue;
    return msg.body;
  }
  return null;
}

function portalCall(
  conn: DBusConn, iface: string, method: string,
  sig: string, body: any[], token: string,
): any[] | null {
  const reqPath = requestPath(conn.uniqueName, token);
  addMatch(conn, `type='signal',sender='${PORTAL_DEST}',interface='org.freedesktop.portal.Request',member='Response',path='${reqPath}'`);

  conn.serial++;
  const msg = encodeMessage({
    type: MSG_METHOD_CALL, flags: 0, serial: conn.serial,
    path: PORTAL_PATH, interface: iface, member: method,
    destination: PORTAL_DEST, signature: sig, body,
  });
  sockWriteAll(conn.fd, new Uint8Array(msg));
  recvDbusMsg(conn.fd);
  return waitForResponse(conn, reqPath);
}

// ── Public API ──────────────────────────────────────────────────────

let _counter = 0;

export function portalGetEisFd(): number | null {
  const conn = dbusConnect();
  if (!conn) return null;

  const pid = lc.getpid();
  const cnt = ++_counter;
  const RD = "org.freedesktop.portal.RemoteDesktop";

  const tok1 = `mechatron_${pid}_${cnt}_cs`;
  const sessTok = `mechatron_${pid}_${cnt}_s`;
  const resp1 = portalCall(conn, RD, "CreateSession", "a{sv}", [
    { handle_token: ["s", tok1], session_handle_token: ["s", sessTok] },
  ], tok1);
  if (!resp1 || resp1[0] !== 0) { lc.close(conn.fd); return null; }
  const sessHandle = (resp1[1] as Map<string, any>).get("session_handle") as string;
  if (!sessHandle) { lc.close(conn.fd); return null; }

  const tok2 = `mechatron_${pid}_${cnt}_sd`;
  const resp2 = portalCall(conn, RD, "SelectDevices", "oa{sv}", [
    sessHandle, { handle_token: ["s", tok2], types: ["u", 3] },
  ], tok2);
  if (!resp2 || resp2[0] !== 0) { lc.close(conn.fd); return null; }

  const tok3 = `mechatron_${pid}_${cnt}_st`;
  const resp3 = portalCall(conn, RD, "Start", "osa{sv}", [
    sessHandle, "", { handle_token: ["s", tok3] },
  ], tok3);
  if (!resp3 || resp3[0] !== 0) { lc.close(conn.fd); return null; }

  conn.serial++;
  const eisMsg = encodeMessage({
    type: MSG_METHOD_CALL, flags: 0, serial: conn.serial,
    path: PORTAL_PATH, interface: RD, member: "ConnectToEIS",
    destination: PORTAL_DEST, signature: "oa{sv}",
    body: [sessHandle, {}],
  });
  sockWriteAll(conn.fd, new Uint8Array(eisMsg));

  const eisReply = recvDbusMsg(conn.fd);
  if (!eisReply) { lc.close(conn.fd); return null; }
  const eisDecoded = decodeMessage(eisReply.msg);
  if (!eisDecoded || eisDecoded.type !== MSG_METHOD_RETURN || eisReply.fds.length === 0) {
    lc.close(conn.fd);
    return null;
  }

  // Intentionally leak conn.fd — portal session must stay alive.
  return eisReply.fds[0];
}

export interface ScreencastSession {
  pwFd: number;
  nodeId: number;
  width: number;
  height: number;
  restoreToken: string | null;
}

export function portalGetScreencastSession(restoreToken?: string): ScreencastSession | null {
  const conn = dbusConnect();
  if (!conn) return null;

  const pid = lc.getpid();
  const cnt = ++_counter;
  const SC = "org.freedesktop.portal.ScreenCast";

  const tok1 = `mechatron_${pid}_${cnt}_scs`;
  const sessTok = `mechatron_${pid}_${cnt}_ss`;
  const resp1 = portalCall(conn, SC, "CreateSession", "a{sv}", [
    { handle_token: ["s", tok1], session_handle_token: ["s", sessTok] },
  ], tok1);
  if (!resp1 || resp1[0] !== 0) { lc.close(conn.fd); return null; }
  const sessHandle = (resp1[1] as Map<string, any>).get("session_handle") as string;
  if (!sessHandle) { lc.close(conn.fd); return null; }

  const tok2 = `mechatron_${pid}_${cnt}_ss2`;
  const opts2: Record<string, [string, any]> = {
    handle_token: ["s", tok2],
    types: ["u", 1],
    persist_mode: ["u", 2],
  };
  if (restoreToken) opts2.restore_token = ["s", restoreToken];
  const resp2 = portalCall(conn, SC, "SelectSources", "oa{sv}", [
    sessHandle, opts2,
  ], tok2);
  if (!resp2 || resp2[0] !== 0) { lc.close(conn.fd); return null; }

  const tok3 = `mechatron_${pid}_${cnt}_st`;
  const resp3 = portalCall(conn, SC, "Start", "osa{sv}", [
    sessHandle, "", { handle_token: ["s", tok3] },
  ], tok3);
  if (!resp3 || resp3[0] !== 0) { lc.close(conn.fd); return null; }

  const results = resp3[1] as Map<string, any>;
  let nodeId = 0, width = 1920, height = 1080;
  let newToken: string | null = null;

  const streams = results.get("streams") as any[];
  if (streams && streams.length > 0) {
    nodeId = streams[0][0] as number;
    const props = streams[0][1] as Map<string, any>;
    const size = props?.get("size") as any[];
    if (size) { width = size[0]; height = size[1]; }
  }
  const tok = results.get("restore_token") as string | undefined;
  if (tok) newToken = tok;
  if (nodeId === 0) { lc.close(conn.fd); return null; }

  conn.serial++;
  const pwMsg = encodeMessage({
    type: MSG_METHOD_CALL, flags: 0, serial: conn.serial,
    path: PORTAL_PATH, interface: SC, member: "OpenPipeWireRemote",
    destination: PORTAL_DEST, signature: "oa{sv}",
    body: [sessHandle, {}],
  });
  sockWriteAll(conn.fd, new Uint8Array(pwMsg));

  const pwReply = recvDbusMsg(conn.fd);
  if (!pwReply) { lc.close(conn.fd); return null; }
  const pwDecoded = decodeMessage(pwReply.msg);
  if (!pwDecoded || pwDecoded.type !== MSG_METHOD_RETURN || pwReply.fds.length === 0) {
    lc.close(conn.fd);
    return null;
  }

  // Intentionally leak conn.fd — session must stay alive.
  return { pwFd: pwReply.fds[0], nodeId, width, height, restoreToken: newToken };
}
