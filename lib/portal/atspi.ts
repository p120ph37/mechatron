/**
 * AT-SPI2 read-only window enumeration fallback.
 *
 * Uses the accessibility bus (org.a11y.atspi) to list windows and
 * read their properties. This works on GNOME, KDE, and most other
 * Linux desktops regardless of Wayland/X11.
 *
 * Limitations: read-only. Cannot activate, close, move, resize,
 * or change window state. Suitable as a universal fallback for
 * window enumeration when the GNOME extension is not installed.
 */

import { DBusConnection, DBusError } from "../dbus/connection";
import { existsSync } from "fs";

const ATSPI_BUS_NAME = "org.a11y.atspi.Registry";
const ATSPI_REG_PATH = "/org/a11y/atspi/accessible/root";
const ATSPI_ACCESSIBLE = "org.a11y.atspi.Accessible";
const ATSPI_COMPONENT = "org.a11y.atspi.Component";
const ATSPI_APPLICATION = "org.a11y.atspi.Application";

const ROLE_FRAME = 22;
const ROLE_DIALOG = 23;

export interface AtSpiWindowInfo {
  bus: string;
  path: string;
  name: string;
  role: number;
  pid: number;
  bounds: { x: number; y: number; w: number; h: number };
}

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;

async function getAtSpiBusAddress(): Promise<string | null> {
  const addr = process.env.AT_SPI_BUS_ADDRESS;
  if (addr) return addr;

  try {
    const sessionConn = await DBusConnection.connect();
    try {
      const reply = await sessionConn.call({
        path: "/org/a11y/bus",
        interface: "org.a11y.Bus",
        member: "GetAddress",
        destination: "org.a11y.Bus",
      });
      return reply.body[0] as string;
    } finally {
      sessionConn.close();
    }
  } catch {
    return null;
  }
}

async function getConn(): Promise<DBusConnection> {
  if (_conn) return _conn;
  if (_connPromise) return _connPromise;
  _connPromise = (async () => {
    const addr = await getAtSpiBusAddress();
    if (!addr) throw new Error("AT-SPI bus not available");
    return DBusConnection.connect(addr);
  })();
  try {
    _conn = await _connPromise;
    return _conn;
  } catch (e) {
    _connPromise = null;
    throw e;
  }
}

export async function atspiAvailable(): Promise<boolean> {
  try {
    const conn = await getConn();
    await conn.call({
      path: ATSPI_REG_PATH,
      interface: ATSPI_ACCESSIBLE,
      member: "GetChildCount",
      destination: ATSPI_BUS_NAME,
    });
    return true;
  } catch {
    return false;
  }
}

export async function atspiListWindows(): Promise<AtSpiWindowInfo[]> {
  const conn = await getConn();
  const windows: AtSpiWindowInfo[] = [];

  const appCountReply = await conn.call({
    path: ATSPI_REG_PATH,
    interface: ATSPI_ACCESSIBLE,
    member: "GetChildCount",
    destination: ATSPI_BUS_NAME,
  });
  const appCount = appCountReply.body[0] as number;

  for (let i = 0; i < appCount; i++) {
    try {
      const childReply = await conn.call({
        path: ATSPI_REG_PATH,
        interface: ATSPI_ACCESSIBLE,
        member: "GetChildAtIndex",
        destination: ATSPI_BUS_NAME,
        signature: "i",
        body: [i],
      });

      const [appBus, appPath] = childReply.body[0] as [string, string];
      if (!appBus || appBus === "") continue;

      let pid = 0;
      try {
        const pidReply = await conn.call({
          path: appPath,
          interface: ATSPI_APPLICATION,
          member: "GetProcessId",
          destination: appBus,
        });
        pid = pidReply.body[0] as number;
      } catch {}

      const winCountReply = await conn.call({
        path: appPath,
        interface: ATSPI_ACCESSIBLE,
        member: "GetChildCount",
        destination: appBus,
      });
      const winCount = winCountReply.body[0] as number;

      for (let j = 0; j < winCount; j++) {
        try {
          const winChildReply = await conn.call({
            path: appPath,
            interface: ATSPI_ACCESSIBLE,
            member: "GetChildAtIndex",
            destination: appBus,
            signature: "i",
            body: [j],
          });

          const [winBus, winPath] = winChildReply.body[0] as [string, string];

          const roleReply = await conn.call({
            path: winPath,
            interface: ATSPI_ACCESSIBLE,
            member: "GetRole",
            destination: winBus,
          });
          const role = roleReply.body[0] as number;

          if (role !== ROLE_FRAME && role !== ROLE_DIALOG) continue;

          const nameReply = await conn.call({
            path: winPath,
            interface: ATSPI_ACCESSIBLE,
            member: "GetName",
            destination: winBus,
          });
          const name = (nameReply.body[0] as string) || "";

          let bounds = { x: 0, y: 0, w: 0, h: 0 };
          try {
            const extReply = await conn.call({
              path: winPath,
              interface: ATSPI_COMPONENT,
              member: "GetExtents",
              destination: winBus,
              signature: "u",
              body: [0],
            });
            const ext = extReply.body[0] as [number, number, number, number];
            bounds = { x: ext[0], y: ext[1], w: ext[2], h: ext[3] };
          } catch {}

          windows.push({ bus: winBus, path: winPath, name, role, pid, bounds });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return windows;
}

export function resetAtSpi(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
}
