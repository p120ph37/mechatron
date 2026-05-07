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

export async function window_isValid(handle: bigint): Promise<boolean> {
  await ensureAvailable();
  const h = Number(handle);
  const windows = await gextWinList();
  return windows.some(w => w.id === h);
}

export async function window_close(handle: bigint): Promise<void> {
  await ensureAvailable();
  await gextWinClose(Number(handle));
}

export async function window_isTopMost(handle: bigint): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsAbove(Number(handle));
}

export async function window_isBorderless(_handle: bigint): Promise<boolean> {
  // Mutter doesn't expose CSD/borderless state in a way that's portable
  // across themes; the extension would need to inspect Meta.Window.frame
  // structure. TODO if we need it.
  return false;
}

export async function window_isMinimized(handle: bigint): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsMinimized(Number(handle));
}

export async function window_isMaximized(handle: bigint): Promise<boolean> {
  await ensureAvailable();
  return gextWinIsMaximized(Number(handle));
}

export async function window_setTopMost(handle: bigint, topMost: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetAbove(Number(handle), topMost);
}

export async function window_setBorderless(_handle: bigint, _borderless: boolean): Promise<void> {
  // See window_isBorderless.
}

export async function window_setMinimized(handle: bigint, minimized: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetMinimized(Number(handle), minimized);
}

export async function window_setMaximized(handle: bigint, maximized: boolean): Promise<void> {
  await ensureAvailable();
  await gextWinSetMaximized(Number(handle), maximized);
}

export async function window_getProcess(handle: bigint): Promise<number> {
  return window_getPID(handle);
}

export async function window_getPID(handle: bigint): Promise<number> {
  await ensureAvailable();
  return gextWinGetPID(Number(handle));
}

export function window_getHandle(handle: bigint): bigint { return handle; }

export async function window_setHandle(_handle: bigint, newHandle: bigint): Promise<boolean> {
  if (newHandle === 0n) return true;
  return window_isValid(newHandle);
}

export async function window_getTitle(handle: bigint): Promise<string> {
  await ensureAvailable();
  return gextWinGetTitle(Number(handle));
}

export async function window_setTitle(_handle: bigint, _title: string): Promise<void> {
  // Meta.Window doesn't allow client-side title changes; this is a
  // protocol-level limitation rather than something the extension could
  // patch around.
}

export async function window_getBounds(handle: bigint): Promise<{ x: number; y: number; w: number; h: number }> {
  await ensureAvailable();
  return gextWinGetBounds(Number(handle));
}

export async function window_setBounds(handle: bigint, x: number, y: number, w: number, h: number): Promise<void> {
  await ensureAvailable();
  await gextWinSetBounds(Number(handle), x, y, w, h);
}

export async function window_getClient(handle: bigint): Promise<{ x: number; y: number; w: number; h: number }> {
  await ensureAvailable();
  return gextWinGetClient(Number(handle));
}

export async function window_setClient(handle: bigint, x: number, y: number, w: number, h: number): Promise<void> {
  await ensureAvailable();
  await gextWinSetBounds(Number(handle), x, y, w, h);
}

export async function window_mapToClient(handle: bigint, x: number, y: number): Promise<{ x: number; y: number }> {
  const client = await window_getClient(handle);
  return { x: x - client.x, y: y - client.y };
}

export async function window_mapToScreen(handle: bigint, x: number, y: number): Promise<{ x: number; y: number }> {
  const client = await window_getClient(handle);
  return { x: x + client.x, y: y + client.y };
}

export async function window_getList(regexStr?: string): Promise<bigint[]> {
  await ensureAvailable();
  const pattern = regexStr ? new RegExp(regexStr) : null;
  const windows = await gextWinList();
  const filtered = pattern ? windows.filter(w => pattern.test(w.title)) : windows;
  return filtered.map(w => BigInt(w.id));
}

export async function window_getActive(): Promise<bigint> {
  await ensureAvailable();
  return BigInt(await gextWinGetActive());
}

export async function window_setActive(handle: bigint): Promise<void> {
  await ensureAvailable();
  await gextWinActivate(Number(handle));
}

export function window_isAxEnabled(_prompt?: boolean): boolean {
  return true;
}
