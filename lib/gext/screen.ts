/**
 * D-Bus client for the Mechatron GNOME Shell extension
 * (dev.mechatronic.Shell — Screen interface).
 *
 * Provides screen capture on Wayland/GNOME via Shell.Screenshot inside
 * the compositor.  The image stays in a Gio.MemoryOutputStream — no
 * file-on-disk step — and travels over D-Bus as PNG bytes, which the
 * nolib facade decodes back to the standard ARGB pixel array.
 *
 * Compared with napi[portal]: no popup, no PipeWire session set-up cost,
 * no fixed-rate framing — each grab is its own one-shot call.  Compared
 * with the xdg-desktop-portal Screenshot path that nolib/portal/screenshot.ts
 * uses: no file-system round trip.
 *
 * Shares bearer-token auth with the other Shell interfaces.
 */

import { DBusConnection } from "../dbus/connection";

const BUS_NAME = "dev.mechatronic.Shell";
const OBJECT_PATH = "/dev/mechatronic/Shell";
const IFACE = "dev.mechatronic.Shell.Screen";

export interface GextMonitorInfo {
  bounds: { x: number; y: number; w: number; h: number };
  usable: { x: number; y: number; w: number; h: number };
}

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;
let _available: boolean | undefined;
let _token: string = process.env.MECHATRON_GNOME_TOKEN || "";

export function gextScrSetToken(token: string): void { _token = token; }
export function gextScrGetToken(): string { return _token; }

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

export async function gextScrAvailable(): Promise<boolean> {
  if (_available !== undefined) return _available;
  try {
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

export async function gextScrSynchronize(): Promise<GextMonitorInfo[]> {
  const result = await call("Synchronize", "s", [_token]);
  return JSON.parse(result[0] as string) as GextMonitorInfo[];
}

export async function gextScrGrab(x: number, y: number, w: number, h: number): Promise<Buffer> {
  const result = await call("GrabScreen", "siiii", [_token, x, y, w, h]);
  const raw = result[0];
  if (raw instanceof Buffer) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.from(raw);
  return Buffer.alloc(0);
}

export function resetGextScreen(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
  _available = undefined;
}
