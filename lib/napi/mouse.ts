/**
 * napi mouse backend — base loader for non-Linux platforms.
 *
 * macOS / Windows have a single OS-native input API with no variant
 * fan-out, so this file directly loads `mechatron-mouse.<platform>.node`
 * from the @mechatronic/napi-mouse package.
 *
 * On Linux the package instead ships variant-specific binaries
 * (mechatron-mouse-x11, mechatron-mouse-portal) which are loaded by
 * lib/napi/mouse-x11.ts and lib/napi/mouse-portal.ts.  This base file is
 * reached only as a fallback for an unsupported variant (e.g. an explicit
 * napi[vt] request); throw at load so the dispatcher in lib/backend.ts
 * moves on to the next backend.
 */

import { loadNapi } from "./resolve";

if (process.platform === "linux") {
  throw new Error("napi/mouse: Linux requires a variant — use napi[x11] or napi[portal]");
}

const native = loadNapi("mouse");

export const mouse_press: (button: number) => Promise<void> = native.mouse_press;
export const mouse_release: (button: number) => Promise<void> = native.mouse_release;
export const mouse_scrollH: (amount: number) => Promise<void> = native.mouse_scrollH;
export const mouse_scrollV: (amount: number) => Promise<void> = native.mouse_scrollV;
export const mouse_getPos: () => Promise<{ x: number; y: number }> = native.mouse_getPos;
export const mouse_setPos: (x: number, y: number) => Promise<void> = native.mouse_setPos;
export const mouse_getButtonState: (button: number) => Promise<boolean> = native.mouse_getButtonState;
