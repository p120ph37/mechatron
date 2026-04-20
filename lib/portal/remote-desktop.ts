/**
 * org.freedesktop.portal.RemoteDesktop — Wayland input injection.
 *
 * Creates a portal session and uses NotifyKeyboardKeysym,
 * NotifyPointerButton, NotifyPointerMotionAbsolute, and
 * NotifyPointerAxisDiscrete for synthetic input events.
 *
 * The session startup shows a permission dialog on first use.
 * On mutter --headless (CI), the dialog is auto-approved.
 *
 * References:
 *   https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html
 */

import { existsSync } from "fs";
import { DBusConnection } from "../dbus/connection";

const PORTAL_DEST = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";
const RD_IFACE = "org.freedesktop.portal.RemoteDesktop";
const REQUEST_IFACE = "org.freedesktop.portal.Request";

const DEVICE_KEYBOARD = 1;
const DEVICE_POINTER = 2;

// Portal response codes
const RESPONSE_OK = 0;

export interface RemoteDesktopSession {
  conn: DBusConnection;
  sessionPath: string;
}

let _session: RemoteDesktopSession | null = null;
let _sessionPromise: Promise<RemoteDesktopSession> | null = null;

export function remoteDesktopAvailable(): boolean {
  if (process.platform !== "linux") return false;
  const wayland = !!process.env.WAYLAND_DISPLAY
    || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
  const hasBus = !!process.env.DBUS_SESSION_BUS_ADDRESS
    || (() => {
      const uid = process.getuid?.();
      if (typeof uid !== "number") return false;
      return existsSync(`/run/user/${uid}/bus`);
    })();
  return wayland && hasBus;
}

async function waitForResponse(conn: DBusConnection, requestPath: string): Promise<Map<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("portal response timeout (30s)"));
    }, 30000);

    const unsub = conn.onSignal((msg) => {
      if (msg.path === requestPath && msg.member === "Response") {
        clearTimeout(timer);
        unsub();
        const responseCode = msg.body[0] as number;
        const results = msg.body[1] as Map<string, any>;
        if (responseCode !== RESPONSE_OK) {
          reject(new Error(`portal denied (response=${responseCode})`));
        } else {
          resolve(results);
        }
      }
    });
  });
}

function requestPath(conn: DBusConnection, token: string): string {
  const sender = conn.getUniqueName().replace(/^:/, "").replace(/\./g, "_");
  return `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
}

async function createSession(conn: DBusConnection): Promise<RemoteDesktopSession> {
  const token = `mechatron_${process.pid}_${Date.now()}`;
  const sessionToken = `mechatron_session_${process.pid}`;
  const reqPath = requestPath(conn, token);

  const responsePromise = waitForResponse(conn, reqPath);

  const options: Record<string, [string, any]> = {
    "handle_token": ["s", token],
    "session_handle_token": ["s", sessionToken],
  };

  await conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "CreateSession",
    destination: PORTAL_DEST,
    signature: "a{sv}",
    body: [options],
  });

  const results = await responsePromise;
  const sessionPath = results.get("session_handle") as string;
  if (!sessionPath) throw new Error("portal: no session_handle in CreateSession response");

  // SelectDevices
  const selToken = `mechatron_sel_${process.pid}_${Date.now()}`;
  const selReqPath = requestPath(conn, selToken);
  const selResponse = waitForResponse(conn, selReqPath);

  const selOptions: Record<string, [string, any]> = {
    "handle_token": ["s", selToken],
    "types": ["u", DEVICE_KEYBOARD | DEVICE_POINTER],
  };

  await conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "SelectDevices",
    destination: PORTAL_DEST,
    signature: "oa{sv}",
    body: [sessionPath, selOptions],
  });

  await selResponse;

  // Start
  const startToken = `mechatron_start_${process.pid}_${Date.now()}`;
  const startReqPath = requestPath(conn, startToken);
  const startResponse = waitForResponse(conn, startReqPath);

  const startOptions: Record<string, [string, any]> = {
    "handle_token": ["s", startToken],
  };

  await conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "Start",
    destination: PORTAL_DEST,
    signature: "osa{sv}",
    body: [sessionPath, "", startOptions],
  });

  await startResponse;

  return { conn, sessionPath };
}

export async function getSession(): Promise<RemoteDesktopSession> {
  if (_session) return _session;
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    const conn = await DBusConnection.connect();
    try {
      const session = await createSession(conn);
      _session = session;
      return session;
    } catch (e) {
      conn.close();
      throw e;
    }
  })();
  try {
    return await _sessionPromise;
  } catch (e) {
    _sessionPromise = null;
    throw e;
  }
}

// ─── Input injection ───────────────────────────────────────────────

export async function notifyKeyboardKeysym(keysym: number, pressed: boolean): Promise<void> {
  const s = await getSession();
  const state = pressed ? 1 : 0;
  await s.conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "NotifyKeyboardKeysym",
    destination: PORTAL_DEST,
    signature: "oa{sv}iu",
    body: [s.sessionPath, {}, keysym, state],
    noReply: true,
  });
}

export async function notifyPointerButton(button: number, pressed: boolean): Promise<void> {
  const s = await getSession();
  const state = pressed ? 1 : 0;
  await s.conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "NotifyPointerButton",
    destination: PORTAL_DEST,
    signature: "oa{sv}iu",
    body: [s.sessionPath, {}, button, state],
    noReply: true,
  });
}

export async function notifyPointerMotionAbsolute(streamId: number, x: number, y: number): Promise<void> {
  const s = await getSession();
  await s.conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "NotifyPointerMotionAbsolute",
    destination: PORTAL_DEST,
    signature: "oa{sv}udd",
    body: [s.sessionPath, {}, streamId, x, y],
    noReply: true,
  });
}

export async function notifyPointerMotion(dx: number, dy: number): Promise<void> {
  const s = await getSession();
  await s.conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "NotifyPointerMotion",
    destination: PORTAL_DEST,
    signature: "oa{sv}dd",
    body: [s.sessionPath, {}, dx, dy],
    noReply: true,
  });
}

export async function notifyPointerAxisDiscrete(axis: number, steps: number): Promise<void> {
  const s = await getSession();
  await s.conn.call({
    path: PORTAL_PATH,
    interface: RD_IFACE,
    member: "NotifyPointerAxisDiscrete",
    destination: PORTAL_DEST,
    signature: "oa{sv}ui",
    body: [s.sessionPath, {}, axis, steps],
    noReply: true,
  });
}

export function resetSession(): void {
  if (_session) {
    _session.conn.close();
    _session = null;
  }
  _sessionPromise = null;
}
