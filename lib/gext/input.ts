/**
 * D-Bus client for the Mechatron GNOME Shell extension
 * (dev.mechatronic.Shell — Input interface).
 *
 * Provides keyboard and pointer input injection on Wayland/GNOME via
 * Clutter virtual devices inside the compositor. No portal permission
 * dialog required — the extension runs inside gnome-shell itself.
 *
 * Shares the same bearer-token auth as the Window interface.
 */

import { DBusConnection } from "../dbus/connection";

const BUS_NAME = "dev.mechatronic.Shell";
const OBJECT_PATH = "/dev/mechatronic/Shell";
const IFACE = "dev.mechatronic.Shell.Input";

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;
let _token: string = process.env.MECHATRON_GNOME_TOKEN || "";

export function gextInputSetToken(token: string): void {
  _token = token;
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

export async function gextKeyboardKeysym(keysym: number, pressed: boolean): Promise<void> {
  await call("KeyboardKeysym", "sub", [_token, keysym, pressed]);
}

export async function gextPointerButton(button: number, pressed: boolean): Promise<void> {
  await call("PointerButton", "sib", [_token, button, pressed]);
}

export async function gextPointerMotionAbsolute(x: number, y: number): Promise<void> {
  await call("PointerMotionAbsolute", "sdd", [_token, x, y]);
}

export async function gextPointerMotion(dx: number, dy: number): Promise<void> {
  await call("PointerMotion", "sdd", [_token, dx, dy]);
}

export async function gextPointerAxisDiscrete(axis: number, steps: number): Promise<void> {
  await call("PointerAxisDiscrete", "sui", [_token, axis, steps]);
}

export async function gextGetPointerPos(): Promise<{ x: number; y: number }> {
  const result = await call("GetPointerPos", "s", [_token]);
  return { x: result[0] as number, y: result[1] as number };
}

export function resetGextInput(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
}
