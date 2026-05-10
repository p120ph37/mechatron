/**
 * napi clipboard backend (portal variant) — Linux-only.
 *
 * Loads the mechatron-clipboard-portal.<platform>.node binary which links
 * libwayland-client directly.  Autodetects Wayland flavor at init:
 * zwlr_data_control_v1 (wlroots) or core wl_data_device (GNOME/Mutter).
 * If libwayland-client is absent the binary fails to load and the
 * dispatcher in lib/backend.ts moves to the next backend.
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
