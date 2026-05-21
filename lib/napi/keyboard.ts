/**
 * napi keyboard backend — base loader for non-Linux platforms.
 *
 * macOS / Windows have a single OS-native input API with no variant
 * fan-out, so this file directly loads `mechatron-keyboard.<platform>.node`
 * from the @mechatronic/napi-keyboard package.
 *
 * On Linux the package instead ships variant-specific binaries
 * (mechatron-keyboard-x11, mechatron-keyboard-portal) which are loaded
 * by lib/napi/keyboard-x11.ts and lib/napi/keyboard-portal.ts.  This
 * base file is reached only as a fallback for an unsupported variant
 * (e.g. an explicit napi[vt] request); throw at load so the dispatcher
 * in lib/backend.ts moves on to the next backend.
 */

import { loadNapi } from "./resolve";

if (process.platform === "linux") {
  throw new Error("napi/keyboard: Linux requires a variant — use napi[x11] or napi[portal]");
}

const native = loadNapi("keyboard");

export const keyboard_press: (keycode: number) => Promise<void> = native.keyboard_press;
export const keyboard_release: (keycode: number) => Promise<void> = native.keyboard_release;
export const keyboard_getKeyState: (keycode: number) => Promise<boolean> = native.keyboard_getKeyState;
