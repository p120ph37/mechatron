/**
 * napi clipboard backend — base loader for non-Linux platforms.
 *
 * macOS / Windows have a single OS-native clipboard with no variant
 * fan-out, so this file directly loads `mechatron-clipboard.<platform>.node`
 * from the @mechatronic/napi-clipboard package.
 *
 * On Linux the package instead ships variant-specific binaries
 * (mechatron-clipboard-x11, mechatron-clipboard-portal) which are loaded
 * by lib/napi/clipboard-x11.ts and lib/napi/clipboard-portal.ts.  This
 * base file is reached only as a fallback for an unsupported variant
 * (e.g. an explicit napi[vt] request); throw at load so the dispatcher
 * in lib/backend.ts moves on to the next backend.
 */

import { loadNapi } from "./resolve";

if (process.platform === "linux") {
  throw new Error("napi/clipboard: Linux requires a variant — use napi[x11] or napi[portal]");
}

const native = loadNapi("clipboard");

export const clipboard_clear: () => Promise<boolean> = native.clipboard_clear;
export const clipboard_hasText: () => Promise<boolean> = native.clipboard_hasText;
export const clipboard_getText: () => Promise<string> = native.clipboard_getText;
export const clipboard_setText: (text: string) => Promise<boolean> = native.clipboard_setText;
export const clipboard_hasImage: () => Promise<boolean> = native.clipboard_hasImage;
export const clipboard_getImage: () => Promise<{ width: number; height: number; data: Uint32Array } | undefined> = native.clipboard_getImage;
export const clipboard_setImage: (width: number, height: number, data: Uint32Array) => Promise<boolean> = native.clipboard_setImage;
export const clipboard_getSequence: () => Promise<number> = native.clipboard_getSequence;
