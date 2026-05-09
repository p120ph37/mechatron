/**
 * ffi[portal] keyboard backend — libei via bun:ffi.
 *
 * Mirrors napi[portal]: dlopens libei.so.1 and uses the Emulated Input
 * protocol over an EIS fd obtained from the RemoteDesktop portal.
 * The actual libei calls run in a shared worker (ei-worker.ts).
 */

import { getBunFFI } from "./bun";

if (process.platform !== "linux") {
  throw new Error("ffi/keyboard[portal]: linux-only");
}

const isWayland = !!process.env.WAYLAND_DISPLAY
  || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
if (!isWayland) {
  throw new Error("ffi/keyboard[portal]: requires Wayland session");
}

const F = getBunFFI();
if (!F) throw new Error("ffi/keyboard[portal]: bun:ffi not available");
try {
  const h = F.dlopen("libei.so.1", {
    ei_new_sender: { args: [F.FFIType.i64], returns: F.FFIType.i64 },
  });
  h.close();
} catch {
  throw new Error("ffi/keyboard[portal]: requires libei.so.1");
}

import { getEiDispatcher } from "./ei-shared";

const d = getEiDispatcher();

export const keyboard_press = (keycode: number): Promise<void> =>
  d.call("keyboard_press", [keycode]);
export const keyboard_release = (keycode: number): Promise<void> =>
  d.call("keyboard_release", [keycode]);
export const keyboard_getKeyState = (keycode: number): Promise<boolean> =>
  d.call("keyboard_getKeyState", [keycode]);
