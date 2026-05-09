/**
 * ffi[portal] mouse backend — libei via bun:ffi.
 *
 * Mirrors napi[portal]: dlopens libei.so.1 and uses the Emulated Input
 * protocol over an EIS fd obtained from the RemoteDesktop portal.
 * The actual libei calls run in a shared worker (ei-worker.ts).
 */

import { getBunFFI } from "./bun";

if (process.platform !== "linux") {
  throw new Error("ffi/mouse[portal]: linux-only");
}

const isWayland = !!process.env.WAYLAND_DISPLAY
  || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
if (!isWayland) {
  throw new Error("ffi/mouse[portal]: requires Wayland session");
}

const F = getBunFFI();
if (!F) throw new Error("ffi/mouse[portal]: bun:ffi not available");
try {
  const h = F.dlopen("libei.so.1", {
    ei_new_sender: { args: [F.FFIType.i64], returns: F.FFIType.i64 },
  });
  h.close();
} catch {
  throw new Error("ffi/mouse[portal]: requires libei.so.1");
}

import { getEiDispatcher } from "./ei-shared";

const d = getEiDispatcher();

export const mouse_press = (button: number): Promise<void> =>
  d.call("mouse_press", [button]);
export const mouse_release = (button: number): Promise<void> =>
  d.call("mouse_release", [button]);
export const mouse_scrollH = (amount: number): Promise<void> =>
  d.call("mouse_scrollH", [amount]);
export const mouse_scrollV = (amount: number): Promise<void> =>
  d.call("mouse_scrollV", [amount]);
export const mouse_getPos = (): Promise<{ x: number; y: number }> =>
  d.call("mouse_getPos", []);
export const mouse_setPos = (x: number, y: number): Promise<void> =>
  d.call("mouse_setPos", [x, y]);
export const mouse_getButtonState = (button: number): Promise<boolean> =>
  d.call("mouse_getButtonState", [button]);
