/**
 * nolib[portal] mouse backend — RemoteDesktop D-Bus.
 *
 * Press/release/scroll via xdg-desktop-portal RemoteDesktop.  Pointer
 * position is unobservable through the portal API (it's write-only +
 * relative-only for security), so getPos / getButtonState / setPos are
 * stubs.
 */

import { evdevButton } from "../mouse/constants";
import {
  remoteDesktopAvailable,
  notifyPointerButton, notifyPointerAxisDiscrete,
} from "../portal/remote-desktop";

if (!remoteDesktopAvailable()) {
  throw new Error("nolib/mouse[portal]: requires Wayland session + D-Bus session bus");
}

// Portal scroll axes: 0 = vertical, 1 = horizontal
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

export async function mouse_setPos(_x: number, _y: number): Promise<void> {
  // Portal API exposes only relative motion; absolute setPos is unsupported.
}

export async function mouse_getButtonState(_button: number): Promise<boolean> {
  return false;
}
