/**
 * Portal fd acquisition via libdbus-1 + bun:ffi.
 *
 * Dlopens libdbus-1.so.3 and uses the native D-Bus C API to negotiate
 * RemoteDesktop (→ EIS fd for libei) and ScreenCast (→ PipeWire fd)
 * portal sessions.  libdbus handles SCM_RIGHTS fd passing internally
 * when DBUS_TYPE_UNIX_FD appears in a message.
 */

import { getBunFFI, bp, cstr, cstringFromPtr } from "./bun";

const F = getBunFFI()!;
const T = F.FFIType;

// ── libdbus-1 dlopen ───────────────────────────────────────────────

interface DbusSymbols {
  dbus_error_init: (err: bigint) => void;
  dbus_error_is_set: (err: bigint) => number;
  dbus_error_free: (err: bigint) => void;
  dbus_bus_get_private: (type_: number, err: bigint) => bigint;
  dbus_bus_get_unique_name: (conn: bigint) => bigint;
  dbus_bus_add_match: (conn: bigint, rule: bigint, err: bigint) => void;
  dbus_connection_send_with_reply_and_block: (conn: bigint, msg: bigint, timeout: number, err: bigint) => bigint;
  dbus_connection_send: (conn: bigint, msg: bigint, serial: bigint) => number;
  dbus_connection_flush: (conn: bigint) => void;
  dbus_connection_read_write: (conn: bigint, timeout: number) => number;
  dbus_connection_pop_message: (conn: bigint) => bigint;
  dbus_connection_close: (conn: bigint) => void;
  dbus_connection_unref: (conn: bigint) => void;
  dbus_message_new_method_call: (dest: bigint, path: bigint, iface: bigint, method: bigint) => bigint;
  dbus_message_get_type: (msg: bigint) => number;
  dbus_message_get_path: (msg: bigint) => bigint;
  dbus_message_get_member: (msg: bigint) => bigint;
  dbus_message_unref: (msg: bigint) => void;
  dbus_message_iter_init_append: (msg: bigint, iter: bigint) => void;
  dbus_message_iter_init: (msg: bigint, iter: bigint) => number;
  dbus_message_iter_get_arg_type: (iter: bigint) => number;
  dbus_message_iter_get_basic: (iter: bigint, value: bigint) => void;
  dbus_message_iter_recurse: (iter: bigint, sub: bigint) => void;
  dbus_message_iter_next: (iter: bigint) => number;
  dbus_message_iter_open_container: (iter: bigint, type_: number, sig: bigint, sub: bigint) => number;
  dbus_message_iter_append_basic: (iter: bigint, type_: number, value: bigint) => number;
  dbus_message_iter_close_container: (iter: bigint, sub: bigint) => number;
}

const db = F.dlopen<DbusSymbols>("libdbus-1.so.3", {
  dbus_error_init:                        { args: [T.i64], returns: T.void },
  dbus_error_is_set:                      { args: [T.i64], returns: T.u32 },
  dbus_error_free:                        { args: [T.i64], returns: T.void },
  dbus_bus_get_private:                   { args: [T.i32, T.i64], returns: T.i64 },
  dbus_bus_get_unique_name:               { args: [T.i64], returns: T.i64 },
  dbus_bus_add_match:                     { args: [T.i64, T.i64, T.i64], returns: T.void },
  dbus_connection_send_with_reply_and_block: { args: [T.i64, T.i64, T.i32, T.i64], returns: T.i64 },
  dbus_connection_send:                   { args: [T.i64, T.i64, T.i64], returns: T.u32 },
  dbus_connection_flush:                  { args: [T.i64], returns: T.void },
  dbus_connection_read_write:             { args: [T.i64, T.i32], returns: T.u32 },
  dbus_connection_pop_message:            { args: [T.i64], returns: T.i64 },
  dbus_connection_close:                  { args: [T.i64], returns: T.void },
  dbus_connection_unref:                  { args: [T.i64], returns: T.void },
  dbus_message_new_method_call:           { args: [T.i64, T.i64, T.i64, T.i64], returns: T.i64 },
  dbus_message_get_type:                  { args: [T.i64], returns: T.i32 },
  dbus_message_get_path:                  { args: [T.i64], returns: T.i64 },
  dbus_message_get_member:                { args: [T.i64], returns: T.i64 },
  dbus_message_unref:                     { args: [T.i64], returns: T.void },
  dbus_message_iter_init_append:          { args: [T.i64, T.i64], returns: T.void },
  dbus_message_iter_init:                 { args: [T.i64, T.i64], returns: T.u32 },
  dbus_message_iter_get_arg_type:         { args: [T.i64], returns: T.i32 },
  dbus_message_iter_get_basic:            { args: [T.i64, T.i64], returns: T.void },
  dbus_message_iter_recurse:              { args: [T.i64, T.i64], returns: T.void },
  dbus_message_iter_next:                 { args: [T.i64], returns: T.u32 },
  dbus_message_iter_open_container:       { args: [T.i64, T.i32, T.i64, T.i64], returns: T.u32 },
  dbus_message_iter_append_basic:         { args: [T.i64, T.i32, T.i64], returns: T.u32 },
  dbus_message_iter_close_container:      { args: [T.i64, T.i64], returns: T.u32 },
}).symbols;

