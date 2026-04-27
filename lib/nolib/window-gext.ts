/**
 * nolib[gext] window backend — Mechatron GNOME Shell extension D-Bus client.
 *
 * Talks to the dev.mechatronic.Shell extension installed in GNOME Shell;
 * the extension calls Meta.Window directly so we get the full window
 * management surface (activate, close, move, resize, minimize/maximize/
 * above, list, get title/PID/bounds) on Wayland/GNOME without permission
 * popups — much higher capability than the standard xdg-desktop-portal.
 *
 * Distinct from nolib[portal] which is the read-only AT-SPI fallback
 * working on any DE. Selecting between them lets callers explicitly
 * trade off "portal popups but works everywhere" against "no popups,
 * GNOME-only, requires our extension installed".
 */

import {
  gextWinAvailable, gextWinList, gextWinGetActive, gextWinActivate,
  gextWinClose, gextWinGetTitle, gextWinGetBounds, gextWinSetBounds,
  gextWinGetClient, gextWinSetMinimized, gextWinSetMaximized,
  gextWinSetAbove, gextWinIsMinimized, gextWinIsMaximized,
  gextWinIsAbove, gextWinGetPID,
} from "../gext/window";

// Token management re-exports — apps that need a custom token can call
// these; otherwise the env-default in lib/gext/window.ts kicks in.
export { gextWinSetToken as setToken, gextWinGetToken as getToken } from "../gext/window";

// Throw at load time if the extension isn't reachable on the session bus —
// the resolver will then cascade to nolib[portal] (AT-SPI) or nolib[x11].
let _checked = false;
async function ensureAvailable(): Promise<void> {
  if (_checked) return;
  _checked = true;
  const ok = await gextWinAvailable();
  if (!ok) throw new Error("nolib/window[gext]: dev.mechatronic.Shell extension not on session bus");
}

export async function window_isValid(handle: number): Promise<boolean> {
  await ensureAvailable();
  const windows = await gextWinList();
  return windows.some(w => w.id === handle);
}

export async function window_close(handle: number): Promise<void> {
  await ensureAvailable();
  await gextWinClose(handle);
}

export async function window_isTopMost(handle: number): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsAbove(handle);
}

export async function window_isBorderless(_handle: number): Promise<boolean> {
  // Mutter doesn't expose CSD/borderless state in a way that's portable
  // across themes; the extension would need to inspect Meta.Window.frame
  // structure. TODO if we need it.
  return false;
}

export async function window_isMinimized(handle: number): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsMinimized(handle);
}

export async function window_isMaximized(handle: number): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsMaximized(handle);
}

export async function window_setTopMost(handle: number, topMost: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetAbove(handle, topMost);
}

export async function window_setBorderless(_handle: number, _borderless: boolean): Promise<void> {
  // See window_isBorderless.
}

export async function window_setMinimized(handle: number, minimized: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetMinimized(handle, minimized);
}

export async function window_setMaximized(handle: number, maximized: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetMaximized(handle, maximized);
}

export async function window_getProcess(handle: number): Promise<number> {
  return window_getPID(handle);
}

export async function window_getPID(handle: number): Promise<number> {
  await ensureAvailable();
  return gextWinGetPID(handle);
}

export function window_getHandle(handle: number): number { return handle; }

export async function window_setHandle(_handle: number, newHandle: number): Promise<boolean> {
  if (newHandle === 0) return true;
  return window_isValid(newHandle);
}

export async function window_getTitle(handle: number): Promise<string> {
  await ensureAvailable();
  return gextWinGetTitle(handle);
}

export async function window_setTitle(_handle: number, _title: string): Promise<void> {
  // Meta.Window doesn't allow client-side title changes; this is a
  // protocol-level limitation rather than something the extension could
  // patch around.
}

export async function window_getBounds(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  await ensureAvailable();
  return gextWinGetBounds(handle);
}

export async function window_setBounds(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  await ensureAvailable();
  await gextWinSetBounds(handle, x, y, w, h);
}

export async function window_getClient(handle: number): Promise<{ x: number; y: number; w: number; h: number }> {
  await ensureAvailable();
  return gextWinGetClient(handle);
}

export async function window_setClient(handle: number, x: number, y: number, w: number, h: number): Promise<void> {
  await ensureAvailable();
  await gextWinSetBounds(handle, x, y, w, h);
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
  await ensureAvailable();
  const pattern = regexStr ? new RegExp(regexStr) : null;
  const windows = await gextWinList();
  const filtered = pattern ? windows.filter(w => pattern.test(w.title)) : windows;
  return filtered.map(w => w.id);
}

export async function window_getActive(): Promise<number> {
  await ensureAvailable();
  return gextWinGetActive();
}

export async function window_setActive(handle: number): Promise<void> {
  await ensureAvailable();
  await gextWinActivate(handle);
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  return true;
}
