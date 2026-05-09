/**
 * ffi[portal] screen backend — PipeWire capture via bun:ffi.
 *
 * Mirrors napi[portal]: dlopens libpipewire-0.3.so.0 and captures
 * frames through the ScreenCast portal.  The actual PipeWire calls
 * run in a dedicated worker (screen-portal-worker.ts).
 */

import { getBunFFI } from "./bun";
import { createDispatcher } from "./_dispatch";

if (process.platform !== "linux") {
  throw new Error("ffi/screen[portal]: linux-only");
}

const isWayland = !!process.env.WAYLAND_DISPLAY
  || (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland";
if (!isWayland) {
  throw new Error("ffi/screen[portal]: requires Wayland session");
}

const F = getBunFFI();
if (!F) throw new Error("ffi/screen[portal]: bun:ffi not available");
let hasPw = false;
try {
  const h = F.dlopen("libpipewire-0.3.so.0", {
    pw_init: { args: [F.FFIType.i64, F.FFIType.i64], returns: F.FFIType.void },
  });
  h.close();
  hasPw = true;
} catch {
  try {
    const h = F.dlopen("libpipewire-0.3.so", {
      pw_init: { args: [F.FFIType.i64, F.FFIType.i64], returns: F.FFIType.void },
    });
    h.close();
    hasPw = true;
  } catch { /* neither available */ }
}
if (!hasPw) {
  throw new Error("ffi/screen[portal]: requires libpipewire-0.3.so.0");
}

const d = createDispatcher(require.resolve("./screen-portal-worker"));

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

export const screen_synchronize = (): Promise<ScreenInfo[] | null> =>
  d.call("screen_synchronize", []);
export const screen_grabScreen = (
  x: number, y: number, w: number, h: number,
): Promise<Uint32Array | null> =>
  d.call("screen_grabScreen", [x, y, w, h]);
export const screen_getPortalToken = (): Promise<string | null> =>
  d.call("screen_getPortalToken", []);
export const screen_setPortalToken = (token: string | null): Promise<void> =>
  d.call("screen_setPortalToken", [token]);
