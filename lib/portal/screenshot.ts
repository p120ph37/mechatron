/**
 * org.freedesktop.portal.Screenshot — single-frame screen capture.
 *
 * Uses the Screenshot portal to take a non-interactive screenshot,
 * decode the resulting PNG, and return raw ARGB pixel data.  Simpler
 * than ScreenCast + PipeWire but creates a temp file per capture.
 *
 * For monitor enumeration, queries org.gnome.Mutter.DisplayConfig
 * on GNOME, with a single-screen fallback on other compositors.
 */

import { readFileSync, unlinkSync } from "fs";
// @ts-ignore -- pngjs lacks type declarations
import { PNG } from "pngjs";
import { DBusConnection } from "../dbus/connection";
import { waitForResponse, requestPath } from "./util";

const PORTAL_DEST = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";
const SCREENSHOT_IFACE = "org.freedesktop.portal.Screenshot";

interface ScreenRect { x: number; y: number; w: number; h: number; }
export interface PortalScreenInfo {
  bounds: ScreenRect;
  usable: ScreenRect;
}

let _conn: DBusConnection | null = null;
let _connPromise: Promise<DBusConnection> | null = null;
let _shotSeq = 0;

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

export async function portalScreenshot(): Promise<Uint32Array & { width: number; height: number } | null> {
  const conn = await getConn();
  const token = `mechatron_shot_${process.pid}_${++_shotSeq}`;
  const reqPath = requestPath(conn, token);
  const responsePromise = waitForResponse(conn, reqPath);

  const options: Record<string, [string, any]> = {
    "handle_token": ["s", token],
    "modal": ["b", false],
    "interactive": ["b", false],
  };

  await conn.call({
    path: PORTAL_PATH,
    interface: SCREENSHOT_IFACE,
    member: "Screenshot",
    destination: PORTAL_DEST,
    signature: "sa{sv}",
    body: ["", options],
  });

  const results = await responsePromise;
  const uri = results.get("uri") as string | undefined;
  if (!uri) return null;

  const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;

  try {
    const buf = readFileSync(filePath);
    const png = PNG.sync.read(buf);

    const pixels = new Uint32Array(png.width * png.height) as Uint32Array & { width: number; height: number };
    pixels.width = png.width;
    pixels.height = png.height;

    // Convert RGBA → ARGB
    for (let i = 0; i < png.width * png.height; i++) {
      const r = png.data[i * 4];
      const g = png.data[i * 4 + 1];
      const b = png.data[i * 4 + 2];
      const a = png.data[i * 4 + 3];
      pixels[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }

    return pixels;
  } finally {
    try { unlinkSync(filePath); } catch {}
  }
}

export async function portalGetMonitors(): Promise<PortalScreenInfo[] | null> {
  try {
    const conn = await getConn();

    // Try GNOME Mutter DisplayConfig first
    const reply = await conn.call({
      path: "/org/gnome/Mutter/DisplayConfig",
      interface: "org.gnome.Mutter.DisplayConfig",
      member: "GetCurrentState",
      destination: "org.gnome.Mutter.DisplayConfig",
    });

    // Response: (serial, monitors[], logical_monitors[], properties)
    // logical_monitors[]: (x, y, scale, transform, primary, monitors[], properties)
    const logicalMonitors = reply.body[2] as any[];
    if (!logicalMonitors || logicalMonitors.length === 0) return null;

    const screens: PortalScreenInfo[] = [];
    for (const lm of logicalMonitors) {
      const x = lm[0] as number;
      const y = lm[1] as number;
      const scale = lm[2] as number;
      const primary = lm[4] as boolean;

      // Get the first monitor's mode dimensions for this logical monitor
      const monitorRefs = lm[5] as any[];
      if (!monitorRefs || monitorRefs.length === 0) continue;

      // Find the monitor's current mode from the monitors array
      const monitors = reply.body[1] as any[];
      const connector = monitorRefs[0]?.[0] as string;
      let w = 0, h = 0;
      for (const mon of monitors) {
        const monSpec = mon[0] as any[];
        if (monSpec[0] === connector) {
          const modes = mon[1] as any[];
          for (const mode of modes) {
            const props = mode[6] as Map<string, any> | Record<string, any>;
            const isCurrent = props instanceof Map ? props.get("is-current") : (props as any)?.["is-current"];
            if (isCurrent) {
              w = Math.round((mode[1] as number) / scale);
              h = Math.round((mode[2] as number) / scale);
              break;
            }
          }
          break;
        }
      }

      if (w === 0 || h === 0) continue;

      const bounds: ScreenRect = { x, y, w, h };
      const info: PortalScreenInfo = { bounds, usable: bounds };
      if (primary) {
        screens.unshift(info);
      } else {
        screens.push(info);
      }
    }

    return screens.length > 0 ? screens : null;
  } catch {
    return null;
  }
}

export function resetScreenshotConn(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  _connPromise = null;
}
