/**
 * nolib[portal] window backend — AT-SPI2 read-only enumeration.
 *
 * Pure standard-API implementation: talks to the AT-SPI2 accessibility
 * bus that every freedesktop DE provides. Universal but read-only —
 * cannot activate, close, move, resize, minimize, maximize, or change
 * any window state. Apps that need write access on Wayland should
 * select the [gext] variant (Mechatron Shell extension).
 *
 * For write access via the standard portal API: TODO. xdg-desktop-portal
 * 1.18+ has the GlobalShortcuts and RemoteDesktop interfaces but no
 * "manage windows" portal; activating/closing windows from outside the
 * compositor isn't part of the portal API.
 */

import { atspiListWindows } from "../portal/atspi";

// Token management — accept calls so legacy callers keep compiling, but
// the [portal] variant has no privileged channel that needs a token.
let _token = "";
export function setToken(token: string): void { _token = token; }
export function getToken(): string { return _token; }

// AT-SPI handles encode bus+path as an FNV-1a hash with the high bit set
// so they can't collide with future numeric handle schemes.
function atspiWindowHash(bus: string, path: string): number {
  let h = 0x811c9dc5;
  const s = bus + path;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) | 0x80000000;
}

// ── Read-only exports ──────────────────────────────────────────────

export async function window_getList(regexStr?: string): Promise<number[]> {
  const pattern = regexStr ? new RegExp(regexStr) : null;
  try {
    const windows = await atspiListWindows();
    const filtered = pattern ? windows.filter(w => pattern.test(w.name)) : windows;
    return filtered.map(w => atspiWindowHash(w.bus, w.path));
  } catch {
    return [];
  }
}

export async function window_isValid(handle: number): Promise<boolean> {
  if (!handle) return false;
  const list = await window_getList();
  return list.includes(handle);
}

// AT-SPI2 doesn't expose any of the state queries / mutations below —
// these are deliberate stubs that match the public API shape so callers
// don't need a separate code path.

export async function window_isTopMost(_handle: number): Promise<boolean> { return false; }
export async function window_isBorderless(_handle: number): Promise<boolean> { return false; }
export async function window_isMinimized(_handle: number): Promise<boolean> { return false; }
export async function window_isMaximized(_handle: number): Promise<boolean> { return false; }
export async function window_setTopMost(_handle: number, _topMost: boolean): Promise<void> {}
export async function window_setBorderless(_handle: number, _borderless: boolean): Promise<void> {}
export async function window_setMinimized(_handle: number, _minimized: boolean): Promise<void> {}
export async function window_setMaximized(_handle: number, _maximized: boolean): Promise<void> {}
export async function window_close(_handle: number): Promise<void> {}
export async function window_setActive(_handle: number): Promise<void> {}
export async function window_setTitle(_handle: number, _title: string): Promise<void> {}
export async function window_setBounds(_handle: number, _x: number, _y: number, _w: number, _h: number): Promise<void> {}
export async function window_setClient(_handle: number, _x: number, _y: number, _w: number, _h: number): Promise<void> {}

export async function window_getProcess(_handle: number): Promise<number> { return 0; }
export async function window_getPID(_handle: number): Promise<number> { return 0; }
export function window_getHandle(handle: number): number { return handle; }
export async function window_setHandle(_handle: number, newHandle: number): Promise<boolean> {
  if (newHandle === 0) return true;
  return window_isValid(newHandle);
}
export async function window_getTitle(_handle: number): Promise<string> { return ""; }
export async function window_getBounds(_handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  return { x: 0, y: 0, w: 0, h: 0 };
}
export async function window_getClient(_handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  return { x: 0, y: 0, w: 0, h: 0 };
}
export async function window_mapToClient(_handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  return { x, y };
}
export async function window_mapToScreen(_handle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  return { x, y };
}
export async function window_getActive(): Promise<number> { return 0; }
export function window_isAxEnabled(_prompt?: boolean): boolean { return true; }
