/**
 * nolib window backend — portal (Wayland) implementation.
 *
 * Layered approach:
 *   1. GNOME Shell extension (dev.mechatronic.WindowManager) — full
 *      window management via Meta.Window API over D-Bus.
 *   2. AT-SPI2 fallback — universal read-only window enumeration.
 *      Cannot activate, close, move, resize, or change state.
 */

import {
  gnomeWmAvailable, gnomeWmList, gnomeWmGetActive, gnomeWmActivate,
  gnomeWmClose, gnomeWmGetTitle, gnomeWmGetBounds, gnomeWmSetBounds,
  gnomeWmGetClient, gnomeWmSetMinimized, gnomeWmSetMaximized,
  gnomeWmSetAbove, gnomeWmIsMinimized, gnomeWmIsMaximized,
  gnomeWmIsAbove, gnomeWmGetPID,
} from "../portal/gnome-wm";

import { atspiListWindows } from "../portal/atspi";

// ── GNOME extension availability cache ──────────────────────────────

let _gnomeAvail: boolean | undefined;
async function hasGnomeExt(): Promise<boolean> {
  if (_gnomeAvail !== undefined) return _gnomeAvail;
  try {
    _gnomeAvail = await gnomeWmAvailable();
  } catch {
    _gnomeAvail = false;
  }
  return _gnomeAvail;
}

// ── Window handle encoding ──────────────────────────────────────────
// GNOME extension uses Meta.Window.get_stable_sequence() as handle (positive u32).
// AT-SPI2 fallback encodes bus+path as an FNV-1a hash with high bit set to avoid collision.

function atspiWindowHash(bus: string, path: string): number {
  let h = 0x811c9dc5;
  const s = bus + path;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) | 0x80000000;
}

// ── Exports ─────────────────────────────────────────────────────────

export async function window_isValid(handle: number): Promise<boolean> {
  if (await hasGnomeExt()) {
    const windows = await gnomeWmList();
    return windows.some(w => w.id === handle);
  }
  return false;
}

export async function window_close(handle: number): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmClose(handle);
  }
}

export async function window_isTopMost(handle: number): Promise<boolean> {
  if (await hasGnomeExt()) return gnomeWmIsAbove(handle);
  return false;
}

export async function window_isBorderless(_handle: number): Promise<boolean> {
  return false;
}

export async function window_isMinimized(handle: number): Promise<boolean> {
  if (await hasGnomeExt()) return gnomeWmIsMinimized(handle);
  return false;
}

export async function window_isMaximized(handle: number): Promise<boolean> {
  if (await hasGnomeExt()) return gnomeWmIsMaximized(handle);
  return false;
}

export async function window_setTopMost(handle: number, topMost: boolean): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmSetAbove(handle, topMost);
  }
}

export async function window_setBorderless(_handle: number, _borderless: boolean): Promise<void> {
}

export async function window_setMinimized(handle: number, minimized: boolean): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmSetMinimized(handle, minimized);
  }
}

export async function window_setMaximized(handle: number, maximized: boolean): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmSetMaximized(handle, maximized);
  }
}

export async function window_getProcess(handle: number): Promise<number> {
  return window_getPID(handle);
}

export async function window_getPID(handle: number): Promise<number> {
  if (await hasGnomeExt()) return gnomeWmGetPID(handle);
  return 0;
}

export function window_getHandle(handle: number): number { return handle; }

export async function window_setHandle(_handle: number, newHandle: number): Promise<boolean> {
  if (newHandle === 0) return true;
  return window_isValid(newHandle);
}

export async function window_getTitle(handle: number): Promise<string> {
  if (await hasGnomeExt()) return gnomeWmGetTitle(handle);
  return "";
}

export async function window_setTitle(_handle: number, _title: string): Promise<void> {
}

export async function window_getBounds(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  if (await hasGnomeExt()) return gnomeWmGetBounds(handle);
  return { x: 0, y: 0, w: 0, h: 0 };
}

export async function window_setBounds(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmSetBounds(handle, x, y, w, h);
  }
}

export async function window_getClient(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  if (await hasGnomeExt()) return gnomeWmGetClient(handle);
  return { x: 0, y: 0, w: 0, h: 0 };
}

export async function window_setClient(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmSetBounds(handle, x, y, w, h);
  }
}

export async function window_mapToClient(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  const client = await window_getClient(handle);
  return { x: x - client.x, y: y - client.y };
}

export async function window_mapToScreen(handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  const client = await window_getClient(handle);
  return { x: x + client.x, y: y + client.y };
}

export async function window_getList(regexStr?: string): Promise<number[]> {
  const pattern = regexStr ? new RegExp(regexStr) : null;

  if (await hasGnomeExt()) {
    const windows = await gnomeWmList();
    const filtered = pattern ? windows.filter(w => pattern.test(w.title)) : windows;
    return filtered.map(w => w.id);
  }

  try {
    const windows = await atspiListWindows();
    const filtered = pattern ? windows.filter(w => pattern.test(w.name)) : windows;
    return filtered.map(w => atspiWindowHash(w.bus, w.path));
  } catch {
    return [];
  }
}

export async function window_getActive(): Promise<number> {
  if (await hasGnomeExt()) return gnomeWmGetActive();
  return 0;
}

export async function window_setActive(handle: number): Promise<void> {
  if (await hasGnomeExt()) {
    await gnomeWmActivate(handle);
  }
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  return true;
}
