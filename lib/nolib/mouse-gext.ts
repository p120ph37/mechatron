/**
 * nolib[gext] mouse backend — Clutter virtual device via D-Bus.
 *
 * Routes pointer events through the Mechatron GNOME Shell extension's
 * Input interface. Unlike the portal variant, gext supports absolute
 * positioning and pointer queries via global.get_pointer().
 */

import { evdevButton } from "../mouse/constants";
import {
  gextPointerButton, gextPointerAxisDiscrete,
  gextPointerMotionAbsolute, gextGetPointerPos,
} from "../gext/input";

const AXIS_VERTICAL = 0;
const AXIS_HORIZONTAL = 1;

export async function mouse_press(button: number): Promise<void> {
  const code = evdevButton(button);
  if (code !== null) await gextPointerButton(code, true);
}

export async function mouse_release(button: number): Promise<void> {
  const code = evdevButton(button);
  if (code !== null) await gextPointerButton(code, false);
}

export async function mouse_scrollH(amount: number): Promise<void> {
  return gextPointerAxisDiscrete(AXIS_HORIZONTAL, amount);
}

export async function mouse_scrollV(amount: number): Promise<void> {
  return gextPointerAxisDiscrete(AXIS_VERTICAL, amount);
}

export async function mouse_getPos(): Promise<{ x: number; y: number }> {
  return gextGetPointerPos();
}

export async function mouse_setPos(x: number, y: number): Promise<void> {
  return gextPointerMotionAbsolute(x, y);
}

export async function mouse_getButtonState(_button: number): Promise<boolean> {
  return false;
}