// ── D-Bus constants ────────────────────────────────────────────────

const DBUS_BUS_SESSION = 0;
const DBUS_TYPE_STRING = 0x73;      // 's'
const DBUS_TYPE_UINT32 = 0x75;      // 'u'
const DBUS_TYPE_OBJECT_PATH = 0x6F; // 'o'
const DBUS_TYPE_VARIANT = 0x76;     // 'v'
const DBUS_TYPE_ARRAY = 0x61;       // 'a'
const DBUS_TYPE_UNIX_FD = 0x68;     // 'h'
const DBUS_TYPE_INT32 = 0x69;       // 'i'
const DBUS_TYPE_INVALID = 0;
const DBUS_MESSAGE_TYPE_SIGNAL = 4;

// ── Struct helpers ─────────────────────────────────────────────────

function allocError(): Uint8Array {
  const buf = new Uint8Array(64);
  db.dbus_error_init(bp(buf));
  return buf;
}

function allocIter(): Uint8Array {
  return new Uint8Array(128);
}

function readCString(ptr: bigint): string {
  if (ptr === 0n) return "";
  return cstringFromPtr(ptr);
}

// ── Iterator helpers for building messages ─────────────────────────

function appendString(iter: bigint, s: string): void {
  const buf = cstr(s);
  const ptrBuf = new BigInt64Array(1);
  ptrBuf[0] = bp(buf);
  db.dbus_message_iter_append_basic(iter, DBUS_TYPE_STRING, bp(new Uint8Array(ptrBuf.buffer)));
}

function appendObjectPath(iter: bigint, s: string): void {
  const buf = cstr(s);
  const ptrBuf = new BigInt64Array(1);
  ptrBuf[0] = bp(buf);
  db.dbus_message_iter_append_basic(iter, DBUS_TYPE_OBJECT_PATH, bp(new Uint8Array(ptrBuf.buffer)));
}

function appendUint32(iter: bigint, v: number): void {
  const buf = new Uint32Array(1);
  buf[0] = v;
  db.dbus_message_iter_append_basic(iter, DBUS_TYPE_UINT32, bp(new Uint8Array(buf.buffer)));
}

function appendAsv(iter: bigint, entries: [string, string, any][]): void {
  const sub = allocIter();
  const sig = cstr("{sv}");
  db.dbus_message_iter_open_container(iter, DBUS_TYPE_ARRAY, bp(sig), bp(sub));

  for (const [key, typeSig, value] of entries) {
    const entry = allocIter();
    db.dbus_message_iter_open_container(bp(sub), 0x65, 0n, bp(entry)); // DBUS_TYPE_DICT_ENTRY = 'e'

    appendString(bp(entry), key);

    const variant = allocIter();
    const vsig = cstr(typeSig);
    db.dbus_message_iter_open_container(bp(entry), DBUS_TYPE_VARIANT, bp(vsig), bp(variant));

    if (typeSig === "s") {
      appendString(bp(variant), value as string);
    } else if (typeSig === "u") {
      appendUint32(bp(variant), value as number);
    }

    db.dbus_message_iter_close_container(bp(entry), bp(variant));
    db.dbus_message_iter_close_container(bp(sub), bp(entry));
  }

  db.dbus_message_iter_close_container(iter, bp(sub));
}

// ── Connection ─────────────────────────────────────────────────────

interface DBusConn {
  conn: bigint;
  uniqueName: string;
}

