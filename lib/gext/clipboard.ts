/**
 * D-Bus client for the Mechatron GNOME Shell extension
 * (dev.mechatronic.Shell — Clipboard interface).
 *
 * Provides clipboard read/write on Wayland/GNOME via St.Clipboard inside
 * the compositor. No portal popup, no subprocess (vs nolib[sh]), no
 * libX11 dependency (vs nolib[x11]).
 *
 * Image transport: PNG bytes pass through the wire; the nolib facade
 * encodes/decodes against the Uint32Array ARGB representation that the
 * public Clipboard API exposes.
 *
 * Shares bearer-token auth with the Window/Input interfaces; tokens come
 * from $MECHATRON_GNOME_TOKEN by default.
 */

import { DBusConnection } from "../dbus/connection";

const BUS_NAME = "dev.mechatronic.Shell";
const OBJECT_PATH = "/dev/mechatronic/Shell";
const IFACE = "dev.mechatronic.Shell.Clipboard";

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;
let _available: boolean | undefined;
let _token: string = process.env.MECHATRON_GNOME_TOKEN || "";

export function gextClipSetToken(token: string): void {
  _token = token;
}

export function gextClipGetToken(): string {
  return _token;
}

async function getConn(): Promise<DBusConnection> {
  if (_conn) return _conn;
  if (_connPromise) return _connPromise;
  _connPromise = DBusConnection.connect();
  try {
    _conn = await _connPromise;
    return _conn;
  } catch (e) {
    _connPromise = null;
    throw e;
  }
}

function call(member: string, signature?: string, body?: any[]): Promise<any[]> {
  return getConn().then(conn => conn.call({
    path: OBJECT_PATH,
    interface: IFACE,
    member,
    destination: BUS_NAME,
    signature,
    body,
  })).then(msg => msg.body);
}

export async function gextClipAvailable(): Promise<boolean> {
  if (_available !== undefined) return _available;
  try {
    // Use the Window.Ping endpoint (auth-free) to verify the extension
    // is on the bus before issuing any Clipboard calls.  Avoids needing
    // a separate ClipboardPing — the bus name is shared.
    const conn = await getConn();
    const msg = await conn.call({
      path: OBJECT_PATH,
      interface: "dev.mechatronic.Shell.Window",
      member: "Ping",
      destination: BUS_NAME,
    });
    _available = msg.body[0] === true;
  } catch {
    _available = false;
  }
  return _available;
}

export async function gextClipClear(): Promise<boolean> {
  const result = await call("Clear", "s", [_token]);
  return result[0] as boolean;
}

export async function gextClipHasText(): Promise<boolean> {
  const result = await call("HasText", "s", [_token]);
  return result[0] as boolean;
}

export async function gextClipGetText(): Promise<string> {
  const result = await call("GetText", "s", [_token]);
  return result[0] as string;
}

export async function gextClipSetText(text: string): Promise<boolean> {
  const result = await call("SetText", "ss", [_token, text]);
  return result[0] as boolean;
}

export async function gextClipHasImage(): Promise<boolean> {
  const result = await call("HasImage", "s", [_token]);
  return result[0] as boolean;
}

export async function gextClipGetImage(): Promise<Buffer> {
  const result = await call("GetImage", "s", [_token]);
  const raw = result[0];
  if (raw instanceof Buffer) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.from(raw);
  return Buffer.alloc(0);
}

export async function gextClipSetImage(png: Buffer): Promise<boolean> {
  const result = await call("SetImage", "say", [_token, png]);
  return result[0] as boolean;
}

export async function gextClipGetSequence(): Promise<number> {
  const result = await call("GetSequence", "s", [_token]);
  return result[0] as number;
}

export function resetGextClipboard(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
  _available = undefined;
}
