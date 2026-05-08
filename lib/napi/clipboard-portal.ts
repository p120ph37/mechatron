/**
 * napi clipboard backend (portal variant) — Linux-only.
 *
 * Loads the mechatron-clipboard-portal.<platform>.node binary out of the
 * @mechatronic/napi-clipboard package.  The binary has no NEEDED libs
 * other than libc — libwayland-client is dlopen'd lazily inside
 * clipboard_wl.rs — so it loads without Wayland present.  The clipboard
 * ops then fail at call time on systems without WAYLAND_DISPLAY, which
 * the dispatcher in lib/backend.ts treats as a runtime miss.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("clipboard", "portal");

export const clipboard_clear: () => Promise<boolean> = native.clipboard_clear;
export const clipboard_hasText: () => Promise<boolean> = native.clipboard_hasText;
export const clipboard_getText: () => Promise<string> = native.clipboard_getText;
export const clipboard_setText: (text: string) => Promise<boolean> = native.clipboard_setText;
export const clipboard_hasImage: () => Promise<boolean> = native.clipboard_hasImage;
export const clipboard_getImage: () => Promise<{ width: number; height: number; data: Uint32Array } | undefined> = native.clipboard_getImage;
export const clipboard_setImage: (width: number, height: number, data: Uint32Array) => Promise<boolean> = native.clipboard_setImage;
export const clipboard_getSequence: () => Promise<number> = native.clipboard_getSequence;
