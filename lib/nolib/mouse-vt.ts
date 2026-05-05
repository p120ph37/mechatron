/**
 * nolib[vt] mouse backend — /dev/uinput via ioctl bridge.
 *
 * Press/release/scroll via uinput; setPos uses an emulated digitizer
 * (EV_ABS, 0–65535 range) with screen dimensions from the framebuffer.
 * getPos / getButtonState are unavailable (uinput is write-only).
 */

import {
  nolibUinputAvailable,
  injectMouseButton, injectScrollV, injectScrollH,
  injectAbsMotion, UINPUT_ABS_MAX,
} from "./uinput";
import { ioctlSync, ioctlBridgeAvailable } from "./ioctl";
import {
  FRAMEBUFFER_DEV, FBIOGET_VSCREENINFO,
  framebufferAvailable, parseFbVarScreenInfo,
} from "../screen/framebuffer";

if (!nolibUinputAvailable()) {
  throw new Error("nolib/mouse[vt]: requires /dev/uinput");
}

let _fbScreenDims: { w: number; h: number } | null | undefined;
function getFbScreenDims(): { w: number; h: number } | null {
  if (_fbScreenDims !== undefined) return _fbScreenDims;
  if (!ioctlBridgeAvailable() || !framebufferAvailable()) {
    _fbScreenDims = null;
    return null;
  }
  const result = ioctlSync(FRAMEBUFFER_DEV, [
    { request: FBIOGET_VSCREENINFO, data: Buffer.alloc(160) },
  ]);
  if (!result || result.outputs.length < 1) { _fbScreenDims = null; return null; }
  const geom = parseFbVarScreenInfo(result.outputs[0]);
  if (geom.width === 0 || geom.height === 0) { _fbScreenDims = null; return null; }
  _fbScreenDims = { w: geom.width, h: geom.height };
  return _fbScreenDims;
}

export async function mouse_press(button: number): Promise<void> {
  injectMouseButton(button, true);
}

export async function mouse_release(button: number): Promise<void> {
  injectMouseButton(button, false);
}

export async function mouse_scrollH(amount: number): Promise<void> {
  injectScrollH(amount);
}

export async function mouse_scrollV(amount: number): Promise<void> {
  injectScrollV(amount);
}

export async function mouse_getPos(): Promise<{ x: number; y: number }> {
  return { x: 0, y: 0 };
}

export async function mouse_setPos(x: number, y: number): Promise<void> {
  const dims = getFbScreenDims();
  if (!dims || dims.w <= 0 || dims.h <= 0) return;
  const absX = Math.round((x * UINPUT_ABS_MAX) / dims.w);
  const absY = Math.round((y * UINPUT_ABS_MAX) / dims.h);
  injectAbsMotion(absX, absY);
}

export async function mouse_getButtonState(_button: number): Promise<boolean> {
  return false;
}
