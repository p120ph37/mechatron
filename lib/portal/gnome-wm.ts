/**
 * D-Bus client for the Mechatron GNOME Shell extension
 * (dev.mechatronic.WindowManager).
 *
 * Provides full window management on Wayland/GNOME: list, activate,
 * close, move/resize, minimize/maximize/above, get PID, etc.
 *
 * All methods except Ping require a bearer token. Set the token via
 * gnomeWmSetToken() before calling any other method.
 */

import { DBusConnection, DBusError } from "../dbus/connection";

const BUS_NAME = "dev.mechatronic.WindowManager";
const OBJECT_PATH = "/dev/mechatronic/WindowManager";
const IFACE = "dev.mechatronic.WindowManager";

export interface GnomeWindowInfo {
  id: number;
  title: string;
  pid: number;
  wmClass: string;
  bounds: { x: number; y: number; w: number; h: number };
  client: { x: number; y: number; w: number; h: number };
  minimized: boolean;
  maximized: boolean;
  above: boolean;
  valid: boolean;
}

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;
let _available: boolean | undefined;
// Default to MECHATRON_GNOME_TOKEN env if set — convenient for CI / tests
// where the bearer token is provisioned outside the app and threaded in
// via the environment. Explicit gnomeWmSetToken() always wins.
let _token: string = process.env.MECHATRON_GNOME_TOKEN || "";

export function gnomeWmSetToken(token: string): void {
  _token = token;
}

export function gnomeWmGetToken(): string {
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

function authedCall(member: string, signature?: string, body?: any[]): Promise<any[]> {
  const sig = signature ? "s" + signature : "s";
  const args = body ? [_token, ...body] : [_token];
  return call(member, sig, args);
}

export async function gnomeWmAvailable(): Promise<boolean> {
  if (_available !== undefined) return _available;
  try {
    const result = await call("Ping");
    _available = result[0] === true;
  } catch {
    _available = false;
  }
  return _available;
}

export async function gnomeWmList(): Promise<GnomeWindowInfo[]> {
  const result = await authedCall("List");
  return JSON.parse(result[0] as string);
}

export async function gnomeWmGetActive(): Promise<number> {
  const result = await authedCall("GetActive");
  return result[0] as number;
}

export async function gnomeWmActivate(id: number): Promise<boolean> {
  const result = await authedCall("Activate", "u", [id]);
  return result[0] as boolean;
}

export async function gnomeWmClose(id: number): Promise<boolean> {
  const result = await authedCall("Close", "u", [id]);
  return result[0] as boolean;
}

export async function gnomeWmGetTitle(id: number): Promise<string> {
  const result = await authedCall("GetTitle", "u", [id]);
  return result[0] as string;
}

export async function gnomeWmGetBounds(id: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const result = await authedCall("GetBounds", "u", [id]);
  return JSON.parse(result[0] as string);
}

export async function gnomeWmSetBounds(id: number, x: number, y: number, w: number, h: number): Promise<boolean> {
  const result = await authedCall("SetBounds", "uiiii", [id, x, y, w, h]);
  return result[0] as boolean;
}

export async function gnomeWmGetClient(id: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const result = await authedCall("GetClient", "u", [id]);
  return JSON.parse(result[0] as string);
}

export async function gnomeWmSetMinimized(id: number, minimized: boolean): Promise<boolean> {
  const result = await authedCall("SetMinimized", "ub", [id, minimized]);
  return result[0] as boolean;
}

export async function gnomeWmSetMaximized(id: number, maximized: boolean): Promise<boolean> {
  const result = await authedCall("SetMaximized", "ub", [id, maximized]);
  return result[0] as boolean;
}

export async function gnomeWmSetAbove(id: number, above: boolean): Promise<boolean> {
  const result = await authedCall("SetAbove", "ub", [id, above]);
  return result[0] as boolean;
}

export async function gnomeWmIsMinimized(id: number): Promise<boolean> {
  const result = await authedCall("IsMinimized", "u", [id]);
  return result[0] as boolean;
}

export async function gnomeWmIsMaximized(id: number): Promise<boolean> {
  const result = await authedCall("IsMaximized", "u", [id]);
  return result[0] as boolean;
}

export async function gnomeWmIsAbove(id: number): Promise<boolean> {
  const result = await authedCall("IsAbove", "u", [id]);
  return result[0] as boolean;
}

export async function gnomeWmGetPID(id: number): Promise<number> {
  const result = await authedCall("GetPID", "u", [id]);
  return result[0] as number;
}

export function resetGnomeWm(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
  _available = undefined;
}