function dbusConnect(): DBusConn | null {
  const err = allocError();
  const conn = db.dbus_bus_get_private(DBUS_BUS_SESSION, bp(err));
  if (conn === 0n || db.dbus_error_is_set(bp(err))) {
    db.dbus_error_free(bp(err));
    return null;
  }
  const namePtr = db.dbus_bus_get_unique_name(conn);
  const uniqueName = readCString(namePtr);
  return { conn, uniqueName };
}

// ── Portal helpers ─────────────────────────────────────────────────

const PORTAL_DEST = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";

function requestPath(uniqueName: string, token: string): string {
  const sender = uniqueName.replace(/\./g, "_").replace(/:/g, "");
  return `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
}

function addMatch(conn: DBusConn, rule: string): void {
  const err = allocError();
  const ruleBuf = cstr(rule);
  db.dbus_bus_add_match(conn.conn, bp(ruleBuf), bp(err));
  db.dbus_connection_flush(conn.conn);
  db.dbus_error_free(bp(err));
}

function waitForResponse(conn: DBusConn, reqPath: string): bigint {
  for (let i = 0; i < 200; i++) {
    if (!db.dbus_connection_read_write(conn.conn, 5000)) return 0n;
    let msg = db.dbus_connection_pop_message(conn.conn);
    while (msg !== 0n) {
      const type_ = db.dbus_message_get_type(msg);
      if (type_ === DBUS_MESSAGE_TYPE_SIGNAL) {
        const path = readCString(db.dbus_message_get_path(msg));
        const member = readCString(db.dbus_message_get_member(msg));
        if (path === reqPath && member === "Response") {
          return msg; // caller must unref
        }
      }
      db.dbus_message_unref(msg);
      msg = db.dbus_connection_pop_message(conn.conn);
    }
  }
  return 0n;
}

function portalCall(
  conn: DBusConn, iface: string, method: string,
  args: (iter: bigint) => void, token: string,
): bigint {
  const reqPath = requestPath(conn.uniqueName, token);
  addMatch(conn, `type='signal',sender='${PORTAL_DEST}',interface='org.freedesktop.portal.Request',member='Response',path='${reqPath}'`);

  const destBuf = cstr(PORTAL_DEST);
  const pathBuf = cstr(PORTAL_PATH);
  const ifaceBuf = cstr(iface);
  const methodBuf = cstr(method);
  const msg = db.dbus_message_new_method_call(bp(destBuf), bp(pathBuf), bp(ifaceBuf), bp(methodBuf));
  if (msg === 0n) return 0n;

  const iter = allocIter();
  db.dbus_message_iter_init_append(msg, bp(iter));
  args(bp(iter));

  const err = allocError();
  const reply = db.dbus_connection_send_with_reply_and_block(conn.conn, msg, 30000, bp(err));
  db.dbus_message_unref(msg);
  if (reply !== 0n) db.dbus_message_unref(reply);
  db.dbus_error_free(bp(err));

  return waitForResponse(conn, reqPath);
}

// ── Iterator reading helpers ───────────────────────────────────────

function iterGetUint32(iter: bigint): number {
  const buf = new Uint32Array(1);
  db.dbus_message_iter_get_basic(iter, bp(new Uint8Array(buf.buffer)));
  return buf[0];
}

function iterGetInt32(iter: bigint): number {
  const buf = new Int32Array(1);
  db.dbus_message_iter_get_basic(iter, bp(new Uint8Array(buf.buffer)));
  return buf[0];
}

function iterGetString(iter: bigint): string {
  const ptrBuf = new BigInt64Array(1);
  db.dbus_message_iter_get_basic(iter, bp(new Uint8Array(ptrBuf.buffer)));
  return readCString(ptrBuf[0]);
}

function iterGetFd(iter: bigint): number {
  const buf = new Int32Array(1);
  db.dbus_message_iter_get_basic(iter, bp(new Uint8Array(buf.buffer)));
  return buf[0];
}

function getResponseCode(msg: bigint): number {
  const iter = allocIter();
  if (!db.dbus_message_iter_init(msg, bp(iter))) return -1;
  if (db.dbus_message_iter_get_arg_type(bp(iter)) !== DBUS_TYPE_UINT32) return -1;
  return iterGetUint32(bp(iter));
}

function getResponseDict(msg: bigint): Map<string, any> {
  const result = new Map<string, any>();
  const iter = allocIter();
  if (!db.dbus_message_iter_init(msg, bp(iter))) return result;
  // skip response code
  db.dbus_message_iter_next(bp(iter));
  if (db.dbus_message_iter_get_arg_type(bp(iter)) !== DBUS_TYPE_ARRAY) return result;

  const arrayIter = allocIter();
  db.dbus_message_iter_recurse(bp(iter), bp(arrayIter));

  while (db.dbus_message_iter_get_arg_type(bp(arrayIter)) !== DBUS_TYPE_INVALID) {
    const entryIter = allocIter();
    db.dbus_message_iter_recurse(bp(arrayIter), bp(entryIter));
    if (db.dbus_message_iter_get_arg_type(bp(entryIter)) !== DBUS_TYPE_STRING) {
      db.dbus_message_iter_next(bp(arrayIter));
      continue;
    }
    const key = iterGetString(bp(entryIter));
    db.dbus_message_iter_next(bp(entryIter));

    if (db.dbus_message_iter_get_arg_type(bp(entryIter)) === DBUS_TYPE_VARIANT) {
      const varIter = allocIter();
      db.dbus_message_iter_recurse(bp(entryIter), bp(varIter));
      const vtype = db.dbus_message_iter_get_arg_type(bp(varIter));
      if (vtype === DBUS_TYPE_STRING || vtype === DBUS_TYPE_OBJECT_PATH) {
        result.set(key, iterGetString(bp(varIter)));
      } else if (vtype === DBUS_TYPE_UINT32) {
        result.set(key, iterGetUint32(bp(varIter)));
      } else if (vtype === DBUS_TYPE_ARRAY) {
        result.set(key, readArray(bp(varIter)));
      }
    }
    db.dbus_message_iter_next(bp(arrayIter));
  }
  return result;
}

function readArray(iter: bigint): any[] {
  const result: any[] = [];
  const sub = allocIter();
  db.dbus_message_iter_recurse(iter, bp(sub));
  while (db.dbus_message_iter_get_arg_type(bp(sub)) !== DBUS_TYPE_INVALID) {
    const type_ = db.dbus_message_iter_get_arg_type(bp(sub));
    if (type_ === DBUS_TYPE_STRING || type_ === DBUS_TYPE_OBJECT_PATH) {
      result.push(iterGetString(bp(sub)));
    } else if (type_ === DBUS_TYPE_UINT32) {
      result.push(iterGetUint32(bp(sub)));
    } else if (type_ === DBUS_TYPE_INT32) {
      result.push(iterGetInt32(bp(sub)));
    } else if (type_ === 0x72) { // struct 'r'
      result.push(readStruct(bp(sub)));
    } else if (type_ === DBUS_TYPE_ARRAY) {
      result.push(readArray(bp(sub)));
    } else if (type_ === DBUS_TYPE_VARIANT) {
      const varIter = allocIter();
      db.dbus_message_iter_recurse(bp(sub), bp(varIter));
      const vtype = db.dbus_message_iter_get_arg_type(bp(varIter));
      if (vtype === DBUS_TYPE_STRING) result.push(iterGetString(bp(varIter)));
      else if (vtype === DBUS_TYPE_UINT32) result.push(iterGetUint32(bp(varIter)));
      else if (vtype === DBUS_TYPE_INT32) result.push(iterGetInt32(bp(varIter)));
      else result.push(null);
    } else {
      result.push(null);
    }
    db.dbus_message_iter_next(bp(sub));
  }
  return result;
}

function readStruct(iter: bigint): any[] {
  const result: any[] = [];
  const sub = allocIter();
  db.dbus_message_iter_recurse(iter, bp(sub));
  while (db.dbus_message_iter_get_arg_type(bp(sub)) !== DBUS_TYPE_INVALID) {
    const type_ = db.dbus_message_iter_get_arg_type(bp(sub));
    if (type_ === DBUS_TYPE_STRING || type_ === DBUS_TYPE_OBJECT_PATH) {
      result.push(iterGetString(bp(sub)));
    } else if (type_ === DBUS_TYPE_UINT32) {
      result.push(iterGetUint32(bp(sub)));
    } else if (type_ === DBUS_TYPE_INT32) {
      result.push(iterGetInt32(bp(sub)));
    } else if (type_ === DBUS_TYPE_ARRAY) {
      result.push(readArray(bp(sub)));
    } else if (type_ === DBUS_TYPE_VARIANT) {
      const varIter = allocIter();
      db.dbus_message_iter_recurse(bp(sub), bp(varIter));
      const vtype = db.dbus_message_iter_get_arg_type(bp(varIter));
      if (vtype === DBUS_TYPE_STRING) result.push(iterGetString(bp(varIter)));
      else if (vtype === DBUS_TYPE_UINT32) result.push(iterGetUint32(bp(varIter)));
      else if (vtype === DBUS_TYPE_INT32) result.push(iterGetInt32(bp(varIter)));
      else result.push(null);
    } else {
      result.push(null);
    }
    db.dbus_message_iter_next(bp(sub));
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────

let _counter = 0;

export function portalGetEisFd(): number | null {
  const conn = dbusConnect();
  if (!conn) return null;

  const pid = process.pid;
  const cnt = ++_counter;
  const RD = "org.freedesktop.portal.RemoteDesktop";

  // CreateSession
  const tok1 = `mechatron_${pid}_${cnt}_cs`;
  const sessTok = `mechatron_${pid}_${cnt}_s`;
  const resp1 = portalCall(conn, RD, "CreateSession", (iter) => {
    appendAsv(iter, [
      ["handle_token", "s", tok1],
      ["session_handle_token", "s", sessTok],
    ]);
  }, tok1);
  if (resp1 === 0n || getResponseCode(resp1) !== 0) {
    if (resp1 !== 0n) db.dbus_message_unref(resp1);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  const dict1 = getResponseDict(resp1);
  db.dbus_message_unref(resp1);
  const sessHandle = dict1.get("session_handle") as string;
  if (!sessHandle) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  // SelectDevices
  const tok2 = `mechatron_${pid}_${cnt}_sd`;
  const resp2 = portalCall(conn, RD, "SelectDevices", (iter) => {
    appendObjectPath(iter, sessHandle);
    appendAsv(iter, [
      ["handle_token", "s", tok2],
      ["types", "u", 3],
    ]);
  }, tok2);
  if (resp2 === 0n || getResponseCode(resp2) !== 0) {
    if (resp2 !== 0n) db.dbus_message_unref(resp2);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  db.dbus_message_unref(resp2);

  // Start
  const tok3 = `mechatron_${pid}_${cnt}_st`;
  const resp3 = portalCall(conn, RD, "Start", (iter) => {
    appendObjectPath(iter, sessHandle);
    appendString(iter, "");
    appendAsv(iter, [["handle_token", "s", tok3]]);
  }, tok3);
  if (resp3 === 0n || getResponseCode(resp3) !== 0) {
    if (resp3 !== 0n) db.dbus_message_unref(resp3);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  db.dbus_message_unref(resp3);

  // ConnectToEIS — direct method call, fd in reply
  const destBuf = cstr(PORTAL_DEST);
  const pathBuf = cstr(PORTAL_PATH);
  const ifaceBuf = cstr(RD);
  const methodBuf = cstr("ConnectToEIS");
  const eisMsg = db.dbus_message_new_method_call(bp(destBuf), bp(pathBuf), bp(ifaceBuf), bp(methodBuf));
  if (eisMsg === 0n) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  const eisIter = allocIter();
  db.dbus_message_iter_init_append(eisMsg, bp(eisIter));
  appendObjectPath(bp(eisIter), sessHandle);
  appendAsv(bp(eisIter), []);

  const err = allocError();
  const eisReply = db.dbus_connection_send_with_reply_and_block(conn.conn, eisMsg, 30000, bp(err));
  db.dbus_message_unref(eisMsg);
  db.dbus_error_free(bp(err));

  if (eisReply === 0n) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  const fdIter = allocIter();
  if (!db.dbus_message_iter_init(eisReply, bp(fdIter)) ||
      db.dbus_message_iter_get_arg_type(bp(fdIter)) !== DBUS_TYPE_UNIX_FD) {
    db.dbus_message_unref(eisReply);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  const fd = iterGetFd(bp(fdIter));
  db.dbus_message_unref(eisReply);

  // Intentionally leak conn — portal session must stay alive.
  return fd;
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

  const pid = process.pid;
  const cnt = ++_counter;
  const SC = "org.freedesktop.portal.ScreenCast";

  // CreateSession
  const tok1 = `mechatron_${pid}_${cnt}_scs`;
  const sessTok = `mechatron_${pid}_${cnt}_ss`;
  const resp1 = portalCall(conn, SC, "CreateSession", (iter) => {
    appendAsv(iter, [
      ["handle_token", "s", tok1],
      ["session_handle_token", "s", sessTok],
    ]);
  }, tok1);
  if (resp1 === 0n || getResponseCode(resp1) !== 0) {
    if (resp1 !== 0n) db.dbus_message_unref(resp1);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  const dict1 = getResponseDict(resp1);
  db.dbus_message_unref(resp1);
  const sessHandle = dict1.get("session_handle") as string;
  if (!sessHandle) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  // SelectSources
  const tok2 = `mechatron_${pid}_${cnt}_ss2`;
  const entries: [string, string, any][] = [
    ["handle_token", "s", tok2],
    ["types", "u", 1],
    ["persist_mode", "u", 2],
  ];
  if (restoreToken) entries.push(["restore_token", "s", restoreToken]);
  const resp2 = portalCall(conn, SC, "SelectSources", (iter) => {
    appendObjectPath(iter, sessHandle);
    appendAsv(iter, entries);
  }, tok2);
  if (resp2 === 0n || getResponseCode(resp2) !== 0) {
    if (resp2 !== 0n) db.dbus_message_unref(resp2);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  db.dbus_message_unref(resp2);

  // Start
  const tok3 = `mechatron_${pid}_${cnt}_st`;
  const resp3 = portalCall(conn, SC, "Start", (iter) => {
    appendObjectPath(iter, sessHandle);
    appendString(iter, "");
    appendAsv(iter, [["handle_token", "s", tok3]]);
  }, tok3);
  if (resp3 === 0n || getResponseCode(resp3) !== 0) {
    if (resp3 !== 0n) db.dbus_message_unref(resp3);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  const results = getResponseDict(resp3);
  db.dbus_message_unref(resp3);

  let nodeId = 0, width = 1920, height = 1080;
  let newToken: string | null = null;

  const streams = results.get("streams");
  if (Array.isArray(streams) && streams.length > 0) {
    const first = streams[0];
    if (Array.isArray(first) && first.length >= 1) {
      nodeId = first[0] as number;
      if (Array.isArray(first[1])) {
        findSize(first[1], (w, h) => { width = w; height = h; });
      }
    }
  }

  const tok = results.get("restore_token") as string | undefined;
  if (tok) newToken = tok;
  if (nodeId === 0) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  // OpenPipeWireRemote
  const destBuf = cstr(PORTAL_DEST);
  const pathBuf = cstr(PORTAL_PATH);
  const ifaceBuf = cstr(SC);
  const methodBuf = cstr("OpenPipeWireRemote");
  const pwMsg = db.dbus_message_new_method_call(bp(destBuf), bp(pathBuf), bp(ifaceBuf), bp(methodBuf));
  if (pwMsg === 0n) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  const pwIter = allocIter();
  db.dbus_message_iter_init_append(pwMsg, bp(pwIter));
  appendObjectPath(bp(pwIter), sessHandle);
  appendAsv(bp(pwIter), []);

  const err = allocError();
  const pwReply = db.dbus_connection_send_with_reply_and_block(conn.conn, pwMsg, 30000, bp(err));
  db.dbus_message_unref(pwMsg);
  db.dbus_error_free(bp(err));

  if (pwReply === 0n) {
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }

  const fdIter = allocIter();
  if (!db.dbus_message_iter_init(pwReply, bp(fdIter)) ||
      db.dbus_message_iter_get_arg_type(bp(fdIter)) !== DBUS_TYPE_UNIX_FD) {
    db.dbus_message_unref(pwReply);
    db.dbus_connection_close(conn.conn);
    db.dbus_connection_unref(conn.conn);
    return null;
  }
  const pwFd = iterGetFd(bp(fdIter));
  db.dbus_message_unref(pwReply);

  // Intentionally leak conn — session must stay alive.
  return { pwFd, nodeId, width, height, restoreToken: newToken };
}

function findSize(data: any, cb: (w: number, h: number) => void): void {
  if (!Array.isArray(data)) return;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === "size" && i + 1 < data.length) {
      const sizeVal = data[i + 1];
      if (Array.isArray(sizeVal) && sizeVal.length >= 2) {
        cb(sizeVal[0] as number, sizeVal[1] as number);
        return;
      }
    }
    if (Array.isArray(data[i])) findSize(data[i], cb);
  }
}
