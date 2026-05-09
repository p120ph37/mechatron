/**
 * ffi[portal] mouse backend — RemoteDesktop D-Bus.
 *
 * Mirrors the linux-napi[portal] surface (which uses a Rust binary
 * with libei) by routing pointer ops through the same
 * xdg-desktop-portal RemoteDesktop methods that
 * lib/nolib/mouse-portal.ts uses.  getPos / getButtonState are
 * unavailable through the portal (write-only API); setPos uses
 * absolute notify.
 */

import { evdevButton } from "../mouse/constants";
import {
  remoteDesktopAvailable,
  notifyPointerButton, notifyPointerAxisDiscrete,
  notifyPointerMotionAbsolute,
} from "../portal/remote-desktop";

if (!remoteDesktopAvailable()) {
  throw new Error("ffi/mouse[portal]: requires Wayland session + D-Bus session bus");
}

const AXIS_VERTICAL = 0;
const AXIS_HORIZONTAL = 1;

export async function mouse_press(button: number): Promise<void> {
  const code = evdevButton(button);
  if (code !== null) await notifyPointerButton(code, true);
}

export async function mouse_release(button: number): Promise<void> {
  const code = evdevButton(button);
  if (code !== null) await notifyPointerButton(code, false);
}

export async function mouse_scrollH(amount: number): Promise<void> {
  return notifyPointerAxisDiscrete(AXIS_HORIZONTAL, amount);
}

export async function mouse_scrollV(amount: number): Promise<void> {
  return notifyPointerAxisDiscrete(AXIS_VERTICAL, amount);
}

export async function mouse_getPos(): Promise<{ x: number; y: number }> {
  return { x: 0, y: 0 };
}

export async function mouse_setPos(x: number, y: number): Promise<void> {
  await notifyPointerMotionAbsolute(x, y);
}

export async function mouse_getButtonState(_button: number): Promise<boolean> {
  return false;
}
